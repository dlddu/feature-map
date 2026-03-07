/**
 * GET /api/github/repos — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/github/repos/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client        → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt         → verifyToken을 mock으로 대체
 *  - @/lib/github/client    → getInstallationOctokit을 mock으로 대체
 *
 * 동작 요약:
 *  - access_token 쿠키에서 JWT를 검증하여 userId를 추출
 *  - DB에서 userId로 사용자 조회 (installationId 확인)
 *  - installationId가 없으면 403 에러 반환
 *  - getInstallationOctokit으로 Octokit 인스턴스를 얻어 레포 목록 조회
 *  - `GET /installation/repositories` 호출 후 레포 목록을 JSON으로 반환
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
  },
  default: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/jwt", () => ({
  __esModule: true,
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyToken: jest.fn(),
}));

jest.mock("@/lib/github/client", () => ({
  __esModule: true,
  getInstallationOctokit: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/github/repos/route";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { getInstallationOctokit } from "@/lib/github/client";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  findUnique: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;
const mockGetInstallationOctokit = getInstallationOctokit as jest.Mock;

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

const MOCK_USER_WITH_INSTALLATION = {
  id: MOCK_USER_ID,
  email: "test@example.com",
  name: "홍길동",
  installationId: MOCK_INSTALLATION_ID,
  createdAt: new Date("2026-02-28T00:00:00.000Z"),
  updatedAt: new Date("2026-02-28T00:00:00.000Z"),
};

const MOCK_USER_WITHOUT_INSTALLATION = {
  ...MOCK_USER_WITH_INSTALLATION,
  installationId: null,
};

const MOCK_GITHUB_REPOS = [
  {
    id: 100001,
    node_id: "R_kgDOBhXXXX",
    name: "sample-app",
    full_name: "test-org/sample-app",
    private: false,
    owner: {
      login: "test-org",
      id: 9000001,
      avatar_url: "https://avatars.githubusercontent.com/u/9000001?v=4",
      type: "Organization",
    },
    description: "Sample application",
    fork: false,
    clone_url: "https://github.com/test-org/sample-app.git",
    default_branch: "main",
    visibility: "public",
  },
  {
    id: 100002,
    node_id: "R_kgDOBhXXXY",
    name: "backend-service",
    full_name: "test-org/backend-service",
    private: true,
    owner: {
      login: "test-org",
      id: 9000001,
      avatar_url: "https://avatars.githubusercontent.com/u/9000001?v=4",
      type: "Organization",
    },
    description: "Backend service",
    fork: false,
    clone_url: "https://github.com/test-org/backend-service.git",
    default_branch: "main",
    visibility: "private",
  },
];

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(options: { accessToken?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.accessToken !== undefined) {
    headers["Cookie"] = `access_token=${options.accessToken}`;
  }
  return new NextRequest("http://localhost:3000/api/github/repos", {
    method: "GET",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Octokit mock 헬퍼
// ---------------------------------------------------------------------------

function mockOctokitSuccess(repos = MOCK_GITHUB_REPOS): void {
  const mockOctokit = {
    request: jest.fn().mockResolvedValue({
      data: {
        total_count: repos.length,
        repositories: repos,
      },
    }),
  };
  mockGetInstallationOctokit.mockResolvedValue(mockOctokit);
}

function mockOctokitFailure(error: Error): void {
  mockGetInstallationOctokit.mockRejectedValue(error);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/github/repos", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 유효한 토큰 + installationId가 있는 사용자
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER_WITH_INSTALLATION);
    mockOctokitSuccess();
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 access_token 쿠키로 요청 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 repositories 배열이 포함된다", async () => {
      // Arrange
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("repositories");
      expect(Array.isArray(body.repositories)).toBe(true);
    });

    it("응답 body의 repositories에 GitHub에서 받은 레포 목록이 포함된다", async () => {
      // Arrange
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(body.repositories).toHaveLength(MOCK_GITHUB_REPOS.length);
      expect(body.repositories[0]).toMatchObject({
        id: MOCK_GITHUB_REPOS[0].id,
        full_name: MOCK_GITHUB_REPOS[0].full_name,
      });
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      await GET(request);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("DB 조회 시 findUnique가 토큰 페이로드의 userId로 호출된다", async () => {
      // Arrange
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      await GET(request);

      // Assert
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_USER_ID }),
        })
      );
    });

    it("getInstallationOctokit이 사용자의 installationId로 호출된다", async () => {
      // Arrange
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      await GET(request);

      // Assert
      expect(mockGetInstallationOctokit).toHaveBeenCalledWith(
        MOCK_INSTALLATION_ID
      );
    });

    it("Octokit의 request가 'GET /installation/repositories'로 호출된다", async () => {
      // Arrange
      const mockOctokit = {
        request: jest.fn().mockResolvedValue({
          data: { total_count: 0, repositories: [] },
        }),
      };
      mockGetInstallationOctokit.mockResolvedValue(mockOctokit);
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      await GET(request);

      // Assert
      expect(mockOctokit.request).toHaveBeenCalledWith(
        "GET /installation/repositories",
        expect.any(Object)
      );
    });

    it("레포 목록이 빈 배열인 경우에도 200과 빈 배열을 반환한다", async () => {
      // Arrange
      const mockOctokit = {
        request: jest.fn().mockResolvedValue({
          data: { total_count: 0, repositories: [] },
        }),
      };
      mockGetInstallationOctokit.mockResolvedValue(mockOctokit);
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.repositories).toEqual([]);
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);

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
      const request = makeRequest(); // 쿠키 없음

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("access_token 쿠키 없을 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("만료된 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest({ accessToken: "expired.access.token" });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("무효한 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequest({ accessToken: "invalid.token.value" });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 GitHub API를 호출하지 않는다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest({ accessToken: "expired.access.token" });

      // Act
      await GET(request);

      // Assert
      expect(mockGetInstallationOctokit).not.toHaveBeenCalled();
    });

    it("토큰에 해당하는 유저가 DB에 없으면 401을 반환한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // installationId 없음 (403)
  // -------------------------------------------------------------------------

  describe("installationId 미설정 케이스", () => {
    it("사용자에게 installationId가 없으면 403을 반환한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER_WITHOUT_INSTALLATION);
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(403);
    });

    it("installationId 없을 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER_WITHOUT_INSTALLATION);
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("installationId가 없으면 GitHub API를 호출하지 않는다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER_WITHOUT_INSTALLATION);
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      await GET(request);

      // Assert
      expect(mockGetInstallationOctokit).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // GitHub API 오류 케이스
  // -------------------------------------------------------------------------

  describe("GitHub API 오류 케이스", () => {
    it("GitHub API 호출이 실패하면 500을 반환한다", async () => {
      // Arrange
      mockOctokitFailure(new Error("GitHub API error"));
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(500);
    });

    it("GitHub API 오류 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      mockOctokitFailure(new Error("GitHub API error"));
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("Octokit request가 실패하면 500을 반환한다", async () => {
      // Arrange
      const mockOctokit = {
        request: jest.fn().mockRejectedValue(new Error("rate limit exceeded")),
      };
      mockGetInstallationOctokit.mockResolvedValue(mockOctokit);
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("access_token 쿠키가 빈 문자열이면 401을 반환한다", async () => {
      // Arrange
      const request = new NextRequest(
        "http://localhost:3000/api/github/repos",
        {
          method: "GET",
          headers: { Cookie: "access_token=" },
        }
      );

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("access token payload의 type이 'access'가 아닌 경우 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockReturnValue({
        ...MOCK_TOKEN_PAYLOAD,
        type: "refresh" as const,
      });
      const request = makeRequest({ accessToken: MOCK_ACCESS_TOKEN });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
    });
  });
});
