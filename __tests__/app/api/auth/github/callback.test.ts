/**
 * GET /api/auth/github/callback — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/auth/github/callback/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt   → 토큰 발급 함수를 mock으로 대체
 *  - global.fetch     → GitHub API 호출을 mock으로 시뮬레이션
 *    - POST https://github.com/login/oauth/access_token → { access_token: "..." }
 *    - GET  https://api.github.com/user → { id, login, name, email, avatar_url }
 *
 * 동작 요약:
 *  - code 파라미터로 GitHub access_token 교환
 *  - GitHub user info 조회
 *  - DB에 유저 upsert (githubId 기준)
 *  - JWT 발급 후 /dashboard로 302 리다이렉트 + 쿠키 설정
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  prisma: {
    user: {
      upsert: jest.fn(),
    },
  },
  default: {
    user: {
      upsert: jest.fn(),
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
// Imports
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/auth/github/callback/route";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  upsert: jest.Mock;
};
const mockGenerateAccessToken = generateAccessToken as jest.Mock;
const mockGenerateRefreshToken = generateRefreshToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_GITHUB_CODE = "github-oauth-code-12345";
const MOCK_GITHUB_ACCESS_TOKEN = "gho_mockGitHubAccessToken";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_REFRESH_TOKEN = "mock.refresh.token";

const MOCK_GITHUB_USER = {
  id: 12345,
  login: "testuser",
  name: "Test User",
  email: "testuser@example.com",
  avatar_url: "https://avatars.githubusercontent.com/u/12345",
};

const MOCK_DB_USER = {
  id: "cuid-user-001",
  githubId: MOCK_GITHUB_USER.id,
  login: MOCK_GITHUB_USER.login,
  email: MOCK_GITHUB_USER.email,
  name: MOCK_GITHUB_USER.name,
  avatarUrl: MOCK_GITHUB_USER.avatar_url,
  createdAt: new Date("2026-02-28T00:00:00.000Z"),
  updatedAt: new Date("2026-02-28T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(code: string | null): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/github/callback");
  if (code !== null) {
    url.searchParams.set("code", code);
  }
  return new NextRequest(url.toString(), {
    method: "GET",
  });
}

// ---------------------------------------------------------------------------
// fetch mock 헬퍼
// ---------------------------------------------------------------------------

function mockFetchSuccess(): void {
  global.fetch = jest.fn().mockImplementation((url: string, options?: RequestInit) => {
    // GitHub token 교환 엔드포인트
    if (
      typeof url === "string" &&
      url.includes("github.com/login/oauth/access_token")
    ) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ access_token: MOCK_GITHUB_ACCESS_TOKEN }),
      } as Response);
    }

    // GitHub user info 엔드포인트
    if (typeof url === "string" && url.includes("api.github.com/user")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_GITHUB_USER),
      } as Response);
    }

    return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
  });
}

function mockFetchTokenFailure(): void {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (
      typeof url === "string" &&
      url.includes("github.com/login/oauth/access_token")
    ) {
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "bad_verification_code" }),
      } as Response);
    }
    return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
  });
}

function mockFetchUserInfoFailure(): void {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    if (
      typeof url === "string" &&
      url.includes("github.com/login/oauth/access_token")
    ) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ access_token: MOCK_GITHUB_ACCESS_TOKEN }),
      } as Response);
    }

    if (typeof url === "string" && url.includes("api.github.com/user")) {
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ message: "Unauthorized" }),
      } as Response);
    }

    return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/auth/github/callback", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 모든 외부 호출이 성공하는 상태
    mockFetchSuccess();
    mockPrismaUser.upsert.mockResolvedValue(MOCK_DB_USER);
    mockGenerateAccessToken.mockReturnValue(MOCK_ACCESS_TOKEN);
    mockGenerateRefreshToken.mockReturnValue(MOCK_REFRESH_TOKEN);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 code로 요청 시 302 리다이렉트를 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(302);
    });

    it("성공 시 /dashboard로 리다이렉트한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      const response = await GET(request);
      const location = response.headers.get("location");

      // Assert
      expect(location).not.toBeNull();
      expect(location).toContain("/dashboard");
    });

    it("응답 Set-Cookie 헤더에 access_token 쿠키가 설정된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      const response = await GET(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(MOCK_ACCESS_TOKEN);
    });

    it("응답 Set-Cookie 헤더에 httpOnly refresh_token 쿠키가 설정된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      const response = await GET(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(MOCK_REFRESH_TOKEN);
      expect(setCookie?.toLowerCase()).toContain("httponly");
    });

    it("GitHub token 교환 API를 올바른 code와 함께 호출한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      await GET(request);

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("github.com/login/oauth/access_token"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(MOCK_GITHUB_CODE),
        })
      );
    });

    it("GitHub user info API를 access_token 인증 헤더와 함께 호출한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      await GET(request);

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("api.github.com/user"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining(MOCK_GITHUB_ACCESS_TOKEN),
          }),
        })
      );
    });

    it("DB에 유저를 githubId 기준으로 upsert한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      await GET(request);

      // Assert
      expect(mockPrismaUser.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ githubId: MOCK_GITHUB_USER.id }),
        })
      );
    });

    it("generateAccessToken과 generateRefreshToken이 upsert된 userId로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      await GET(request);

      // Assert
      expect(mockGenerateAccessToken).toHaveBeenCalledWith(MOCK_DB_USER.id);
      expect(mockGenerateRefreshToken).toHaveBeenCalledWith(MOCK_DB_USER.id);
    });

    it("이미 존재하는 GitHub 유저가 재로그인해도 302 리다이렉트를 반환한다", async () => {
      // Arrange — 이미 존재하는 유저 (upsert는 update로 처리됨)
      mockPrismaUser.upsert.mockResolvedValue({
        ...MOCK_DB_USER,
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      });
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(302);
    });
  });

  // -------------------------------------------------------------------------
  // 에러 케이스
  // -------------------------------------------------------------------------

  describe("에러 케이스", () => {
    it("code 파라미터가 없으면 302 리다이렉트로 /login?error=missing_code로 이동한다", async () => {
      // Arrange
      const request = makeRequest(null);

      // Act
      const response = await GET(request);
      const location = response.headers.get("location");

      // Assert
      expect(response.status).toBe(302);
      expect(location).toContain("/login");
      expect(location).toContain("error=missing_code");
    });

    it("GitHub token 교환 실패 시 302 리다이렉트로 /login?error=github_auth_failed로 이동한다", async () => {
      // Arrange
      mockFetchTokenFailure();
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      const response = await GET(request);
      const location = response.headers.get("location");

      // Assert
      expect(response.status).toBe(302);
      expect(location).toContain("/login");
      expect(location).toContain("error=github_auth_failed");
    });

    it("GitHub token 교환 실패 시 DB 조회를 하지 않는다", async () => {
      // Arrange
      mockFetchTokenFailure();
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      await GET(request);

      // Assert
      expect(mockPrismaUser.upsert).not.toHaveBeenCalled();
    });

    it("GitHub user info 조회 실패 시 302 리다이렉트로 /login?error=github_auth_failed로 이동한다", async () => {
      // Arrange
      mockFetchUserInfoFailure();
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      const response = await GET(request);
      const location = response.headers.get("location");

      // Assert
      expect(response.status).toBe(302);
      expect(location).toContain("/login");
      expect(location).toContain("error=github_auth_failed");
    });

    it("GitHub user info 조회 실패 시 DB upsert를 하지 않는다", async () => {
      // Arrange
      mockFetchUserInfoFailure();
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      await GET(request);

      // Assert
      expect(mockPrismaUser.upsert).not.toHaveBeenCalled();
    });

    it("fetch 자체가 네트워크 오류로 실패 시 302 리다이렉트로 /login?error=github_auth_failed로 이동한다", async () => {
      // Arrange
      global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      const response = await GET(request);
      const location = response.headers.get("location");

      // Assert
      expect(response.status).toBe(302);
      expect(location).toContain("/login");
      expect(location).toContain("error=github_auth_failed");
    });

    it("code 누락 시 DB를 조회하지 않는다", async () => {
      // Arrange
      const request = makeRequest(null);

      // Act
      await GET(request);

      // Assert
      expect(mockPrismaUser.upsert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("GitHub 응답에 access_token 필드가 없으면 /login?error=github_auth_failed로 리다이렉트한다", async () => {
      // Arrange
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (
          typeof url === "string" &&
          url.includes("github.com/login/oauth/access_token")
        ) {
          // access_token 필드 없이 응답
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ error: "bad_verification_code" }),
          } as Response);
        }
        return Promise.reject(new Error("Unexpected call"));
      });
      const request = makeRequest(MOCK_GITHUB_CODE);

      // Act
      const response = await GET(request);
      const location = response.headers.get("location");

      // Assert
      expect(response.status).toBe(302);
      expect(location).toContain("/login");
      expect(location).toContain("error=github_auth_failed");
    });
  });
});
