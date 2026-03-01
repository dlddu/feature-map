import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

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

  // code 없으면 에러 리다이렉트
  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", request.url)
    );
  }

  try {
    // GitHub access_token 교환
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
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
        new URL("/login?error=github_auth_failed", request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    const githubAccessToken = tokenData.access_token;

    if (!githubAccessToken) {
      return NextResponse.redirect(
        new URL("/login?error=github_auth_failed", request.url)
      );
    }

    // GitHub 유저 정보 조회
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        Accept: "application/json",
      },
    });

    if (!userResponse.ok) {
      return NextResponse.redirect(
        new URL("/login?error=github_auth_failed", request.url)
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
      new URL("/dashboard", request.url)
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
      new URL("/login?error=github_auth_failed", request.url)
    );
  }
}
