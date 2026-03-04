import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import type { User } from "@prisma/client";

type AuthSuccess = { user: User };
type AuthFailure = { response: NextResponse };

export async function requireUser(
  request: NextRequest,
): Promise<AuthSuccess | AuthFailure> {
  const token = request.cookies.get("access_token")?.value;

  if (!token || token === "") {
    return {
      response: NextResponse.json(
        { error: "인증이 필요합니다" },
        { status: 401 },
      ),
    };
  }

  let userId: string;
  try {
    const payload = verifyToken(token);
    if (payload.type !== "access") {
      return {
        response: NextResponse.json(
          { error: "유효하지 않은 토큰 타입입니다" },
          { status: 401 },
        ),
      };
    }
    userId = payload.userId;
  } catch {
    return {
      response: NextResponse.json(
        { error: "유효하지 않은 토큰입니다" },
        { status: 401 },
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "사용자를 찾을 수 없습니다" },
        { status: 401 },
      ),
    };
  }

  return { user };
}

export function isAuthFailure(
  result: AuthSuccess | AuthFailure,
): result is AuthFailure {
  return "response" in result;
}
