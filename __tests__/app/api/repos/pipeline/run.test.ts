/**
 * POST /api/repos/:id/pipeline/run — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/repos/[id]/pipeline/run/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client        → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt         → verifyToken을 mock으로 대체
 *  - @/lib/pipeline/engine  → 파이프라인 엔진을 mock으로 대체 (비동기 백그라운드 실행)
 *
 * 동작 요약:
 *  - access_token 쿠키에서 JWT를 검증하여 userId를 추출
 *  - repoId 동적 파라미터로 레포를 조회하여 소유권 확인
 *  - 이미 RUNNING 중인 PipelineRun이 있으면 409 에러 반환
 *  - body가 없거나 {}이면 전체 실행 (F1→F5)
 *  - body에 step 필드가 있으면 해당 단계만 실행
 *  - PipelineRun 생성 (status: RUNNING, currentStep: 첫 단계)
 *  - 응답: { pipelineRunId, status: "RUNNING", currentStep: "F1" }
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
      create: jest.fn(),
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
      create: jest.fn(),
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
    run: jest.fn().mockResolvedValue(undefined),
    runStep: jest.fn().mockResolvedValue(undefined),
  })),
  runPipeline: jest.fn().mockResolvedValue(undefined),
  runPipelineStep: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/repos/[id]/pipeline/run/route";
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
  create: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_REPO_ID = "repo-cuid-001";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_PIPELINE_RUN_ID = "pipeline-run-cuid-001";

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

const MOCK_CREATED_RUN = {
  id: MOCK_PIPELINE_RUN_ID,
  repoId: MOCK_REPO_ID,
  userId: MOCK_USER_ID,
  commitSha: "abc123",
  status: "RUNNING",
  currentStep: "F1",
  startedAt: new Date("2026-03-16T00:00:00.000Z"),
  completedAt: null,
  errorMessage: null,
};

const MOCK_RUNNING_RUN = {
  id: "pipeline-run-existing-001",
  repoId: MOCK_REPO_ID,
  userId: MOCK_USER_ID,
  commitSha: "def456",
  status: "RUNNING",
  currentStep: "F2",
  startedAt: new Date("2026-03-15T00:00:00.000Z"),
  completedAt: null,
  errorMessage: null,
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
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
    `http://localhost:3000/api/repos/${MOCK_REPO_ID}/pipeline/run`,
    {
      method: "POST",
      headers,
      body: body !== null ? JSON.stringify(body) : null,
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

describe("POST /api/repos/:id/pipeline/run", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 성공 시나리오 (전체 실행)
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER);
    mockPrismaRepo.findUnique.mockResolvedValue(MOCK_REPO);
    mockPrismaRun.findFirst.mockResolvedValue(null); // 실행 중인 파이프라인 없음
    mockPrismaRun.create.mockResolvedValue(MOCK_CREATED_RUN);
  });

  // -------------------------------------------------------------------------
  // 전체 실행 성공 케이스 (happy path)
  // -------------------------------------------------------------------------

  describe("전체 실행 성공 케이스 (happy path)", () => {
    it("body 없이 전체 실행 요청 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 pipelineRunId가 포함된다", async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("pipelineRunId", MOCK_PIPELINE_RUN_ID);
    });

    it('응답 body에 status: "RUNNING"이 포함된다', async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("status", "RUNNING");
    });

    it('전체 실행 시 응답 body에 currentStep: "F1"이 포함된다', async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("currentStep", "F1");
    });

    it("prisma.pipelineRun.create가 RUNNING 상태와 currentStep: F1로 호출된다", async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockPrismaRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            repoId: MOCK_REPO_ID,
            userId: MOCK_USER_ID,
            status: "RUNNING",
            currentStep: "F1",
          }),
        })
      );
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("prisma.repo.findUnique가 올바른 repoId로 레포 소유권 확인을 위해 호출된다", async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockPrismaRepo.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_REPO_ID }),
        })
      );
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.headers.get("content-type")).toContain("application/json");
    });

    it("null body로 요청 시에도 전체 실행으로 처리된다", async () => {
      // Arrange
      const request = makeRequest(null);
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("currentStep", "F1");
    });
  });

  // -------------------------------------------------------------------------
  // 개별 단계 실행 케이스
  // -------------------------------------------------------------------------

  describe("개별 단계 실행 케이스", () => {
    it.each(["F1", "F2", "F3", "F4", "F5"])(
      "step: %s으로 요청 시 200 상태 코드를 반환한다",
      async (step) => {
        // Arrange
        const createdRun = { ...MOCK_CREATED_RUN, currentStep: step };
        mockPrismaRun.create.mockResolvedValue(createdRun);
        const request = makeRequest({ step });
        const params = makeParams();

        // Act
        const response = await POST(request, params);

        // Assert
        expect(response.status).toBe(200);
      }
    );

    it("step: F2로 요청 시 응답 body의 currentStep이 F2이다", async () => {
      // Arrange
      const createdRun = { ...MOCK_CREATED_RUN, currentStep: "F2" };
      mockPrismaRun.create.mockResolvedValue(createdRun);
      const request = makeRequest({ step: "F2" });
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("currentStep", "F2");
    });

    it("step: F3으로 요청 시 prisma.pipelineRun.create가 currentStep: F3으로 호출된다", async () => {
      // Arrange
      const createdRun = { ...MOCK_CREATED_RUN, currentStep: "F3" };
      mockPrismaRun.create.mockResolvedValue(createdRun);
      const request = makeRequest({ step: "F3" });
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockPrismaRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStep: "F3",
          }),
        })
      );
    });

    it("유효하지 않은 step 값(F6)으로 요청 시 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({ step: "F6" });
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(400);
    });

    it("유효하지 않은 step 값으로 요청 시 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({ step: "INVALID" });
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 인증 실패 케이스 (401)
  // -------------------------------------------------------------------------

  describe("인증 실패 케이스", () => {
    it("access_token 쿠키가 없으면 401을 반환한다", async () => {
      // Arrange
      const request = makeRequest({}, {}); // 쿠키 없음
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
      const request = makeRequest({}, { accessToken: "expired.token" });
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
      const request = makeRequest({}, { accessToken: "invalid.token" });
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 PipelineRun을 생성하지 않는다", async () => {
      // Arrange
      const request = makeRequest({}, {});
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockPrismaRun.create).not.toHaveBeenCalled();
    });

    it("401 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({}, {});
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
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(404);
    });

    it("다른 유저 소유의 레포에 접근 시 403 또는 404를 반환한다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue({
        ...MOCK_REPO,
        userId: "cuid-other-user-999",
      });
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect([403, 404]).toContain(response.status);
    });

    it("레포가 없으면 PipelineRun을 생성하지 않는다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue(null);
      const request = makeRequest({});
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockPrismaRun.create).not.toHaveBeenCalled();
    });

    it("404 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue(null);
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
  // 이미 실행 중인 파이프라인 충돌 케이스 (409)
  // -------------------------------------------------------------------------

  describe("이미 실행 중인 파이프라인 충돌 케이스", () => {
    it("이미 RUNNING 중인 PipelineRun이 있으면 409를 반환한다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(MOCK_RUNNING_RUN);
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(409);
    });

    it("409 응답 body에 실행 중인 pipelineRunId가 포함된다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(MOCK_RUNNING_RUN);
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("이미 실행 중인 파이프라인이 있으면 새 PipelineRun을 생성하지 않는다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(MOCK_RUNNING_RUN);
      const request = makeRequest({});
      const params = makeParams();

      // Act
      await POST(request, params);

      // Assert
      expect(mockPrismaRun.create).not.toHaveBeenCalled();
    });

    it("RUNNING 상태 조회 시 prisma.pipelineRun.findFirst가 해당 repoId와 RUNNING 상태로 호출된다", async () => {
      // Arrange
      mockPrismaRun.findFirst.mockResolvedValue(null);
      const request = makeRequest({});
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
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("step 필드가 빈 문자열이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({ step: "" });
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(400);
    });

    it("step 필드가 null이면 전체 실행으로 처리된다", async () => {
      // Arrange
      const request = makeRequest({ step: null });
      const params = makeParams();

      // Act
      const response = await POST(request, params);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("currentStep", "F1");
    });

    it("응답 body에 status, currentStep, pipelineRunId 세 필드가 모두 포함된다", async () => {
      // Arrange
      const request = makeRequest({});
      const params = makeParams();

      // Act
      const response = await POST(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("pipelineRunId");
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("currentStep");
    });
  });
});
