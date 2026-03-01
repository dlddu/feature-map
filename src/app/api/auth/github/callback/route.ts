import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  error?: string;
}

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

  // code 파라미터 확인
  if (!code || code.trim() === "") {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  // GitHub token 교환
  let githubAccessToken: string;
  try {
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
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl, { status: 302 });
    }

    const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

    if (!tokenData.access_token) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl, { status: 302 });
    }

    githubAccessToken = tokenData.access_token;
  } catch {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  // GitHub 유저 정보 조회
  let githubUser: GitHubUser;
  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        Accept: "application/json",
      },
    });

    if (!userResponse.ok) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl, { status: 302 });
    }

    githubUser = (await userResponse.json()) as GitHubUser;
  } catch {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  // DB에 유저 생성 또는 업데이트
  const user = await prisma.user.upsert({
    where: { githubId: githubUser.id },
    create: {
      githubId: githubUser.id,
      login: githubUser.login,
      name: githubUser.name,
      email: githubUser.email,
      avatarUrl: githubUser.avatar_url,
      accessToken: githubAccessToken,
    },
    update: {
      login: githubUser.login,
      name: githubUser.name,
      email: githubUser.email,
      avatarUrl: githubUser.avatar_url,
      accessToken: githubAccessToken,
    },
  });

  // JWT 토큰 생성
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // /dashboard로 리다이렉트하면서 쿠키 설정
  const dashboardUrl = new URL("/dashboard", request.url);
  const response = NextResponse.redirect(dashboardUrl, { status: 302 });

  response.headers.append(
    "Set-Cookie",
    `access_token=${accessToken}; HttpOnly; Path=/; SameSite=Lax`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Path=/; SameSite=Lax`
  );

  return response;
}
