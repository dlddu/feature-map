/**
 * POST /api/repos/[id]/pipeline/stop
 *
 * 실행 중인 파이프라인을 중단합니다.
 *
 * 성공 응답: { pipelineRunId: string, status: "FAILED", stoppedAt: "ISO string" }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { PipelineEngine } from "@/lib/pipeline/engine";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // 1. 인증 검사
  const token = request.cookies.get("access_token")?.value;

  if (!token || token === "") {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  let userId: string;
  try {
    const payload = verifyToken(token);
    userId = payload.userId;
  } catch {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 2. 유저 확인
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  // 3. 레포 파라미터 추출
  const { id: repoId } = await context.params;

  // 4. 레포 존재 + 소유권 확인
  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo || repo.userId !== userId) {
    return NextResponse.json(
      { error: "레포지토리를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 5. RUNNING 상태의 파이프라인 찾기
  const runningPipeline = await prisma.pipelineRun.findFirst({
    where: { repoId, status: "RUNNING" },
  });

  if (!runningPipeline) {
    return NextResponse.json(
      { error: "실행 중인 파이프라인이 없습니다" },
      { status: 404 }
    );
  }

  // 6. PipelineEngine.stop() 호출
  const engine = PipelineEngine.getInstance();
  await engine.stop(runningPipeline.id);

  // 7. DB 상태 업데이트 (FAILED, completedAt 설정)
  const stoppedAt = new Date();
  let updatedPipeline;
  try {
    updatedPipeline = await prisma.pipelineRun.update({
      where: { id: runningPipeline.id },
      data: {
        status: "FAILED",
        completedAt: stoppedAt,
        errorMessage: "사용자에 의해 중단됨",
      },
    });
  } catch (error) {
    console.error("파이프라인 업데이트 오류:", error);
    return NextResponse.json(
      { error: "파이프라인 업데이트 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      pipelineRunId: updatedPipeline.id,
      status: "FAILED",
      stoppedAt: updatedPipeline.completedAt?.toISOString() ?? stoppedAt.toISOString(),
    },
    { status: 200 }
  );
}
