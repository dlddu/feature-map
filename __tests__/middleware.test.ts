/**
 * src/middleware.ts — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/middleware.ts
 *
 * Mock 전략:
 *  - @/lib/auth/jwt   → verifyToken을 mock으로 대체
 *  - next/server      → NextResponse를 spy하여 next() / redirect() 호출 검증
 *  - global.fetch     → /api/auth/refresh 내부 호출을 mock으로 시뮬레이션
 *
 * 동작 요약:
 *  - 보호 경로(/dashboard/*)에 대해 쿠키의 access_token을 verifyToken으로 검증
 *  - 유효한 토큰 → NextResponse.next() 통과
 *  - 토큰 없음 → /login 리다이렉트
 *  - 만료/무효 토큰 → refresh_token 쿠키로 /api/auth/refresh 호출
 *    - refresh 성공 → 새 access_token 설정 후 통과
 *    - refresh 실패 → /login 리다이렉트
 *  - 공개 경로(/login, /signup, /api/auth/*)는 미들웨어 적용 제외
 */

import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/auth/jwt", () => ({
  __esModule: true,
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyToken: jest.fn(),
}));

// NextResponse를 spy할 수 있도록 next/server를 부분 mock
// 실제 NextResponse의 next()와 redirect()를 spy로 감쌈
const mockNextResponseNext = jest.fn();
const mockNextResponseRedirect = jest.fn();

jest.mock("next/server", () => {
  const actual = jest.requireActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      next: (...args: Parameters<typeof actual.NextResponse.next>) => {
        mockNextResponseNext(...args);
        return actual.NextResponse.next(...args);
      },
      redirect: (...args: Parameters<typeof actual.NextResponse.redirect>) => {
        mockNextResponseRedirect(...args);
        return actual.NextResponse.redirect(...args);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { middleware } from "@/middleware";
import { verifyToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockVerifyToken = verifyToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_REFRESH_TOKEN = "mock.refresh.token";
const MOCK_NEW_ACCESS_TOKEN = "mock.new.access.token";

const MOCK_TOKEN_PAYLOAD = {
  userId: MOCK_USER_ID,
  type: "access" as const,
  exp: Math.floor(Date.now() / 1000) + 15 * 60,
  iat: Math.floor(Date.now() / 1000),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
  pathname: string,
  options: {
    accessToken?: string;
    refreshToken?: string;
  } = {}
): NextRequest {
  const cookieParts: string[] = [];
  if (options.accessToken) {
    cookieParts.push(`access_token=${options.accessToken}`);
  }
  if (options.refreshToken) {
    cookieParts.push(`refresh_token=${options.refreshToken}`);
  }

  const headers: Record<string, string> = {};
  if (cookieParts.length > 0) {
    headers["Cookie"] = cookieParts.join("; ");
  }

  return new NextRequest(`http://localhost:3000${pathname}`, {
    method: "GET",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("middleware", () => {
  beforeEach(() => {
    mockNextResponseNext.mockClear();
    mockNextResponseRedirect.mockClear();
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 유효한 토큰 — 통과
  // -------------------------------------------------------------------------

  describe("유효한 access_token이 있는 경우", () => {
    it("/dashboard 경로에서 유효한 access_token이 있으면 NextResponse.next()를 호출한다", async () => {
      // Arrange
      const request = makeRequest("/dashboard", {
        accessToken: MOCK_ACCESS_TOKEN,
      });

      // Act
      await middleware(request);

      // Assert
      expect(mockNextResponseNext).toHaveBeenCalled();
      expect(mockNextResponseRedirect).not.toHaveBeenCalled();
    });

    it("/dashboard/some/path 경로에서도 유효한 토큰이 있으면 통과한다", async () => {
      // Arrange
      const request = makeRequest("/dashboard/some/path", {
        accessToken: MOCK_ACCESS_TOKEN,
      });

      // Act
      await middleware(request);

      // Assert
      expect(mockNextResponseNext).toHaveBeenCalled();
      expect(mockNextResponseRedirect).not.toHaveBeenCalled();
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest("/dashboard", {
        accessToken: MOCK_ACCESS_TOKEN,
      });

      // Act
      await middleware(request);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });
  });

  // -------------------------------------------------------------------------
  // 토큰 없음 — /login 리다이렉트
  // -------------------------------------------------------------------------

  describe("access_token 쿠키가 없는 경우", () => {
    it("/dashboard 경로에서 access_token이 없으면 /login으로 리다이렉트한다", async () => {
      // Arrange
      const request = makeRequest("/dashboard"); // 쿠키 없음

      // Act
      await middleware(request);

      // Assert
      expect(mockNextResponseRedirect).toHaveBeenCalled();
      const redirectArg = mockNextResponseRedirect.mock.calls[0][0] as URL;
      expect(redirectArg.pathname).toBe("/login");
    });

    it("토큰 없을 시 NextResponse.next()를 호출하지 않는다", async () => {
      // Arrange
      const request = makeRequest("/dashboard");

      // Act
      await middleware(request);

      // Assert
      expect(mockNextResponseNext).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 만료/무효 토큰 + refresh 시도
  // -------------------------------------------------------------------------

  describe("access_token이 만료되었거나 무효한 경우", () => {
    it("만료된 access_token에 유효한 refresh_token이 있으면 /api/auth/refresh를 호출한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accessToken: MOCK_NEW_ACCESS_TOKEN }),
      } as Response);
      const request = makeRequest("/dashboard", {
        accessToken: "expired.access.token",
        refreshToken: MOCK_REFRESH_TOKEN,
      });

      // Act
      await middleware(request);

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/refresh"),
        expect.any(Object)
      );
    });

    it("refresh 성공 시 새 access_token을 응답 쿠키에 설정하고 통과한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accessToken: MOCK_NEW_ACCESS_TOKEN }),
      } as Response);
      const request = makeRequest("/dashboard", {
        accessToken: "expired.access.token",
        refreshToken: MOCK_REFRESH_TOKEN,
      });

      // Act
      const response = await middleware(request);

      // Assert
      expect(mockNextResponseNext).toHaveBeenCalled();
      const setCookie = response?.headers.get("set-cookie");
      expect(setCookie).toContain(MOCK_NEW_ACCESS_TOKEN);
    });

    it("refresh 실패 시 /login으로 리다이렉트한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "invalid refresh token" }),
      } as Response);
      const request = makeRequest("/dashboard", {
        accessToken: "expired.access.token",
        refreshToken: "invalid.refresh.token",
      });

      // Act
      await middleware(request);

      // Assert
      expect(mockNextResponseRedirect).toHaveBeenCalled();
      const redirectArg = mockNextResponseRedirect.mock.calls[0][0] as URL;
      expect(redirectArg.pathname).toBe("/login");
    });

    it("refresh_token도 없는 경우 /api/auth/refresh를 호출하지 않고 /login으로 리다이렉트한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest("/dashboard", {
        accessToken: "expired.access.token",
        // refreshToken 없음
      });

      // Act
      await middleware(request);

      // Assert
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockNextResponseRedirect).toHaveBeenCalled();
      const redirectArg = mockNextResponseRedirect.mock.calls[0][0] as URL;
      expect(redirectArg.pathname).toBe("/login");
    });

    it("무효한 access_token(서명 불일치)에도 refresh를 시도한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid signature");
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accessToken: MOCK_NEW_ACCESS_TOKEN }),
      } as Response);
      const request = makeRequest("/dashboard", {
        accessToken: "tampered.access.token",
        refreshToken: MOCK_REFRESH_TOKEN,
      });

      // Act
      await middleware(request);

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/refresh"),
        expect.any(Object)
      );
    });
  });

  // -------------------------------------------------------------------------
  // 공개 경로 — 미들웨어 적용 제외
  // -------------------------------------------------------------------------

  describe("공개 경로 (미들웨어 적용 제외)", () => {
    const publicPaths = [
      "/login",
      "/signup",
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/refresh",
      "/api/auth/logout",
      "/api/auth/github/callback",
    ];

    it.each(publicPaths)(
      "%s 경로는 토큰 없이도 접근 가능하다 (미들웨어 통과)",
      async (pathname) => {
        // Arrange
        const request = makeRequest(pathname); // 쿠키 없음

        // Act
        await middleware(request);

        // Assert
        // 공개 경로는 verifyToken 호출 없이 바로 통과해야 함
        expect(mockVerifyToken).not.toHaveBeenCalled();
        expect(mockNextResponseRedirect).not.toHaveBeenCalled();
      }
    );

    it("/login 경로는 토큰 없이 NextResponse.next()를 반환한다", async () => {
      // Arrange
      const request = makeRequest("/login");

      // Act
      await middleware(request);

      // Assert
      expect(mockNextResponseNext).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("access_token 쿠키가 빈 문자열이면 /login으로 리다이렉트한다", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/dashboard", {
        method: "GET",
        headers: {
          Cookie: "access_token=",
        },
      });

      // Act
      await middleware(request);

      // Assert
      expect(mockNextResponseRedirect).toHaveBeenCalled();
    });

    it("fetch 네트워크 오류 시 /login으로 리다이렉트한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
      const request = makeRequest("/dashboard", {
        accessToken: "expired.access.token",
        refreshToken: MOCK_REFRESH_TOKEN,
      });

      // Act
      await middleware(request);

      // Assert
      expect(mockNextResponseRedirect).toHaveBeenCalled();
      const redirectArg = mockNextResponseRedirect.mock.calls[0][0] as URL;
      expect(redirectArg.pathname).toBe("/login");
    });
  });
});
