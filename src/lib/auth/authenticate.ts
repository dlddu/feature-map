import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { User } from "@prisma/client";

type AuthSuccess = { user: User };
type AuthFailure = { error: NextResponse };
type AuthResult = AuthSuccess | AuthFailure;

export function isAuthError(result: AuthResult): result is AuthFailure {
  return "error" in result;
}

/**
 * 요청에서 쿠키 기반 인증을 수행하고 사용자 정보를 반환합니다.
 * 인증 실패 시 적절한 에러 응답을 반환합니다.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<AuthResult> {
  const token = request.cookies.get("access_token")?.value;

  if (!token || token === "") {
    return {
      error: NextResponse.json(
        { error: "인증이 필요합니다" },
        { status: 401 }
      ),
    };
  }

  let userId: string;
  try {
    const payload = verifyToken(token);
    if (payload.type !== "access") {
      return {
        error: NextResponse.json(
          { error: "유효하지 않은 토큰 타입입니다" },
          { status: 401 }
        ),
      };
    }
    userId = payload.userId;
  } catch {
    return {
      error: NextResponse.json(
        { error: "유효하지 않은 토큰입니다" },
        { status: 401 }
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "사용자를 찾을 수 없습니다" },
        { status: 401 }
      ),
    };
  }

  return { user };
}
