import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-key-change-in-production"
);

// 인증 없이 접근 가능한 공개 경로
const PUBLIC_PATHS = ["/", "/login", "/signup"];
const PUBLIC_PATH_PREFIXES = ["/api/auth/", "/_next/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

interface TokenPayload {
  userId: string;
  type: "access" | "refresh";
}

async function verifyTokenEdge(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as TokenPayload;
}

async function generateAccessTokenEdge(userId: string): Promise<string> {
  return new SignJWT({ userId, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(JWT_SECRET);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
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
      await verifyTokenEdge(accessToken);
      return NextResponse.next();
    } catch {
      // access_token 만료/무효: refresh_token으로 재발급 시도
    }
  }

  // refresh_token 시도
  const refreshTokenCookie = request.cookies.get("refresh_token");
  const refreshToken = refreshTokenCookie?.value;

  if (!refreshToken) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  // refresh_token 검증
  try {
    const payload = await verifyTokenEdge(refreshToken);

    if (payload.type !== "refresh") {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl, { status: 302 });
    }

    // 새 access_token 발급
    const newAccessToken = await generateAccessTokenEdge(payload.userId);

    const response = NextResponse.next();
    response.headers.append(
      "Set-Cookie",
      `access_token=${newAccessToken}; HttpOnly; Path=/; SameSite=Lax`
    );
    return response;
  } catch {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
