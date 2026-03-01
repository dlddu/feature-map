import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 쿠키에서 refresh_token 읽기
  const refreshTokenCookie = request.cookies.get("refresh_token");
  const refreshToken = refreshTokenCookie?.value;

  // refresh_token이 있으면 검증 후 DB 업데이트 시도
  if (refreshToken) {
    try {
      const payload = verifyToken(refreshToken);
      // 검증 성공 시 DB의 refreshToken 필드를 null로 업데이트
      await prisma.user.update({
        where: { id: payload.userId },
        data: { refreshToken: null },
      });
    } catch {
      // 검증 실패 시 DB 업데이트 안 함 (멱등성)
    }
  }

  // 항상 쿠키 삭제 헤더 설정
  const response = NextResponse.json(
    { message: "로그아웃되었습니다" },
    { status: 200 }
  );

  // access_token, refresh_token 쿠키 삭제 (두 쿠키 모두 만료 처리)
  const expiredDate = "Thu, 01 Jan 1970 00:00:00 GMT";
  response.headers.append(
    "Set-Cookie",
    `access_token=; Path=/; SameSite=Lax; Expires=${expiredDate}`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=; HttpOnly; Path=/; SameSite=Lax; Expires=${expiredDate}`
  );

  return response;
}
