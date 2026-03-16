import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { PipelineEngine } from "@/lib/pipeline/engine";

const VALID_STEPS = ["F1", "F2", "F3", "F4", "F5"] as const;
type ValidStep = (typeof VALID_STEPS)[number];

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

  // Body 파싱 (실패해도 전체 실행으로 처리)
  let step: string | null = null;
  try {
    const text = await request.text();
    if (text && text.trim() !== "" && text.trim() !== "null") {
      const parsed = JSON.parse(text);
      // parsed가 객체인 경우에만 step 추출
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const body = parsed as Record<string, unknown>;
        // step이 명시적으로 null인 경우 전체 실행으로 처리
        if (body.step !== undefined && body.step !== null) {
          step = String(body.step);
        }
      }
    }
  } catch {
    // JSON 파싱 실패 시 전체 실행으로 처리
  }

  // step 유효성 검사
  if (step !== null) {
    if (step === "" || !VALID_STEPS.includes(step as ValidStep)) {
      return NextResponse.json(
        { error: `유효하지 않은 단계입니다. 허용된 단계: ${VALID_STEPS.join(", ")}` },
        { status: 400 }
      );
    }
  }

  // 실행 중인 파이프라인 확인 (409 Conflict)
  const existingRun = await prisma.pipelineRun.findFirst({
    where: { repoId, status: "RUNNING" },
  });
  if (existingRun) {
    return NextResponse.json(
      { error: `이미 실행 중인 파이프라인이 있습니다: ${existingRun.id}` },
      { status: 409 }
    );
  }

  // currentStep 결정: 단계 지정 시 해당 단계, 아니면 F1
  const currentStep: ValidStep = (step as ValidStep) ?? "F1";

  // PipelineRun 생성
  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      repoId,
      userId,
      commitSha: "",
      status: "RUNNING",
      currentStep,
    },
  });

  // 백그라운드 비동기 실행 (응답은 즉시 반환, fire-and-forget)
  const engine = new PipelineEngine();
  if (step) {
    engine.runStep(pipelineRun.id, step).catch(() => {
      // 에러는 engine 내부에서 처리
    });
  } else {
    engine.run(pipelineRun.id).catch(() => {
      // 에러는 engine 내부에서 처리
    });
  }

  return NextResponse.json(
    {
      pipelineRunId: pipelineRun.id,
      status: pipelineRun.status,
      currentStep: pipelineRun.currentStep,
    },
    { status: 200 }
  );
}
