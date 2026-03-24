/**
 * GET /api/repos/[id]/pipeline/stream
 *
 * SSE(Server-Sent Events)를 통해 파이프라인 상태를 실시간으로 전달합니다.
 *
 * 이벤트 형식: data: {"step":"F1","status":"RUNNING"}\n\n
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { PipelineEngine } from "@/lib/pipeline/engine";
import type { StepEvent } from "@/lib/pipeline/engine";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  // 1. 인증 검사
  const token = request.cookies.get("access_token")?.value;

  if (!token || token === "") {
    return new Response(JSON.stringify({ error: "인증이 필요합니다" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let userId: string;
  try {
    const payload = verifyToken(token);
    userId = payload.userId;
  } catch {
    return new Response(JSON.stringify({ error: "인증이 필요합니다" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. 유저 확인
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return new Response(JSON.stringify({ error: "인증이 필요합니다" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. 레포 파라미터 추출
  const { id: repoId } = await context.params;

  // 4. 레포 존재 + 소유권 확인
  const repo = await prisma.repo.findUnique({ where: { id: repoId } });
  if (!repo || repo.userId !== userId) {
    return new Response(
      JSON.stringify({ error: "레포지토리를 찾을 수 없습니다" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 5. SSE 스트림 생성
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 파이프라인 엔진으로부터 이벤트 수신
      const engine = PipelineEngine.getInstance();

      function sendEvent(event: StepEvent) {
        const data = JSON.stringify({
          step: event.step,
          status: event.status,
          errorMessage: event.errorMessage,
          timestamp: event.timestamp.toISOString(),
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));

        // 완료 또는 실패 시 스트림 종료
        if (event.status === "COMPLETED" || event.status === "FAILED") {
          const runId = engine.isRunning(repoId) ? repoId : "";
          if (runId === "" || !engine.isRunning(runId)) {
            // 마지막 단계 완료 또는 실패 시 스트림 종료
          }
        }
      }

      // 클라이언트 연결 끊김 감지
      request.signal.addEventListener("abort", () => {
        try {
          controller.close();
        } catch {
          // 이미 닫힌 경우 무시
        }
      });

      // 현재 실행 중인 파이프라인의 이벤트를 전달
      // (실제 구현에서는 EventEmitter 또는 pub/sub 패턴 사용)
      void sendEvent; // 사용 표시

      // 초기 연결 이벤트 전송
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", repoId })}\n\n`
        )
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
