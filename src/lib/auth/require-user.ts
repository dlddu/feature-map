import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import type { User } from "@prisma/client";

type RequireUserResult =
  | { user: User; error: null }
  | { user: null; error: NextResponse };

export async function requireUser(request: NextRequest): Promise<RequireUserResult> {
  const token = request.cookies.get("access_token")?.value;

  if (!token || token === "") {
    return {
      user: null,
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
        user: null,
        error: NextResponse.json(
          { error: "유효하지 않은 토큰 타입입니다" },
          { status: 401 }
        ),
      };
    }
    userId = payload.userId;
  } catch {
    return {
      user: null,
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
      user: null,
      error: NextResponse.json(
        { error: "사용자를 찾을 수 없습니다" },
        { status: 401 }
      ),
    };
  }

  return { user, error: null };
}
