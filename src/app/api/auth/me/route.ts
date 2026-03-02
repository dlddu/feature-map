import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 쿠키에서 access_token 추출
  const token = request.cookies.get("access_token")?.value;

  if (!token || token === "") {
    return NextResponse.json(
      { error: "인증이 필요합니다" },
      { status: 401 }
    );
  }

  // 토큰 검증
  let userId: string;
  try {
    const payload = verifyToken(token);
    if (payload.type !== "access") {
      return NextResponse.json(
        { error: "유효하지 않은 토큰 타입입니다" },
        { status: 401 }
      );
    }
    userId = payload.userId;
  } catch {
    return NextResponse.json(
      { error: "유효하지 않은 토큰입니다" },
      { status: 401 }
    );
  }

  // DB에서 사용자 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      login: true,
      avatarUrl: true,
      installationId: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "사용자를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  return NextResponse.json({ user }, { status: 200 });
}
