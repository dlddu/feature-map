import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";

// 공개 경로 목록 (미들웨어 적용 제외)
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/github",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (publicPath) =>
      pathname === publicPath || pathname.startsWith(publicPath + "/")
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
    verifyToken(accessToken);
    // 검증 성공
    return NextResponse.next();
  } catch {
    // 검증 실패 — refresh_token으로 재발급 시도
    const refreshTokenCookie = request.cookies.get("refresh_token");
    const refreshToken = refreshTokenCookie?.value;

    // refresh_token도 없으면 바로 리다이렉트
    if (!refreshToken) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // refresh 시도
    try {
      const refreshResponse = await fetch(
        new URL("/api/auth/refresh", request.url).toString(),
        {
          method: "POST",
          headers: { Cookie: `refresh_token=${refreshToken}` },
        }
      );

      if (!refreshResponse.ok) {
        return NextResponse.redirect(new URL("/login", request.url));
      }

      const data = await refreshResponse.json();
      const newAccessToken = data.accessToken;

      // 새 access_token 설정 후 통과
      const response = NextResponse.next();
      response.headers.set(
        "Set-Cookie",
        `access_token=${newAccessToken}; Path=/; SameSite=Lax`
      );
      return response;
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }
}
