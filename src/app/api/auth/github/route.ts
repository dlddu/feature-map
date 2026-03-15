import { NextRequest, NextResponse } from "next/server";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const MOCK_GITHUB_API_URL = process.env.MOCK_GITHUB_API_URL || "";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Mock 모드: MOCK_GITHUB_API_URL은 K8s 내부 DNS(http://mock-github:3101)일 수 있어
  // 브라우저에서 접근 불가. authorize 단계를 건너뛰고 바로 callback으로 리다이렉트.
  // 토큰 교환/유저 정보 조회는 서버-서버 통신이라 내부 DNS 접근 가능.
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
