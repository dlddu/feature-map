import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { getInstallationOctokit } from "@/lib/github/client";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 쿠키에서 access_token 추출
  const token = request.cookies.get("access_token")?.value;

  if (!token || token === "") {
    return NextResponse.json(
      { error: "인증이 필요합니다" },
      { status: 401 }
    );
  }

  // 토큰 검증
  let userId: string;
  try {
    const payload = verifyToken(token);
    if (payload.type !== "access") {
      return NextResponse.json(
        { error: "유효하지 않은 토큰 타입입니다" },
        { status: 401 }
      );
    }
    userId = payload.userId;
  } catch {
    return NextResponse.json(
      { error: "유효하지 않은 토큰입니다" },
      { status: 401 }
    );
  }

  // DB에서 사용자 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return NextResponse.json(
      { error: "사용자를 찾을 수 없습니다" },
      { status: 401 }
    );
  }

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
