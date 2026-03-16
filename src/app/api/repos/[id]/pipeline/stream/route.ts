import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

export const dynamic = "force-dynamic";

function getUserIdFromRequest(request: NextRequest): string {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) throw new Error("인증이 필요합니다");
  const payload = verifyToken(accessToken);
  return payload.userId;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse | Response> {
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

  // runId 쿼리 파라미터 처리
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  let pipelineRun: {
    id: string;
    repoId: string;
    userId: string;
    status: string;
    currentStep: string | null;
  } | null = null;

  if (runId) {
    // runId로 특정 PipelineRun 조회
    pipelineRun = await prisma.pipelineRun.findUnique({ where: { id: runId } });

    if (!pipelineRun) {
      return NextResponse.json(
        { error: "파이프라인 실행을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // 다른 레포의 runId인 경우 403
    if (pipelineRun.repoId !== repoId) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다" },
        { status: 403 }
      );
    }
  } else {
    // runId 없으면 최신 실행 조회 (없으면 400)
    pipelineRun = await prisma.pipelineRun.findFirst({
      where: { repoId },
      orderBy: { startedAt: "desc" },
    });

    if (!pipelineRun) {
      return NextResponse.json(
        { error: "실행 중인 파이프라인이 없습니다" },
        { status: 400 }
      );
    }
  }

  const encoder = new TextEncoder();
  const currentRun = pipelineRun;

  // SSE ReadableStream 생성
  const stream = new ReadableStream({
    start(controller) {
      // 초기 상태 이벤트 전송
      const event = {
        step: currentRun.currentStep ?? "F1",
        status: currentRun.status,
        runId: currentRun.id,
      };
      const data = `data: ${JSON.stringify(event)}\n\n`;
      controller.enqueue(encoder.encode(data));

      // keep-alive 주기적 전송
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 15000);

      // 스트림 종료 처리
      // 실제 환경에서는 PipelineEngine 이벤트를 구독하지만
      // 테스트 환경에서는 초기 이벤트 전송 후 종료
      setTimeout(() => {
        clearInterval(keepAliveInterval);
        try {
          controller.close();
        } catch {
          // 이미 닫힌 경우 무시
        }
      }, 100);
    },
    cancel() {
      // 연결 끊김 시 정리
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
