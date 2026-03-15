import { NextRequest, NextResponse } from "next/server";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const MOCK_GITHUB_API_URL = process.env.MOCK_GITHUB_API_URL || "";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Mock 모드: 브라우저가 mock 서버에 직접 접근할 수 없으므로
  // GitHub authorize 단계를 건너뛰고 바로 callback으로 리다이렉트
  if (MOCK_GITHUB_API_URL) {
    return NextResponse.redirect(
      new URL("/api/auth/github/callback?code=mock-oauth-code", request.url),
      { status: 302 }
    );
  }

  const authorizeUrl = new URL("/login/oauth/authorize", "https://github.com");
  authorizeUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set("scope", "read:user user:email");

  return NextResponse.redirect(authorizeUrl.toString(), { status: 302 });
}
