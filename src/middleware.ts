import { NextRequest, NextResponse } from "next/server";
import { generateAccessToken, verifyToken } from "@/lib/auth/jwt";

// 인증 없이 접근 가능한 공개 경로
const PUBLIC_PATHS = ["/", "/login", "/signup"];
const PUBLIC_PATH_PREFIXES = ["/api/auth/", "/_next/"];

function isPublicPath(pathname: string): boolean {
  // 정확히 일치하는 공개 경로
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }
  // 접두사로 시작하는 공개 경로
  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // 공개 경로는 항상 통과
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // access_token 쿠키 추출
  const accessTokenCookie = request.cookies.get("access_token");
  const accessToken = accessTokenCookie?.value;

  // access_token이 있으면 검증
  if (accessToken) {
    try {
      verifyToken(accessToken);
      // 유효한 토큰: 요청 통과
      return NextResponse.next();
    } catch {
      // access_token 만료/무효: refresh_token으로 재발급 시도
    }
  }

  // refresh_token 시도
  const refreshTokenCookie = request.cookies.get("refresh_token");
  const refreshToken = refreshTokenCookie?.value;

  if (!refreshToken) {
    // refresh_token도 없으면 /login으로 리다이렉트
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  // refresh_token 검증
  try {
    const payload = verifyToken(refreshToken);

    if (payload.type !== "refresh") {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl, { status: 302 });
    }

    // 새 access_token 발급
    const newAccessToken = generateAccessToken(payload.userId);

    // 요청 통과 + 새 access_token 쿠키 설정
    const response = NextResponse.next();
    response.headers.append(
      "Set-Cookie",
      `access_token=${newAccessToken}; HttpOnly; Path=/; SameSite=Lax`
    );
    return response;
  } catch {
    // refresh_token도 만료/무효: /login으로 리다이렉트
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }
}

export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청에 미들웨어 적용:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico (파비콘)
     * - 파일 확장자가 있는 경로 (정적 파일)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
