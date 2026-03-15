import { NextResponse } from "next/server";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
// 브라우저가 접근할 수 있는 mock GitHub URL (NodePort/localhost)
// MOCK_GITHUB_API_URL은 K8s 내부 DNS일 수 있어 브라우저 리다이렉트에 사용 불가
const MOCK_GITHUB_BROWSER_URL = process.env.MOCK_GITHUB_BROWSER_URL || "";

export async function GET(): Promise<NextResponse> {
  const baseUrl = MOCK_GITHUB_BROWSER_URL || "https://github.com";
  const authorizeUrl = new URL("/login/oauth/authorize", baseUrl);
  authorizeUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set("scope", "read:user user:email");

  console.log("[DEBUG /api/auth/github] MOCK_GITHUB_BROWSER_URL:", MOCK_GITHUB_BROWSER_URL || "(not set)");
  console.log("[DEBUG /api/auth/github] Redirecting to:", authorizeUrl.toString());

  return NextResponse.redirect(authorizeUrl.toString(), { status: 302 });
}
