import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getInstallationOctokit } from "@/lib/github/client";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user, error } = await requireUser(request);
  if (error) return error;

  // installationId 확인
  if (!user.installationId) {
    return NextResponse.json(
      { error: "GitHub App이 설치되지 않았습니다" },
      { status: 403 }
    );
  }

  // GitHub 레포 목록 조회
  try {
    const octokit = await getInstallationOctokit(user.installationId);
    const { data } = await octokit.request("GET /installation/repositories", {
      per_page: 100,
    });

    return NextResponse.json(
      { repositories: data.repositories },
      { status: 200 }
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[/api/github/repos] error:", detail);
    console.error("[/api/github/repos] GITHUB_API_URL:", process.env.GITHUB_API_URL);
    return NextResponse.json(
      { error: "GitHub 레포 목록을 가져오는데 실패했습니다", detail },
      { status: 500 }
    );
  }
}
