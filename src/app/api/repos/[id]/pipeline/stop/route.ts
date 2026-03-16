import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

function getUserIdFromRequest(request: NextRequest): string {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) throw new Error("인증이 필요합니다");
  const payload = verifyToken(accessToken);
  return payload.userId;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // 인증
  let userId: string;
  try {
    userId = getUserIdFromRequest(request);
  } catch {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 동적 파라미터 await (Next.js 15 스타일)
  const { id: repoId } = await params;

  // 레포 조회 및 소유권 확인
  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo) {
    return NextResponse.json(
      { error: "레포를 찾을 수 없습니다" },
      { status: 404 }
    );
  }
  if (repo.userId !== userId) {
    return NextResponse.json(
      { error: "접근 권한이 없습니다" },
      { status: 403 }
    );
  }

  // RUNNING 중인 PipelineRun 조회
  const runningPipeline = await prisma.pipelineRun.findFirst({
    where: { repoId, status: "RUNNING" },
  });

  if (!runningPipeline) {
    return NextResponse.json(
      { error: "실행 중인 파이프라인을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 현재 시각으로 중단 처리
  const stoppedAt = new Date();

  // PipelineRun 상태 업데이트: FAILED로 변경
  await prisma.pipelineRun.update({
    where: { id: runningPipeline.id },
    data: {
      status: "FAILED",
      completedAt: stoppedAt,
      errorMessage: "사용자에 의해 중단됨",
    },
  });

  return NextResponse.json(
    {
      pipelineRunId: runningPipeline.id,
      status: "FAILED",
      stoppedAt: stoppedAt.toISOString(),
    },
    { status: 200 }
  );
}
