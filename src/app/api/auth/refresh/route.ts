import { NextRequest, NextResponse } from "next/server";
import { generateAccessToken, verifyToken } from "@/lib/auth/jwt";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // refresh_token 쿠키 추출
  const refreshTokenCookie = request.cookies.get("refresh_token");
  const refreshToken = refreshTokenCookie?.value;

  if (!refreshToken || refreshToken.trim() === "") {
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
      { error: "유효하지 않은 refresh_token입니다" },
      { status: 401 }
    );
  }

  // 토큰 타입 확인
  if (payload.type !== "refresh") {
    return NextResponse.json(
      { error: "유효하지 않은 토큰 타입입니다" },
      { status: 401 }
    );
  }

  // 새 Access Token 생성
  const newAccessToken = generateAccessToken(payload.userId);

  // 응답 구성
  const response = NextResponse.json(
    { message: "토큰이 갱신되었습니다" },
    { status: 200 }
  );

  response.headers.append(
    "Set-Cookie",
    `access_token=${newAccessToken}; HttpOnly; Path=/; SameSite=Lax`
  );

  return response;
}
