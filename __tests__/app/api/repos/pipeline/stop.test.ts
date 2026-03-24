/**
 * POST /api/repos/[id]/pipeline/stop — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/repos/[id]/pipeline/stop/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client       → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt        → verifyToken을 mock으로 대체
 *  - @/lib/pipeline/engine → PipelineEngine을 mock으로 대체
 *
 * API 계약 (E2E 기대값):
 *  - 성공 응답: { pipelineRunId: string, status: "FAILED", stoppedAt: "ISO string" }
 *  - 인증 필요 (access_token 쿠키)
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
      findFirst: jest.fn(),
      update: jest.fn(),
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
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/jwt", () => ({
  __esModule: true,
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyToken: jest.fn(),
}));

jest.mock("@/lib/pipeline/engine", () => ({
  __esModule: true,
  PipelineEngine: {
    getInstance: jest.fn().mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      isRunning: jest.fn(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/repos/[id]/pipeline/stop/route";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { PipelineEngine } from "@/lib/pipeline/engine";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  findUnique: jest.Mock;
};
const mockPrismaRepo = prisma.repo as unknown as {
  findUnique: jest.Mock;
};
const mockPrismaRun = prisma.pipelineRun as unknown as {
  findFirst: jest.Mock;
  update: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;
const mockEngine = PipelineEngine.getInstance() as unknown as {
  start: jest.Mock;
  stop: jest.Mock;
  isRunning: jest.Mock;
};

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_REPO_ID = "repo-cuid-001";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_RUN_ID = "run-cuid-001";
const MOCK_STOPPED_AT = new Date("2026-03-24T01:00:00.000Z");

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
  installationId: 99001,
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

const MOCK_RUNNING_PIPELINE = {
  id: MOCK_RUN_ID,
  repoId: MOCK_REPO_ID,
  userId: MOCK_USER_ID,
  commitSha: "abc123",
  status: "RUNNING",
  currentStep: "F2",
  startedAt: new Date("2026-03-24T00:00:00.000Z"),
  completedAt: null,
  errorMessage: null,
  createdAt: new Date("2026-03-24T00:00:00.000Z"),
  updatedAt: new Date("2026-03-24T00:00:00.000Z"),
};

const MOCK_STOPPED_PIPELINE = {
  ...MOCK_RUNNING_PIPELINE,
  status: "FAILED",
  completedAt: MOCK_STOPPED_AT,
  errorMessage: "사용자에 의해 중단됨",
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
  repoId: string,
  options: { accessToken?: string } = { accessToken: MOCK_ACCESS_TOKEN }
): NextRequest {
  const headers: Record<string, string> = {};
  if (options.accessToken !== undefined) {
    headers["Cookie"] = `access_token=${options.accessToken}`;
  }
  return new NextRequest(
    `http://localhost:3000/api/repos/${repoId}/pipeline/stop`,
    {
      method: "POST",
      headers,
    }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/repos/[id]/pipeline/stop", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 성공 시나리오 (RUNNING 파이프라인 존재)
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER);
    mockPrismaRepo.findUnique.mockResolvedValue(MOCK_REPO);
    mockPrismaRun.findFirst.mockResolvedValue(MOCK_RUNNING_PIPELINE);
    mockPrismaRun.update.mockResolvedValue(MOCK_STOPPED_PIPELINE);
    mockEngine.stop.mockResolvedValue(undefined);
    mockEngine.isRunning.mockReturnValue(true);
  });

  // -------------------------------------------------------------------------
  // 성공 케이스 (happy path)
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("실행 중인 파이프라인 중단 요청 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 pipelineRunId가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("pipelineRunId", MOCK_RUN_ID);
    });

    it("응답 body에 status가 FAILED로 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("status", "FAILED");
    });

    it("응답 body에 stoppedAt이 ISO 문자열로 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("stoppedAt");
      expect(typeof body.stoppedAt).toBe("string");
      // ISO 8601 형식 검증
      expect(() => new Date(body.stoppedAt)).not.toThrow();
      expect(new Date(body.stoppedAt).toISOString()).toBe(body.stoppedAt);
    });

    it("PipelineEngine.stop이 해당 runId로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockEngine.stop).toHaveBeenCalledWith(MOCK_RUN_ID);
    });

    it("prisma.pipelineRun.update가 FAILED 상태로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_RUN_ID }),
          data: expect.objectContaining({ status: "FAILED" }),
        })
      );
    });

    it("DB 업데이트 시 completedAt이 설정된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            completedAt: expect.any(Date),
          }),
        })
      );
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });
  });

  // -------------------------------------------------------------------------
  // 인증 실패 케이스 (401)
  // -------------------------------------------------------------------------

  describe("인증 실패 케이스", () => {
    it("access_token 쿠키가 없으면 401을 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(401);
    });

    it("만료된 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest(MOCK_REPO_ID, { accessToken: "expired.token" });

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(401);
    });

    it("무효한 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequest(MOCK_REPO_ID, { accessToken: "invalid.token" });

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 파이프라인을 중단하지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockEngine.stop).not.toHaveBeenCalled();
    });

    it("인증 실패 시 DB를 업데이트하지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockPrismaRun.update).not.toHaveBeenCalled();
    });

    it("인증 실패 시 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("토큰에 해당하는 유저가 DB에 없으면 401을 반환한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // 레포 없음 케이스 (404)
  // -------------------------------------------------------------------------

  describe("레포 없음 케이스", () => {
    it("존재하지 않는 repoId로 요청 시 404를 반환한다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue(null);
      const request = makeRequest("non-existent-repo");

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: "non-existent-repo" }),
      });

      // Assert
      expect(response.status).toBe(404);
    });

    it("다른 유저 소유의 레포 요청 시 404를 반환한다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue({
        ...MOCK_REPO,
        userId: "cuid-other-user-999",
      });
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // 실행 중인 파이프라인 없음 케이스 (404)
  // -------------------------------------------------------------------------

  describe("실행 중인 파이프라인 없음 케이스", () => {
    it("RUNNING 상태의 파이프라인이 없으면 404를 반환한다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(null);
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(404);
    });

    it("실행 중인 파이프라인이 없을 때 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(null);
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("실행 중인 파이프라인이 없으면 PipelineEngine.stop을 호출하지 않는다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(null);
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockEngine.stop).not.toHaveBeenCalled();
    });

    it("COMPLETED 상태 파이프라인만 있으면 404를 반환한다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(null); // findFirst는 RUNNING 조건으로 쿼리하므로 null
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("DB 업데이트 에러가 발생하면 500을 반환한다", async () => {
      // Arrange
      mockPrismaRun.update.mockRejectedValue(new Error("DB connection failed"));
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(500);
    });

    it("prisma.pipelineRun.findFirst가 RUNNING 상태 조건으로 쿼리된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID);

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockPrismaRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            repoId: MOCK_REPO_ID,
            status: "RUNNING",
          }),
        })
      );
    });
  });
});
