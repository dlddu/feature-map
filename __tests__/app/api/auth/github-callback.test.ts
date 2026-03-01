/**
 * GET /api/auth/github/callback — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/auth/github/callback/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt   → 토큰 발급 함수를 mock으로 대체
 *  - fetch            → GitHub OAuth API 호출을 mock으로 대체
 *
 * GitHub OAuth 흐름:
 *  1. code + state 파라미터 수신
 *  2. code → access token 교환 (POST https://github.com/login/oauth/access_token)
 *  3. access token으로 유저 정보 조회 (GET https://api.github.com/user)
 *  4. 유저 생성 또는 조회 (upsert)
 *  5. JWT 쿠키 설정 → /dashboard 리다이렉트
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
      upsert: jest.fn(),
      create: jest.fn(),
    },
  },
  default: {
    user: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
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

import { GET } from "@/app/api/auth/github/callback/route";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  findUnique: jest.Mock;
  upsert: jest.Mock;
  create: jest.Mock;
};
const mockGenerateAccessToken = generateAccessToken as jest.Mock;
const mockGenerateRefreshToken = generateRefreshToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const VALID_CODE = "github-oauth-code-123";
const VALID_STATE = "csrf-state-token";
const GITHUB_ACCESS_TOKEN = "ghs_mockGitHubAccessToken";

const MOCK_GITHUB_USER = {
  id: 12345,
  login: "octocat",
  name: "The Octocat",
  email: "octocat@github.com",
  avatar_url: "https://github.com/images/error/octocat_happy.gif",
};

const MOCK_DB_USER = {
  id: "cuid-user-001",
  githubId: MOCK_GITHUB_USER.id,
  email: MOCK_GITHUB_USER.email,
  name: MOCK_GITHUB_USER.name,
  avatarUrl: MOCK_GITHUB_USER.avatar_url,
  accessToken: GITHUB_ACCESS_TOKEN,
};

const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_REFRESH_TOKEN = "mock.refresh.token";

// ---------------------------------------------------------------------------
// 유틸: fetch mock 설정 헬퍼
// ---------------------------------------------------------------------------

function setupFetchMock(overrides: {
  tokenExchangeOk?: boolean;
  userInfoOk?: boolean;
  githubUser?: Partial<typeof MOCK_GITHUB_USER>;
} = {}) {
  const {
    tokenExchangeOk = true,
    userInfoOk = true,
    githubUser = MOCK_GITHUB_USER,
  } = overrides;

  const mockFetch = jest.fn();

  // 첫 번째 호출: token exchange
  if (tokenExchangeOk) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: GITHUB_ACCESS_TOKEN, token_type: "bearer" }),
    } as Response);
  } else {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "bad_verification_code" }),
    } as unknown as Response);
  }

  // 두 번째 호출: user info (token exchange 성공 시에만)
  if (tokenExchangeOk && userInfoOk) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...MOCK_GITHUB_USER, ...githubUser }),
    } as Response);
  }

  global.fetch = mockFetch;
  return mockFetch;
}

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/github/callback");
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return new NextRequest(url.toString(), {
    method: "GET",
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/auth/github/callback", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정
    setupFetchMock();
    mockPrismaUser.findUnique.mockResolvedValue(null);
    mockPrismaUser.upsert.mockResolvedValue(MOCK_DB_USER);
    mockPrismaUser.create.mockResolvedValue(MOCK_DB_USER);
    mockGenerateAccessToken.mockReturnValue(MOCK_ACCESS_TOKEN);
    mockGenerateRefreshToken.mockReturnValue(MOCK_REFRESH_TOKEN);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy Path: 신규 유저
  // -------------------------------------------------------------------------

  describe("성공 케이스 - 신규 유저 (happy path)", () => {
    it("유효한 code로 요청 시 /dashboard로 리다이렉트한다", async () => {
      // Arrange
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/dashboard");
    });

    it("access_token 쿠키가 HttpOnly로 설정된다", async () => {
      // Arrange
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      const response = await GET(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(MOCK_ACCESS_TOKEN);
      expect(setCookie?.toLowerCase()).toContain("httponly");
    });

    it("refresh_token 쿠키가 HttpOnly로 설정된다", async () => {
      // Arrange
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      const response = await GET(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(MOCK_REFRESH_TOKEN);
      expect(setCookie?.toLowerCase()).toContain("httponly");
    });

    it("쿠키 이름이 access_token과 refresh_token이다", async () => {
      // Arrange
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      const response = await GET(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).toContain("access_token=");
      expect(setCookie).toContain("refresh_token=");
    });

    it("GitHub OAuth code를 access token으로 교환하기 위해 fetch가 호출된다", async () => {
      // Arrange
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      await GET(request);

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("github.com/login/oauth/access_token"),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("GitHub 유저 정보 조회를 위해 fetch가 호출된다", async () => {
      // Arrange
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      await GET(request);

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("api.github.com/user"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining(GITHUB_ACCESS_TOKEN),
          }),
        })
      );
    });

    it("신규 유저인 경우 DB에 유저가 생성된다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null); // 기존 유저 없음
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      await GET(request);

      // Assert — upsert 또는 create 중 하나가 호출되어야 함
      const wasUpsertCalled = mockPrismaUser.upsert.mock.calls.length > 0;
      const wasCreateCalled = mockPrismaUser.create.mock.calls.length > 0;
      expect(wasUpsertCalled || wasCreateCalled).toBe(true);
    });

    it("generateAccessToken과 generateRefreshToken이 userId로 호출된다", async () => {
      // Arrange
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      await GET(request);

      // Assert
      expect(mockGenerateAccessToken).toHaveBeenCalledWith(MOCK_DB_USER.id);
      expect(mockGenerateRefreshToken).toHaveBeenCalledWith(MOCK_DB_USER.id);
    });
  });

  // -------------------------------------------------------------------------
  // Happy Path: 기존 유저
  // -------------------------------------------------------------------------

  describe("성공 케이스 - 기존 유저", () => {
    it("기존 유저인 경우 유저 정보를 업데이트한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(MOCK_DB_USER); // 기존 유저 존재
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      await GET(request);

      // Assert — upsert 또는 update가 호출되어야 함
      const wasUpsertCalled = mockPrismaUser.upsert.mock.calls.length > 0;
      expect(wasUpsertCalled).toBe(true);
    });

    it("기존 유저도 /dashboard로 리다이렉트한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(MOCK_DB_USER);
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/dashboard");
    });
  });

  // -------------------------------------------------------------------------
  // 실패 케이스 (리다이렉트)
  // -------------------------------------------------------------------------

  describe("실패 케이스", () => {
    it("code 파라미터 없이 요청 시 /login으로 리다이렉트한다", async () => {
      // Arrange
      const request = makeRequest({ state: VALID_STATE }); // code 없음

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });

    it("code와 state 모두 없으면 /login으로 리다이렉트한다", async () => {
      // Arrange
      const request = makeRequest({}); // 파라미터 없음

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });

    it("GitHub token 교환 실패 시 /login으로 리다이렉트한다", async () => {
      // Arrange
      setupFetchMock({ tokenExchangeOk: false });
      const request = makeRequest({ code: "invalid-code", state: VALID_STATE });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });

    it("GitHub API 호출 실패 시 /login으로 리다이렉트한다", async () => {
      // Arrange
      setupFetchMock({ userInfoOk: false });
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });

    it("실패 시 JWT 쿠키를 설정하지 않는다", async () => {
      // Arrange
      const request = makeRequest({}); // code 없음

      // Act
      const response = await GET(request);

      // Assert
      expect(mockGenerateAccessToken).not.toHaveBeenCalled();
      expect(mockGenerateRefreshToken).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("GitHub 유저의 email이 null이어도 유저를 생성한다 (email 없는 계정)", async () => {
      // Arrange
      setupFetchMock({ githubUser: { ...MOCK_GITHUB_USER, email: null as unknown as string } });
      const request = makeRequest({ code: VALID_CODE, state: VALID_STATE });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/dashboard");
    });

    it("code 파라미터가 빈 문자열이면 /login으로 리다이렉트한다", async () => {
      // Arrange
      const request = makeRequest({ code: "", state: VALID_STATE });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });
  });
});
