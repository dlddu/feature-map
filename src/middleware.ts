import { NextRequest, NextResponse } from "next/server";
import {
  verifyTokenEdge,
  generateAccessTokenEdge,
} from "@/lib/auth/jwt-edge";

// 공개 경로 목록 (미들웨어 적용 제외)
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/github",
  "/api/auth/test-login",
  "/api/health",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (publicPath) =>
      publicPath !== "/" &&
      (pathname === publicPath || pathname.startsWith(publicPath + "/"))
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = new URL(request.url);

  // 공개 경로는 미들웨어 적용 제외
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // access_token 쿠키 읽기
  const accessTokenCookie = request.cookies.get("access_token");
  const accessToken = accessTokenCookie?.value;

  // access_token이 없거나 빈 문자열이면 리다이렉트
  if (!accessToken || accessToken === "") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // access_token 검증 시도
  try {
    await verifyTokenEdge(accessToken);
    // 검증 성공
    return NextResponse.next();
  } catch {
    // 검증 실패 — refresh_token으로 재발급 시도
    const refreshTokenCookie = request.cookies.get("refresh_token");
    const refreshToken = refreshTokenCookie?.value;

    // refresh_token도 없으면 통과 (access_token은 존재하므로 API가 인증 처리)
    if (!refreshToken) {
      return NextResponse.next();
    }

    // refresh token을 직접 검증하여 새 access token 발급
    try {
      const payload = await verifyTokenEdge(refreshToken);

      if (payload.type !== "refresh") {
        return NextResponse.next();
      }

      const newAccessToken = await generateAccessTokenEdge(payload.userId);

      // 새 access_token을 쿠키에 설정하고 동일 URL로 리다이렉트
      // redirect 응답의 Set-Cookie는 브라우저가 반드시 처리하므로
      // NextResponse.next()보다 쿠키 전파가 확실함
      const response = NextResponse.redirect(new URL(request.url));
      response.cookies.set("access_token", newAccessToken, {
        path: "/",
        sameSite: "lax",
      });
      return response;
    } catch {
      // refresh token 검증 실패 시 통과
      return NextResponse.next();
    }
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
