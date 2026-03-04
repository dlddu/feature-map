import { NextRequest, NextResponse } from "next/server";
import { getInstallationOctokit } from "@/lib/github/client";
import { requireUser, isAuthFailure } from "@/lib/auth/require-user";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (isAuthFailure(auth)) return auth.response;

  const { user } = auth;

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
  } catch {
    return NextResponse.json(
      { error: "GitHub 레포 목록을 가져오는데 실패했습니다" },
      { status: 500 }
    );
  }
}
