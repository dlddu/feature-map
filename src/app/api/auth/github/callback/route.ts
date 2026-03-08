import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const GITHUB_BASE_URL = process.env.MOCK_GITHUB_API_URL || "https://github.com";
const GITHUB_API_BASE_URL = process.env.MOCK_GITHUB_API_URL
  ? `${process.env.MOCK_GITHUB_API_URL}/api/v3`
  : "https://api.github.com";

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // code 없으면 GitHub OAuth authorize 요청을 서버 사이드로 수행
  if (!code) {
    const redirectUri = new URL("/api/auth/github/callback", request.url).toString();
    const authorizeUrl = `${GITHUB_BASE_URL}/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user,user:email`;

    try {
      const authorizeRes = await fetch(authorizeUrl, { redirect: "manual" });
      const location = authorizeRes.headers.get("location");

      if (location) {
        // authorize 엔드포인트가 리다이렉트를 반환한 경우 브라우저를 해당 URL로 전달
        // - Mock 서버: redirect_uri?code=... 로 바로 리다이렉트
        // - GitHub: 로그인 페이지 또는 redirect_uri?code=... 로 리다이렉트
        return NextResponse.redirect(location, { status: 302 });
      }
    } catch {
      // 서버 사이드 authorize 요청 실패 시 브라우저 리다이렉트로 폴백
    }

    return NextResponse.redirect(authorizeUrl, { status: 302 });
  }

  try {
    // GitHub access_token 교환
    const tokenResponse = await fetch(
      `${GITHUB_BASE_URL}/login/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      return NextResponse.redirect(
        new URL("/login?error=github_auth_failed", request.url),
        { status: 302 }
      );
    }

    const tokenData = await tokenResponse.json();
    const githubAccessToken = tokenData.access_token;

    if (!githubAccessToken) {
      return NextResponse.redirect(
        new URL("/login?error=github_auth_failed", request.url),
        { status: 302 }
      );
    }

    // GitHub 유저 정보 조회
    const userResponse = await fetch(`${GITHUB_API_BASE_URL}/user`, {
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        Accept: "application/json",
      },
    });

    if (!userResponse.ok) {
      return NextResponse.redirect(
        new URL("/login?error=github_auth_failed", request.url),
        { status: 302 }
      );
    }

    const githubUser: GitHubUser = await userResponse.json();

    // DB에 유저 upsert
    const user = await prisma.user.upsert({
      where: { githubId: githubUser.id },
      create: {
        githubId: githubUser.id,
        login: githubUser.login,
        email: githubUser.email,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
      },
      update: {
        login: githubUser.login,
        email: githubUser.email,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
      },
    });

    // 토큰 발급
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // /dashboard로 리다이렉트 + 쿠키 설정
    const response = NextResponse.redirect(
      new URL("/dashboard", request.url),
      { status: 302 }
    );

    response.headers.append(
      "Set-Cookie",
      `access_token=${accessToken}; Path=/; SameSite=Lax`
    );
    response.headers.append(
      "Set-Cookie",
      `refresh_token=${refreshToken}; HttpOnly; Path=/; SameSite=Lax`
    );

    return response;
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=github_auth_failed", request.url),
      { status: 302 }
    );
  }
}
