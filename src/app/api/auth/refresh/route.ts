import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, verifyToken } from "@/lib/auth/jwt";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 쿠키에서 refresh_token 읽기
  const refreshTokenCookie = request.cookies.get("refresh_token");
  const refreshToken = refreshTokenCookie?.value;

  if (!refreshToken || refreshToken === "") {
    return NextResponse.json(
      { error: "refresh_token이 없습니다" },
      { status: 401 }
    );
  }

  // 토큰 검증
  let payload;
  try {
    payload = verifyToken(refreshToken);
  } catch {
    return NextResponse.json(
      { error: "유효하지 않은 토큰입니다" },
      { status: 401 }
    );
  }

  // 토큰 타입 확인
  if (payload.type !== "refresh") {
    return NextResponse.json(
      { error: "올바른 토큰 타입이 아닙니다" },
      { status: 401 }
    );
  }

  // 유저 조회
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user) {
    return NextResponse.json(
      { error: "유저를 찾을 수 없습니다" },
      { status: 401 }
    );
  }

  // 새 access token 발급
  const newAccessToken = generateAccessToken(payload.userId);

  // 응답 구성
  const response = NextResponse.json(
    { accessToken: newAccessToken },
    { status: 200 }
  );

  // access_token 쿠키 설정
  response.headers.set(
    "Set-Cookie",
    `access_token=${newAccessToken}; Path=/; SameSite=Lax`
  );

  return response;
}
