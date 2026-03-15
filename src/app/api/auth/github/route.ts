import { NextResponse } from "next/server";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const MOCK_GITHUB_API_URL = process.env.MOCK_GITHUB_API_URL || "";

export async function GET(): Promise<NextResponse> {
  const baseUrl = MOCK_GITHUB_API_URL || "https://github.com";
  const authorizeUrl = new URL("/login/oauth/authorize", baseUrl);
  authorizeUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set("scope", "read:user user:email");

  return NextResponse.redirect(authorizeUrl.toString(), { status: 302 });
}
