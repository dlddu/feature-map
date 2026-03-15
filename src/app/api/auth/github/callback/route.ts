import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const MOCK_GITHUB_API_URL = process.env.MOCK_GITHUB_API_URL || "";
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

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

  console.log("[DEBUG /api/auth/github/callback] code:", code);
  console.log("[DEBUG /api/auth/github/callback] MOCK_GITHUB_API_URL:", MOCK_GITHUB_API_URL || "(not set)");

  // code 없으면 에러 리다이렉트
  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", BASE_URL),
      { status: 302 }
    );
  }

  try {
    // GitHub access_token 교환
    const tokenUrl = MOCK_GITHUB_API_URL
      ? `${MOCK_GITHUB_API_URL}/login/oauth/access_token`
      : "https://github.com/login/oauth/access_token";
    const tokenResponse = await fetch(
      tokenUrl,
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

    console.log("[DEBUG /api/auth/github/callback] tokenResponse.ok:", tokenResponse.ok, "status:", tokenResponse.status);

    if (!tokenResponse.ok) {
      return NextResponse.redirect(
        new URL("/login?error=github_auth_failed", BASE_URL),
        { status: 302 }
      );
    }

    const tokenData = await tokenResponse.json();
    const githubAccessToken = tokenData.access_token;

    console.log("[DEBUG /api/auth/github/callback] tokenData:", JSON.stringify(tokenData));

    if (!githubAccessToken) {
      return NextResponse.redirect(
        new URL("/login?error=github_auth_failed", BASE_URL),
        { status: 302 }
      );
    }

    // GitHub 유저 정보 조회
    const userUrl = MOCK_GITHUB_API_URL
      ? `${MOCK_GITHUB_API_URL}/api/v3/user`
      : "https://api.github.com/user";
    const userResponse = await fetch(userUrl, {
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        Accept: "application/json",
      },
    });

    console.log("[DEBUG /api/auth/github/callback] userResponse.ok:", userResponse.ok, "status:", userResponse.status);

    if (!userResponse.ok) {
      return NextResponse.redirect(
        new URL("/login?error=github_auth_failed", BASE_URL),
        { status: 302 }
      );
    }

    const githubUser: GitHubUser = await userResponse.json();
    console.log("[DEBUG /api/auth/github/callback] githubUser:", JSON.stringify(githubUser));

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
      new URL("/dashboard", BASE_URL),
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
  } catch (error) {
    console.error("[DEBUG /api/auth/github/callback] catch error:", error);
    return NextResponse.redirect(
      new URL("/login?error=github_auth_failed", BASE_URL),
      { status: 302 }
    );
  }
}
