/**
 * POST /api/repos/[id]/pipeline/run — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/repos/[id]/pipeline/run/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client       → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt        → verifyToken을 mock으로 대체
 *  - @/lib/pipeline/engine → PipelineEngine을 mock으로 대체
 *
 * API 계약 (E2E 기대값):
 *  - Body: { step?: "F1"~"F5" }  (step 없으면 전체 실행)
 *  - 성공 응답: { pipelineRunId: string, status: "RUNNING", currentStep: "F1" }
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
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
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
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
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

import { POST } from "@/app/api/repos/[id]/pipeline/run/route";
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
  create: jest.Mock;
  findFirst: jest.Mock;
  updateMany: jest.Mock;
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

const MOCK_CREATED_RUN = {
  id: MOCK_RUN_ID,
  repoId: MOCK_REPO_ID,
  userId: MOCK_USER_ID,
  commitSha: "abc123",
  status: "RUNNING",
  currentStep: "F1",
  startedAt: new Date("2026-03-24T00:00:00.000Z"),
  completedAt: null,
  errorMessage: null,
  createdAt: new Date("2026-03-24T00:00:00.000Z"),
  updatedAt: new Date("2026-03-24T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
  repoId: string,
  body: unknown,
  options: { accessToken?: string } = { accessToken: MOCK_ACCESS_TOKEN }
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.accessToken !== undefined) {
    headers["Cookie"] = `access_token=${options.accessToken}`;
  }
  return new NextRequest(
    `http://localhost:3000/api/repos/${repoId}/pipeline/run`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/repos/[id]/pipeline/run", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 성공 시나리오
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER);
    mockPrismaRepo.findUnique.mockResolvedValue(MOCK_REPO);
    mockPrismaRun.create.mockResolvedValue(MOCK_CREATED_RUN);
    mockPrismaRun.findFirst.mockResolvedValue(null); // 실행 중인 파이프라인 없음
    mockEngine.start.mockResolvedValue(undefined);
    mockEngine.isRunning.mockReturnValue(false);
  });

  // -------------------------------------------------------------------------
  // 성공 케이스 (happy path)
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("전체 실행 요청 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 pipelineRunId가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("pipelineRunId", MOCK_RUN_ID);
    });

    it("응답 body에 status가 RUNNING으로 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("status", "RUNNING");
    });

    it("응답 body에 currentStep이 F1로 포함된다 (전체 실행 시 항상 F1부터)", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("currentStep", "F1");
    });

    it("step 없이 요청하면 F1부터 전체 파이프라인을 시작한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockPrismaRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "RUNNING",
            currentStep: "F1",
          }),
        })
      );
    });

    it("특정 step(F3) 지정 시 해당 단계부터 실행한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, { step: "F3" });
      mockPrismaRun.create.mockResolvedValue({
        ...MOCK_CREATED_RUN,
        currentStep: "F3",
      });

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("currentStep", "F3");
    });

    it("PipelineEngine.start가 생성된 runId로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockEngine.start).toHaveBeenCalledWith(
        MOCK_RUN_ID,
        expect.anything()
      );
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("prisma.pipelineRun.create가 해당 repoId와 userId로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockPrismaRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            repoId: MOCK_REPO_ID,
            userId: MOCK_USER_ID,
          }),
        })
      );
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {});

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
      const request = makeRequest(MOCK_REPO_ID, {}, {});

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
      const request = makeRequest(MOCK_REPO_ID, {}, { accessToken: "expired.token" });

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
      const request = makeRequest(MOCK_REPO_ID, {}, { accessToken: "invalid.token" });

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 파이프라인을 생성하지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {}, {});

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockPrismaRun.create).not.toHaveBeenCalled();
    });

    it("인증 실패 시 PipelineEngine.start가 호출되지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {}, {});

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockEngine.start).not.toHaveBeenCalled();
    });

    it("인증 실패 시 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, {}, {});

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
      const request = makeRequest(MOCK_REPO_ID, {});

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
      const request = makeRequest("non-existent-repo", {});

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
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // 이미 실행 중인 파이프라인 케이스 (409)
  // -------------------------------------------------------------------------

  describe("파이프라인 충돌 케이스", () => {
    it("이미 RUNNING 상태 파이프라인이 있으면 409를 반환한다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue({
        ...MOCK_CREATED_RUN,
        status: "RUNNING",
      });
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(409);
    });

    it("파이프라인 충돌 시 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue({
        ...MOCK_CREATED_RUN,
        status: "RUNNING",
      });
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

    it("파이프라인 충돌 시 새 파이프라인을 생성하지 않는다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue({
        ...MOCK_CREATED_RUN,
        status: "RUNNING",
      });
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(mockPrismaRun.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 입력값 검증 케이스 (400)
  // -------------------------------------------------------------------------

  describe("입력값 검증 케이스", () => {
    it("step이 유효하지 않은 값이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, { step: "F9" });

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(400);
    });

    it("step이 문자열이 아니면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_REPO_ID, { step: 1 });

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(400);
    });

    it("step이 F1~F5 범위이면 400이 아니다", async () => {
      // Arrange — F1~F5 모두 유효해야 함
      for (const step of ["F1", "F2", "F3", "F4", "F5"]) {
        mockPrismaRun.create.mockResolvedValue({
          ...MOCK_CREATED_RUN,
          currentStep: step,
        });
        const request = makeRequest(MOCK_REPO_ID, { step });

        // Act
        const response = await POST(request, {
          params: Promise.resolve({ id: MOCK_REPO_ID }),
        });

        // Assert
        expect(response.status).not.toBe(400);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("빈 body로 요청해도 200을 반환한다 (step은 선택 필드)", async () => {
      // Arrange
      const request = new NextRequest(
        `http://localhost:3000/api/repos/${MOCK_REPO_ID}/pipeline/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `access_token=${MOCK_ACCESS_TOKEN}`,
          },
          body: "",
        }
      );

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(200);
    });

    it("body 없이 요청해도 200을 반환한다 (step은 선택 필드)", async () => {
      // Arrange
      const request = new NextRequest(
        `http://localhost:3000/api/repos/${MOCK_REPO_ID}/pipeline/run`,
        {
          method: "POST",
          headers: {
            Cookie: `access_token=${MOCK_ACCESS_TOKEN}`,
          },
        }
      );

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(200);
    });

    it("pipelineRun 생성 시 DB 에러가 발생하면 500을 반환한다", async () => {
      // Arrange
      mockPrismaRun.create.mockRejectedValue(new Error("DB connection failed"));
      const request = makeRequest(MOCK_REPO_ID, {});

      // Act
      const response = await POST(request, {
        params: Promise.resolve({ id: MOCK_REPO_ID }),
      });

      // Assert
      expect(response.status).toBe(500);
    });
  });
});
