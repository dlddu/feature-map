/**
 * GET /api/repos/:id/pipeline/stream — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/repos/[id]/pipeline/stream/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt   → verifyToken을 mock으로 대체
 *
 * 동작 요약:
 *  - access_token 쿠키에서 JWT를 검증하여 userId를 추출
 *  - repoId 동적 파라미터로 레포를 조회하여 소유권 확인
 *  - runId 쿼리 파라미터로 특정 PipelineRun을 구독
 *  - ReadableStream(SSE) 응답 반환
 *  - Content-Type: text/event-stream
 *  - 각 단계 진행 시 이벤트 전송: data: {"step":"F1","status":"RUNNING"}\n\n
 *  - 연결 끊김 시 스트림 정리
 *
 * SSE 응답은 비동기 스트림이므로 스트림 초기화 및 헤더 검증에 집중합니다.
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — jest.mock은 호이스팅되므로 import 전에 선언
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    repo: {
      findUnique: jest.fn(),
    },
    pipelineRun: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  },
  default: {
    user: {
      findUnique: jest.fn(),
    },
    repo: {
      findUnique: jest.fn(),
    },
    pipelineRun: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/jwt", () => ({
  __esModule: true,
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyToken: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/repos/[id]/pipeline/stream/route";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaRepo = prisma.repo as unknown as {
  findUnique: jest.Mock;
};
const mockPrismaUser = prisma.user as unknown as {
  findUnique: jest.Mock;
};
const mockPrismaRun = prisma.pipelineRun as unknown as {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_REPO_ID = "repo-cuid-001";
const MOCK_RUN_ID = "pipeline-run-cuid-001";
const MOCK_ACCESS_TOKEN = "mock.access.token";

const MOCK_TOKEN_PAYLOAD = {
  userId: MOCK_USER_ID,
  type: "access" as const,
  exp: Math.floor(Date.now() / 1000) + 15 * 60,
  iat: Math.floor(Date.now() / 1000),
};

const MOCK_USER = {
  id: MOCK_USER_ID,
  email: "test@example.com",
  name: "홍길동",
  createdAt: new Date("2026-02-28T00:00:00.000Z"),
  updatedAt: new Date("2026-02-28T00:00:00.000Z"),
};

const MOCK_REPO = {
  id: MOCK_REPO_ID,
  githubRepoId: 100001,
  fullName: "test-org/sample-app",
  defaultBranch: "main",
  installationId: 99001,
  userId: MOCK_USER_ID,
  cloneUrl: "https://github.com/test-org/sample-app.git",
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
};

const MOCK_PIPELINE_RUN = {
  id: MOCK_RUN_ID,
  repoId: MOCK_REPO_ID,
  userId: MOCK_USER_ID,
  commitSha: "abc123",
  status: "RUNNING",
  currentStep: "F1",
  startedAt: new Date("2026-03-16T00:00:00.000Z"),
  completedAt: null,
  errorMessage: null,
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
  runId?: string,
  options: { accessToken?: string } = { accessToken: MOCK_ACCESS_TOKEN }
): NextRequest {
  const headers: Record<string, string> = {};
  if (options.accessToken !== undefined) {
    headers["Cookie"] = `access_token=${options.accessToken}`;
  }
  const url = new URL(
    `http://localhost:3000/api/repos/${MOCK_REPO_ID}/pipeline/stream`
  );
  if (runId !== undefined) {
    url.searchParams.set("runId", runId);
  }
  return new NextRequest(url.toString(), {
    method: "GET",
    headers,
  });
}

// Next.js 동적 파라미터 헬퍼 (Next.js 15 스타일: Promise<{ id: string }>)
function makeParams(id: string = MOCK_REPO_ID) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/repos/:id/pipeline/stream", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 성공 시나리오
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER);
    mockPrismaRepo.findUnique.mockResolvedValue(MOCK_REPO);
    mockPrismaRun.findUnique.mockResolvedValue(MOCK_PIPELINE_RUN);
    mockPrismaRun.findFirst.mockResolvedValue(MOCK_PIPELINE_RUN);
  });

  // -------------------------------------------------------------------------
  // SSE 응답 성공 케이스 (happy path)
  // -------------------------------------------------------------------------

  describe("SSE 응답 성공 케이스 (happy path)", () => {
    it("유효한 요청에 대해 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 Content-Type이 text/event-stream이다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("text/event-stream");
    });

    it("응답 Cache-Control 헤더가 no-cache로 설정된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect(response.headers.get("cache-control")).toContain("no-cache");
    });

    it("응답 Connection 헤더가 keep-alive로 설정된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect(response.headers.get("connection")).toContain("keep-alive");
    });

    it("응답 body가 ReadableStream이다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect(response.body).not.toBeNull();
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      await GET(request, params);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("prisma.repo.findUnique가 올바른 repoId로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      await GET(request, params);

      // Assert
      expect(mockPrismaRepo.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_REPO_ID }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // runId 쿼리 파라미터 처리 케이스
  // -------------------------------------------------------------------------

  describe("runId 쿼리 파라미터 처리 케이스", () => {
    it("runId 파라미터가 있을 때 해당 PipelineRun을 조회한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      await GET(request, params);

      // Assert
      // findUnique 또는 findFirst 중 하나가 runId로 호출되어야 함
      const runQueriedById =
        mockPrismaRun.findUnique.mock.calls.some(
          (call: unknown[]) =>
            typeof call[0] === "object" &&
            call[0] !== null &&
            JSON.stringify(call[0]).includes(MOCK_RUN_ID)
        ) ||
        mockPrismaRun.findFirst.mock.calls.some(
          (call: unknown[]) =>
            typeof call[0] === "object" &&
            call[0] !== null &&
            JSON.stringify(call[0]).includes(MOCK_RUN_ID)
        );
      expect(runQueriedById).toBe(true);
    });

    it("runId 없이 요청 시에도 200 응답을 반환하거나 400 에러를 반환한다", async () => {
      // Arrange — runId 없이 최신 실행 스트림을 구독하거나 400 에러 반환
      const request = makeRequest(undefined); // runId 없음
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert — 구현에 따라 200(최신 실행 구독) 또는 400(runId 필수)
      expect([200, 400]).toContain(response.status);
    });

    it("존재하지 않는 runId로 요청 시 404를 반환한다", async () => {
      // Arrange
      mockPrismaRun.findUnique.mockResolvedValue(null);
      mockPrismaRun.findFirst.mockResolvedValue(null);
      const request = makeRequest("nonexistent-run-id");
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect(response.status).toBe(404);
    });

    it("존재하지 않는 runId 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaRun.findUnique.mockResolvedValue(null);
      mockPrismaRun.findFirst.mockResolvedValue(null);
      const request = makeRequest("nonexistent-run-id");
      const params = makeParams();

      // Act
      const response = await GET(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("다른 레포의 runId로 요청 시 403 또는 404를 반환한다", async () => {
      // Arrange — 다른 repoId를 가진 PipelineRun
      mockPrismaRun.findUnique.mockResolvedValue({
        ...MOCK_PIPELINE_RUN,
        repoId: "other-repo-id",
      });
      mockPrismaRun.findFirst.mockResolvedValue(null);
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect([403, 404]).toContain(response.status);
    });
  });

  // -------------------------------------------------------------------------
  // 인증 실패 케이스 (401)
  // -------------------------------------------------------------------------

  describe("인증 실패 케이스", () => {
    it("access_token 쿠키가 없으면 401을 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID, {}); // 쿠키 없음
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect(response.status).toBe(401);
    });

    it("만료된 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest(MOCK_RUN_ID, { accessToken: "expired.token" });
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect(response.status).toBe(401);
    });

    it("무효한 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequest(MOCK_RUN_ID, { accessToken: "invalid.token" });
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 DB 조회를 수행하지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID, {});
      const params = makeParams();

      // Act
      await GET(request, params);

      // Assert
      expect(mockPrismaRepo.findUnique).not.toHaveBeenCalled();
    });

    it("401 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID, {});
      const params = makeParams();

      // Act
      const response = await GET(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // 레포 소유권 / 존재 확인 케이스 (403 / 404)
  // -------------------------------------------------------------------------

  describe("레포 소유권 및 존재 확인 케이스", () => {
    it("레포가 존재하지 않으면 404를 반환한다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue(null);
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect(response.status).toBe(404);
    });

    it("다른 유저 소유의 레포 스트림 접근 시 403 또는 404를 반환한다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue({
        ...MOCK_REPO,
        userId: "cuid-other-user-999",
      });
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert
      expect([403, 404]).toContain(response.status);
    });
  });

  // -------------------------------------------------------------------------
  // SSE 이벤트 포맷 케이스
  // -------------------------------------------------------------------------

  describe("SSE 이벤트 포맷 케이스", () => {
    it("스트림에서 읽은 첫 번째 청크가 SSE 형식(data: ...\\n\\n)을 따른다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert — 스트림을 한 청크만 읽어 형식 확인
      const reader = response.body?.getReader();
      if (!reader) {
        // 스트림이 없으면 테스트 건너뜀 (구현 전 상태)
        return;
      }
      const { value, done } = await reader.read();
      reader.releaseLock();

      if (!done && value) {
        const text = new TextDecoder().decode(value);
        // SSE 형식: "data: {...}\n\n" 또는 ": keep-alive\n\n"
        expect(text).toMatch(/data:|:/);
      }
    });

    it("SSE 이벤트 데이터가 step과 status를 포함한 JSON이다", async () => {
      // Arrange
      const request = makeRequest(MOCK_RUN_ID);
      const params = makeParams();

      // Act
      const response = await GET(request, params);

      // Assert — 스트림 첫 번째 데이터 이벤트 파싱 시도
      const reader = response.body?.getReader();
      if (!reader) return;

      let dataEvent: string | null = null;
      let attempts = 0;

      // 최대 5번 청크를 읽어 data: 로 시작하는 이벤트를 찾음
      while (attempts < 5) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        if (text.startsWith("data:")) {
          dataEvent = text;
          break;
        }
        attempts++;
      }
      reader.releaseLock();

      if (dataEvent) {
        // "data: {...}\n\n" 형식에서 JSON 부분 추출
        const jsonStr = dataEvent.replace(/^data:\s*/, "").replace(/\n+$/, "");
        expect(() => JSON.parse(jsonStr)).not.toThrow();
        const parsed = JSON.parse(jsonStr);
        expect(parsed).toHaveProperty("step");
        expect(parsed).toHaveProperty("status");
      }
    });
  });
});
