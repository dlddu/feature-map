/**
 * POST /api/repos — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/repos/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt   → verifyToken을 mock으로 대체
 *
 * 동작 요약:
 *  - access_token 쿠키에서 JWT를 검증하여 userId를 추출
 *  - Request body: { githubRepoId, fullName, defaultBranch?, cloneUrl?, installationId }
 *  - githubRepoId 중복이면 409 에러 반환
 *  - Repo 레코드를 생성하고 201과 함께 반환
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
      create: jest.fn(),
    },
  },
  default: {
    user: {
      findUnique: jest.fn(),
    },
    repo: {
      findUnique: jest.fn(),
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

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/repos/route";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  findUnique: jest.Mock;
};
const mockPrismaRepo = prisma.repo as unknown as {
  findUnique: jest.Mock;
  create: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_INSTALLATION_ID = 99001;

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
  installationId: MOCK_INSTALLATION_ID,
  createdAt: new Date("2026-02-28T00:00:00.000Z"),
  updatedAt: new Date("2026-02-28T00:00:00.000Z"),
};

const VALID_REPO_BODY = {
  githubRepoId: 100001,
  fullName: "test-org/sample-app",
  defaultBranch: "main",
  cloneUrl: "https://github.com/test-org/sample-app.git",
  installationId: MOCK_INSTALLATION_ID,
};

const MOCK_CREATED_REPO = {
  id: "repo-cuid-001",
  githubRepoId: VALID_REPO_BODY.githubRepoId,
  fullName: VALID_REPO_BODY.fullName,
  defaultBranch: VALID_REPO_BODY.defaultBranch,
  cloneUrl: VALID_REPO_BODY.cloneUrl,
  installationId: VALID_REPO_BODY.installationId,
  userId: MOCK_USER_ID,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
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
  return new NextRequest("http://localhost:3000/api/repos", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/repos", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 성공 시나리오
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER);
    mockPrismaRepo.findUnique.mockResolvedValue(null); // 중복 없음
    mockPrismaRepo.create.mockResolvedValue(MOCK_CREATED_REPO);
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 요청으로 레포 등록 시 201 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
    });

    it("응답 body에 생성된 repo 객체가 포함된다", async () => {
      // Arrange
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("repo");
      expect(body.repo).toMatchObject({
        id: MOCK_CREATED_REPO.id,
        githubRepoId: VALID_REPO_BODY.githubRepoId,
        fullName: VALID_REPO_BODY.fullName,
      });
    });

    it("prisma.repo.create가 올바른 데이터로 호출된다", async () => {
      // Arrange
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            githubRepoId: VALID_REPO_BODY.githubRepoId,
            fullName: VALID_REPO_BODY.fullName,
            installationId: VALID_REPO_BODY.installationId,
            userId: MOCK_USER_ID,
          }),
        })
      );
    });

    it("defaultBranch를 생략하면 'main'으로 기본값이 설정된다", async () => {
      // Arrange
      const { defaultBranch: _omitted, ...bodyWithoutDefault } = VALID_REPO_BODY;
      const request = makeRequest(bodyWithoutDefault);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            defaultBranch: "main",
          }),
        })
      );
    });

    it("cloneUrl 없이 요청해도 201을 반환한다 (optional 필드)", async () => {
      // Arrange
      const { cloneUrl: _omitted, ...bodyWithoutCloneUrl } = VALID_REPO_BODY;
      const request = makeRequest(bodyWithoutCloneUrl);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
    });

    it("중복 여부 확인을 위해 findUnique가 githubRepoId로 호출된다", async () => {
      // Arrange
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaRepo.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            githubRepoId: VALID_REPO_BODY.githubRepoId,
          }),
        })
      );
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      await POST(request);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      const response = await POST(request);

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
      const request = makeRequest(VALID_REPO_BODY, {}); // 쿠키 없음

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("만료된 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest(VALID_REPO_BODY, {
        accessToken: "expired.token",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("무효한 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequest(VALID_REPO_BODY, {
        accessToken: "invalid.token",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 DB에 레포를 생성하지 않는다", async () => {
      // Arrange
      const request = makeRequest(VALID_REPO_BODY, {});

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaRepo.create).not.toHaveBeenCalled();
    });

    it("토큰에 해당하는 유저가 DB에 없으면 401을 반환한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // 레포 중복 케이스 (409)
  // -------------------------------------------------------------------------

  describe("레포 중복 케이스", () => {
    it("이미 등록된 githubRepoId로 요청 시 409를 반환한다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue(MOCK_CREATED_REPO); // 이미 존재
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(409);
    });

    it("레포 중복 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue(MOCK_CREATED_REPO);
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("레포 중복 시 새 레포를 생성하지 않는다", async () => {
      // Arrange
      mockPrismaRepo.findUnique.mockResolvedValue(MOCK_CREATED_REPO);
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaRepo.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 필수 필드 누락 (400)
  // -------------------------------------------------------------------------

  describe("필수 필드 누락 케이스", () => {
    it("githubRepoId 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const { githubRepoId: _omitted, ...bodyWithout } = VALID_REPO_BODY;
      const request = makeRequest(bodyWithout);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("fullName 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const { fullName: _omitted, ...bodyWithout } = VALID_REPO_BODY;
      const request = makeRequest(bodyWithout);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("installationId 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const { installationId: _omitted, ...bodyWithout } = VALID_REPO_BODY;
      const request = makeRequest(bodyWithout);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("400 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({});

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("필수 필드 누락 시 DB에 레포를 생성하지 않는다", async () => {
      // Arrange
      const { githubRepoId: _omitted, ...bodyWithout } = VALID_REPO_BODY;
      const request = makeRequest(bodyWithout);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaRepo.create).not.toHaveBeenCalled();
    });

    it("빈 body로 요청 시 400을 반환한다", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/repos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${MOCK_ACCESS_TOKEN}`,
        },
        body: "",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("githubRepoId가 숫자가 아닌 경우 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        ...VALID_REPO_BODY,
        githubRepoId: "not-a-number",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("fullName이 빈 문자열인 경우 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        ...VALID_REPO_BODY,
        fullName: "",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("응답 repo에 userId가 포함된다", async () => {
      // Arrange
      const request = makeRequest(VALID_REPO_BODY);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body.repo).toHaveProperty("userId", MOCK_USER_ID);
    });
  });
});
