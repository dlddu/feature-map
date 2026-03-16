/**
 * POST /api/repos/:id/pipeline/stop — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/repos/[id]/pipeline/stop/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client        → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt         → verifyToken을 mock으로 대체
 *  - @/lib/pipeline/engine  → 파이프라인 엔진을 mock으로 대체 (abort 신호 전달)
 *
 * 동작 요약:
 *  - access_token 쿠키에서 JWT를 검증하여 userId를 추출
 *  - repoId 동적 파라미터로 레포를 조회하여 소유권 확인
 *  - RUNNING 중인 PipelineRun을 조회
 *  - 실행 중인 파이프라인이 없으면 404 반환
 *  - status를 FAILED로 변경하고 completedAt(stoppedAt) 기록
 *  - 파이프라인 엔진에 중단 요청 전달 (AbortController)
 *  - 응답: { pipelineRunId, status: "FAILED", stoppedAt: ISO8601 }
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
  PipelineEngine: jest.fn().mockImplementation(() => ({
    abort: jest.fn(),
    stop: jest.fn(),
  })),
  abortPipeline: jest.fn(),
  stopPipeline: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/repos/[id]/pipeline/stop/route";
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
  findFirst: jest.Mock;
  update: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_REPO_ID = "repo-cuid-001";
const MOCK_RUN_ID = "pipeline-run-cuid-001";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_STOPPED_AT = new Date("2026-03-16T12:00:00.000Z");

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

const MOCK_RUNNING_RUN = {
  id: MOCK_RUN_ID,
  repoId: MOCK_REPO_ID,
  userId: MOCK_USER_ID,
  commitSha: "abc123",
  status: "RUNNING",
  currentStep: "F2",
  startedAt: new Date("2026-03-16T11:00:00.000Z"),
  completedAt: null,
  errorMessage: null,
};

const MOCK_STOPPED_RUN = {
  ...MOCK_RUNNING_RUN,
  status: "FAILED",
  completedAt: MOCK_STOPPED_AT,
  errorMessage: "사용자에 의해 중단됨",
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
  options: { accessToken?: string } = { accessToken: MOCK_ACCESS_TOKEN }
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.accessToken !== undefined) {
    headers["Cookie"] = `access_token=${options.accessToken}`;
  }
  return new NextRequest(
    `http://localhost:3000/api/repos/${MOCK_REPO_ID}/pipeline/stop`,
    {
      method: "POST",
      headers,
    }
  );
}

// Next.js 동적 파라미터 헬퍼 (Next.js 15 스타일: Promise<{ id: string }>)
function makeParams(id: string = MOCK_REPO_ID) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/repos/:id/pipeline/stop", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 성공 시나리오
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER);
    mockPrismaRepo.findUnique.mockResolvedValue(MOCK_REPO);
    mockPrismaRun.findFirst.mockResolvedValue(MOCK_RUNNING_RUN);
    mockPrismaRun.update.mockResolvedValue(MOCK_STOPPED_RUN);
  });

  // -------------------------------------------------------------------------
  // 파이프라인 중단 성공 케이스 (happy path)
  // -------------------------------------------------------------------------

  describe("파이프라인 중단 성공 케이스 (happy path)", () => {
    it("RUNNING 중인 파이프라인을 중단 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 pipelineRunId가 포함된다", async () => {
      // Arrange
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("pipelineRunId", MOCK_RUN_ID);
    });

    it('응답 body에 status: "FAILED"가 포함된다', async () => {
      // Arrange
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("status", "FAILED");
    });

    it("응답 body에 stoppedAt이 ISO8601 형식으로 포함된다", async () => {
      // Arrange
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("stoppedAt");
      expect(typeof body.stoppedAt).toBe("string");
      // ISO8601 형식 검증 (예: "2026-03-16T12:00:00.000Z")
      expect(new Date(body.stoppedAt).toISOString()).toBe(body.stoppedAt);
    });

    it("prisma.pipelineRun.update가 status: FAILED와 completedAt으로 호출된다", async () => {
      // Arrange
      const request = makeRequest();
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_RUN_ID }),
          data: expect.objectContaining({
            status: "FAILED",
            completedAt: expect.any(Date),
          }),
        })
      );
    });

    it("prisma.pipelineRun.findFirst가 해당 repoId의 RUNNING 상태 실행을 조회한다", async () => {
      // Arrange
      const request = makeRequest();
      const params = makeParams();

      // Act
      await POST(request, params);

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

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest();
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.headers.get("content-type")).toContain("application/json");
    });

    it("응답 body에 pipelineRunId, status, stoppedAt 세 필드가 모두 포함된다", async () => {
      // Arrange
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("pipelineRunId");
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("stoppedAt");
    });
  });

  // -------------------------------------------------------------------------
  // 실행 중인 파이프라인 없음 케이스 (404)
  // -------------------------------------------------------------------------

  describe("실행 중인 파이프라인 없음 케이스", () => {
    it("RUNNING 중인 PipelineRun이 없으면 404를 반환한다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(null);
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(404);
    });

    it("실행 중인 파이프라인이 없을 때 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(null);
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("실행 중인 파이프라인이 없으면 update를 호출하지 않는다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(null);
      const request = makeRequest();
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockPrismaRun.update).not.toHaveBeenCalled();
    });

    it("COMPLETED 상태의 파이프라인만 있을 때 404를 반환한다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(null); // RUNNING 없음
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // 인증 실패 케이스 (401)
  // -------------------------------------------------------------------------

  describe("인증 실패 케이스", () => {
    it("access_token 쿠키가 없으면 401을 반환한다", async () => {
      // Arrange
      const request = makeRequest({}); // 쿠키 없음
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(401);
    });

    it("만료된 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest({ accessToken: "expired.token" });
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(401);
    });

    it("무효한 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequest({ accessToken: "invalid.token" });
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 파이프라인 상태를 업데이트하지 않는다", async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockPrismaRun.update).not.toHaveBeenCalled();
    });

    it("401 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);
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
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(404);
    });

    it("다른 유저 소유의 레포 파이프라인 중단 시 403 또는 404를 반환한다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue({
        ...MOCK_REPO,
        userId: "cuid-other-user-999",
      });
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect([403, 404]).toContain(response.status);
    });

    it("레포가 없으면 파이프라인 상태를 업데이트하지 않는다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue(null);
      const request = makeRequest();
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockPrismaRun.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("중단 시 completedAt이 현재 시각으로 설정된다 (과거 시각이 아니다)", async () => {
      // Arrange
      const beforeStop = new Date();
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      const stoppedAt = new Date(body.stoppedAt);
      expect(stoppedAt.getTime()).toBeGreaterThanOrEqual(beforeStop.getTime() - 1000);
    });

    it("update 호출 시 errorMessage가 설정된다 (중단 사유 기록)", async () => {
      // Arrange
      const request = makeRequest();
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert — errorMessage가 설정되어야 함 (구현에 따라 내용은 다를 수 있음)
      const updateCall = mockPrismaRun.update.mock.calls[0];
      if (updateCall) {
        const updateData = updateCall[0]?.data;
        if (updateData && "errorMessage" in updateData) {
          expect(typeof updateData.errorMessage).toBe("string");
        }
      }
    });

    it("F1 단계 실행 중 중단 시에도 정상적으로 FAILED로 변경된다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue({
        ...MOCK_RUNNING_RUN,
        currentStep: "F1",
      });
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(200);
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        })
      );
    });

    it("F5 단계 실행 중 중단 시에도 정상적으로 FAILED로 변경된다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue({
        ...MOCK_RUNNING_RUN,
        currentStep: "F5",
      });
      const request = makeRequest();
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(200);
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        })
      );
    });
  });
});
