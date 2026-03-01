import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.json(
    { message: "로그아웃 되었습니다" },
    { status: 200 }
  );

  // 두 쿠키 모두 Max-Age=0으로 삭제
  response.headers.append(
    "Set-Cookie",
    `access_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  );

  return response;
}
