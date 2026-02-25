/**
 * Mock LLM 서버 (DLD-610)
 *
 * OpenAI 및 Anthropic API 호환 고정 응답 서버.
 * F1~F6 각 기능별 고정 응답과 SSE 스트리밍 시뮬레이션을 지원합니다.
 *
 * 지원 엔드포인트:
 * - GET  /health
 * - POST /v1/chat/completions        (OpenAI 호환)
 * - POST /v1/messages                (Anthropic 호환)
 * - POST /v1/chat/completions/stream (OpenAI SSE 스트리밍)
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../../fixtures/llm");

const PORT = parseInt(process.env.PORT ?? "3102", 10);

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

const fixtures = {
  f1: loadFixture("f1-layer-extraction.json"),
  f2: loadFixture("f2-strategy-planning.json"),
  f3: loadFixture("f3-feature-extraction.json"),
  f4: loadFixture("f4-acceptance-tests.json"),
  f5: loadFixture("f5-dependency-mapping.json"),
  f6: loadFixture("f6-report-generation.json"),
};

function send(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * 요청 바디에서 F1~F6 기능 유형을 감지합니다.
 * system 또는 user 메시지에서 키워드를 탐지합니다.
 */
function detectFeatureType(messages) {
  const text = JSON.stringify(messages).toLowerCase();
  if (text.includes("layer") || text.includes("architecture")) return "f1";
  if (text.includes("strateg")) return "f2";
  if (text.includes("feature") && text.includes("extract")) return "f3";
  if (text.includes("acceptance") || text.includes("given") || text.includes("when") || text.includes("then")) return "f4";
  if (text.includes("depend")) return "f5";
  if (text.includes("report") || text.includes("summary")) return "f6";
  // 기본값: f3 (feature extraction)
  return "f3";
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * SSE 스트리밍 응답을 전송합니다.
 * F6 픽스처의 청크를 100ms 간격으로 전송합니다.
 */
async function sendSSEStream(res, chunks) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  for (const chunk of chunks) {
    res.write(chunk);
    await new Promise((r) => setTimeout(r, 100));
  }

  res.end();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Health check
  if (req.method === "GET" && pathname === "/health") {
    return send(res, 200, { status: "ok", server: "mock-llm" });
  }

  // OpenAI SSE 스트리밍 (stream: true 지원)
  if (req.method === "POST" && pathname === "/v1/chat/completions") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return send(res, 400, { error: { message: "Invalid request body" } });
    }

    const featureType = detectFeatureType(body.messages ?? []);

    // stream: true 요청은 SSE로 응답
    if (body.stream === true) {
      const chunks = fixtures.f6.sse_stream_chunks;
      return sendSSEStream(res, chunks);
    }

    const fixture = fixtures[featureType];
    const response = fixture.openai_response ?? fixtures.f3.openai_response;
    return send(res, 200, response);
  }

  // Anthropic 메시지 API
  if (req.method === "POST" && pathname === "/v1/messages") {
    let body;
    try {
      body = await readBody(req);
    } catch {
      return send(res, 400, { error: { type: "invalid_request_error", message: "Invalid request body" } });
    }

    const featureType = detectFeatureType(body.messages ?? []);
    const fixture = fixtures[featureType];
    const response =
      fixture.anthropic_response ??
      fixtures.f1.anthropic_response ??
      // anthropic_response가 없는 fixture는 openai_response를 Anthropic 형식으로 변환
      {
        id: "msg-mock-fallback",
        type: "message",
        role: "assistant",
        content: [
          {
            type: "text",
            text: fixture.openai_response?.choices?.[0]?.message?.content ?? "{}",
          },
        ],
        model: body.model ?? "claude-opus-4-6",
        stop_reason: "end_turn",
        usage: { input_tokens: 500, output_tokens: 200 },
      };

    return send(res, 200, response);
  }

  // 404 fallback
  send(res, 404, { error: { message: `Not Found: ${pathname}` } });
});

server.listen(PORT, () => {
  console.log(`Mock LLM server listening on port ${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
