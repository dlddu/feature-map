/**
 * JWT Middleware — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/middleware.ts
 *
 * Mock 전략:
 *  - @/lib/auth/jwt → verifyToken, generateAccessToken을 mock으로 대체
 *  - next/server    → NextRequest / NextResponse는 실제 구현 사용
 *                     (jest.config.ts의 moduleNameMapper로 해소)
 *
 * 미들웨어 동작:
 *  1. 보호된 경로(/dashboard 등) 접근 시 access_token 쿠키 검증
 *  2. 유효한 토큰      → 요청 통과 (NextResponse.next())
 *  3. 만료된 Access Token + 유효한 Refresh Token → 자동 갱신 후 통과
 *  4. 토큰 없음/무효  → /login으로 리다이렉트
 *  5. 공개 경로       → 항상 통과
 */

import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — jest.mock은 호이스팅되므로 import 전에 선언
// ---------------------------------------------------------------------------

jest.mock("@/lib/auth/jwt", () => ({
  __esModule: true,
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyToken: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { middleware } from "@/middleware";
import { generateAccessToken, verifyToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockVerifyToken = verifyToken as jest.Mock;
const mockGenerateAccessToken = generateAccessToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const VALID_USER_ID = "cuid-user-001";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_NEW_ACCESS_TOKEN = "mock.new.access.token";
const MOCK_REFRESH_TOKEN = "mock.refresh.token";

const VALID_ACCESS_PAYLOAD = {
  userId: VALID_USER_ID,
  type: "access" as const,
  exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15분 후
  iat: Math.floor(Date.now() / 1000),
};

const VALID_REFRESH_PAYLOAD = {
  userId: VALID_USER_ID,
  type: "refresh" as const,
  exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7일 후
  iat: Math.floor(Date.now() / 1000),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
  path: string,
  cookies: Record<string, string> = {}
): NextRequest {
  const url = `http://localhost:3000${path}`;
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

  const headers: Record<string, string> = {};
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  return new NextRequest(url, { headers });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JWT Middleware", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정
    mockVerifyToken.mockReturnValue(VALID_ACCESS_PAYLOAD);
    mockGenerateAccessToken.mockReturnValue(MOCK_NEW_ACCESS_TOKEN);
  });

  // -------------------------------------------------------------------------
  // 공개 경로 — 항상 통과
  // -------------------------------------------------------------------------

  describe("공개 경로 (인증 불필요)", () => {
    it("/login 경로는 토큰 없이도 통과한다", async () => {
      // Arrange
      const request = makeRequest("/login"); // 쿠키 없음

      // Act
      const response = await middleware(request);

      // Assert — 리다이렉트가 아닌 통과 응답이어야 함
      expect(response.status).not.toBe(302);
    });

    it("/api/auth/login 경로는 토큰 없이도 통과한다", async () => {
      // Arrange
      const request = makeRequest("/api/auth/login");

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).not.toBe(302);
    });

    it("/api/auth/register 경로는 토큰 없이도 통과한다", async () => {
      // Arrange
      const request = makeRequest("/api/auth/register");

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).not.toBe(302);
    });

    it("/api/auth/refresh 경로는 토큰 없이도 통과한다", async () => {
      // Arrange
      const request = makeRequest("/api/auth/refresh");

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).not.toBe(302);
    });

    it("/api/auth/github/callback 경로는 토큰 없이도 통과한다", async () => {
      // Arrange
      const request = makeRequest("/api/auth/github/callback");

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).not.toBe(302);
    });

    it("/ (루트) 경로는 토큰 없이도 통과한다", async () => {
      // Arrange
      const request = makeRequest("/");

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).not.toBe(302);
    });
  });

  // -------------------------------------------------------------------------
  // 유효한 Access Token — 요청 통과
  // -------------------------------------------------------------------------

  describe("유효한 Access Token", () => {
    it("/dashboard 접근 시 유효한 access_token이면 통과한다", async () => {
      // Arrange
      mockVerifyToken.mockReturnValue(VALID_ACCESS_PAYLOAD);
      const request = makeRequest("/dashboard", {
        access_token: MOCK_ACCESS_TOKEN,
      });

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).not.toBe(302);
    });

    it("유효한 토큰으로 통과 시 verifyToken이 access_token으로 호출된다", async () => {
      // Arrange
      const request = makeRequest("/dashboard", {
        access_token: MOCK_ACCESS_TOKEN,
      });

      // Act
      await middleware(request);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("유효한 토큰으로 통과 시 새 토큰을 발급하지 않는다", async () => {
      // Arrange
      const request = makeRequest("/dashboard", {
        access_token: MOCK_ACCESS_TOKEN,
      });

      // Act
      await middleware(request);

      // Assert
      expect(mockGenerateAccessToken).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 토큰 없음/무효 — /login 리다이렉트
  // -------------------------------------------------------------------------

  describe("인증 실패 — /login 리다이렉트", () => {
    it("access_token 쿠키 없이 /dashboard 접근 시 /login으로 리다이렉트한다", async () => {
      // Arrange
      const request = makeRequest("/dashboard"); // 쿠키 없음

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });

    it("무효한 access_token으로 /dashboard 접근 시 /login으로 리다이렉트한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid signature");
      });
      const request = makeRequest("/dashboard", {
        access_token: "invalid.token",
      });

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });

    it("만료된 access_token이고 refresh_token도 없으면 /login으로 리다이렉트한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest("/dashboard", {
        access_token: "expired.access.token",
        // refresh_token 없음
      });

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });

    it("만료된 access_token이고 refresh_token도 만료되면 /login으로 리다이렉트한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest("/dashboard", {
        access_token: "expired.access.token",
        refresh_token: "expired.refresh.token",
      });

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });

    it("/dashboard 외 보호된 경로도 미인증 시 /login으로 리다이렉트한다", async () => {
      // Arrange
      const request = makeRequest("/dashboard/settings"); // 쿠키 없음

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });
  });

  // -------------------------------------------------------------------------
  // 자동 토큰 갱신 — 만료된 Access Token + 유효한 Refresh Token
  // -------------------------------------------------------------------------

  describe("자동 토큰 갱신 (Access Token 만료 + 유효한 Refresh Token)", () => {
    it("만료된 access_token + 유효한 refresh_token이면 요청을 통과시킨다", async () => {
      // Arrange
      let callCount = 0;
      mockVerifyToken.mockImplementation((token: string) => {
        callCount++;
        if (callCount === 1) {
          // access_token 검증: 만료
          throw new Error("jwt expired");
        }
        // refresh_token 검증: 유효
        return VALID_REFRESH_PAYLOAD;
      });
      mockGenerateAccessToken.mockReturnValue(MOCK_NEW_ACCESS_TOKEN);

      const request = makeRequest("/dashboard", {
        access_token: "expired.access.token",
        refresh_token: MOCK_REFRESH_TOKEN,
      });

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).not.toBe(302);
    });

    it("자동 갱신 시 새 access_token 쿠키를 응답에 설정한다", async () => {
      // Arrange
      let callCount = 0;
      mockVerifyToken.mockImplementation((token: string) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("jwt expired");
        }
        return VALID_REFRESH_PAYLOAD;
      });
      mockGenerateAccessToken.mockReturnValue(MOCK_NEW_ACCESS_TOKEN);

      const request = makeRequest("/dashboard", {
        access_token: "expired.access.token",
        refresh_token: MOCK_REFRESH_TOKEN,
      });

      // Act
      const response = await middleware(request);

      // Assert
      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toContain(MOCK_NEW_ACCESS_TOKEN);
      expect(setCookie).toContain("access_token=");
    });

    it("자동 갱신 시 generateAccessToken이 userId로 호출된다", async () => {
      // Arrange
      let callCount = 0;
      mockVerifyToken.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error("jwt expired");
        }
        return VALID_REFRESH_PAYLOAD;
      });

      const request = makeRequest("/dashboard", {
        access_token: "expired.access.token",
        refresh_token: MOCK_REFRESH_TOKEN,
      });

      // Act
      await middleware(request);

      // Assert
      expect(mockGenerateAccessToken).toHaveBeenCalledWith(VALID_USER_ID);
    });

    it("자동 갱신 시 새 access_token 쿠키에 HttpOnly 속성이 설정된다", async () => {
      // Arrange
      let callCount = 0;
      mockVerifyToken.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error("jwt expired");
        }
        return VALID_REFRESH_PAYLOAD;
      });

      const request = makeRequest("/dashboard", {
        access_token: "expired.access.token",
        refresh_token: MOCK_REFRESH_TOKEN,
      });

      // Act
      const response = await middleware(request);

      // Assert
      const setCookie = response.headers.get("set-cookie");
      expect(setCookie?.toLowerCase()).toContain("httponly");
    });

    it("refresh_token의 type이 refresh가 아니면 /login으로 리다이렉트한다", async () => {
      // Arrange
      let callCount = 0;
      mockVerifyToken.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error("jwt expired");
        }
        // access type 토큰이 refresh 쿠키에 있는 오용 시나리오
        return { ...VALID_REFRESH_PAYLOAD, type: "access" };
      });

      const request = makeRequest("/dashboard", {
        access_token: "expired.access.token",
        refresh_token: "access.token.used.as.refresh",
      });

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("access_token 쿠키 값이 빈 문자열이면 /login으로 리다이렉트한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("Token is required");
      });
      const request = makeRequest("/dashboard", { access_token: "" });

      // Act
      const response = await middleware(request);

      // Assert
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
    });

    it("/_next/static 등 정적 리소스 경로는 미들웨어가 처리하지 않는다", async () => {
      // Arrange
      const request = makeRequest("/_next/static/chunks/main.js");

      // Act
      const response = await middleware(request);

      // Assert — 리다이렉트하지 않아야 함
      expect(response.status).not.toBe(302);
    });
  });
});
