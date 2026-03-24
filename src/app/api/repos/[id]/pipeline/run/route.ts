/**
 * POST /api/repos/[id]/pipeline/run
 *
 * 파이프라인 실행을 시작합니다.
 *
 * Body: { step?: "F1"~"F5" }  (step 없으면 전체 실행)
 * 성공 응답: { pipelineRunId: string, status: "RUNNING", currentStep: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { PipelineEngine } from "@/lib/pipeline/engine";
import type { PipelineStep } from "@/lib/pipeline/engine";

const VALID_STEPS = new Set<string>(["F1", "F2", "F3", "F4", "F5"]);

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

  // 5. Body 파싱
  let step: string | undefined;
  try {
    const text = await request.text();
    if (text && text.trim() !== "") {
      const body = JSON.parse(text) as Record<string, unknown>;
      if ("step" in body) {
        // step 유효성 검사
        if (typeof body.step !== "string") {
          return NextResponse.json(
            { error: "step은 문자열이어야 합니다" },
            { status: 400 }
          );
        }
        if (!VALID_STEPS.has(body.step)) {
          return NextResponse.json(
            { error: `step은 F1~F5 중 하나여야 합니다: ${body.step}` },
            { status: 400 }
          );
        }
        step = body.step;
      }
    }
  } catch {
    // JSON 파싱 실패 시 step 없이 진행 (step은 optional)
  }

  // 6. 이미 RUNNING 파이프라인 있는지 확인
  const existingRun = await prisma.pipelineRun.findFirst({
    where: { repoId, status: "RUNNING" },
  });
  if (existingRun) {
    return NextResponse.json(
      { error: "이미 실행 중인 파이프라인이 있습니다" },
      { status: 409 }
    );
  }

  // 7. PipelineRun 생성
  const currentStep: PipelineStep = (step as PipelineStep) ?? "F1";

  let pipelineRun;
  try {
    pipelineRun = await prisma.pipelineRun.create({
      data: {
        repoId,
        userId,
        commitSha: "HEAD",
        status: "RUNNING",
        currentStep,
      },
    });
  } catch (error) {
    console.error("파이프라인 생성 오류:", error);
    return NextResponse.json(
      { error: "파이프라인 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }

  // 8. PipelineEngine.start() 호출 (fire-and-forget)
  const engine = PipelineEngine.getInstance();
  engine.start(pipelineRun.id, {
    repoId,
    userId,
    startStep: currentStep,
    onEvent: () => {
      // SSE stream을 통해 이벤트 전달 (별도 구현)
    },
  }).catch((error: unknown) => {
    console.error("파이프라인 실행 오류:", error);
  });

  return NextResponse.json(
    {
      pipelineRunId: pipelineRun.id,
      status: "RUNNING",
      currentStep: pipelineRun.currentStep,
    },
    { status: 200 }
  );
}
