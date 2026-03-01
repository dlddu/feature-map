/**
 * POST /api/auth/refresh — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/auth/refresh/route.ts
 *
 * Mock 전략:
 *  - @/lib/auth/jwt   → verifyToken, generateAccessToken을 mock으로 대체
 *
 * 시나리오:
 *  - 유효한 refresh_token 쿠키 → 새 Access Token 쿠키 발급 + 200
 *  - 만료/무효 refresh_token   → 401
 *  - refresh_token 쿠키 없음   → 401
 */

import { NextRequest } from "next/server";

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

import { POST } from "@/app/api/auth/refresh/route";
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
const MOCK_REFRESH_TOKEN = "mock.refresh.token";
const MOCK_ACCESS_TOKEN = "mock.new.access.token";

const VALID_REFRESH_PAYLOAD = {
  userId: VALID_USER_ID,
  type: "refresh" as const,
  exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7일 후
  iat: Math.floor(Date.now() / 1000),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(cookieHeader?: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  return new NextRequest("http://localhost:3000/api/auth/refresh", {
    method: "POST",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 (각 테스트에서 필요에 따라 덮어씀)
    mockVerifyToken.mockReturnValue(VALID_REFRESH_PAYLOAD);
    mockGenerateAccessToken.mockReturnValue(MOCK_ACCESS_TOKEN);
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 refresh_token 쿠키로 요청 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest(`refresh_token=${MOCK_REFRESH_TOKEN}`);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("새 access_token이 httpOnly 쿠키로 Set-Cookie 헤더에 설정된다", async () => {
      // Arrange
      const request = makeRequest(`refresh_token=${MOCK_REFRESH_TOKEN}`);

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(MOCK_ACCESS_TOKEN);
      expect(setCookie?.toLowerCase()).toContain("httponly");
    });

    it("새 쿠키 이름이 access_token이다", async () => {
      // Arrange
      const request = makeRequest(`refresh_token=${MOCK_REFRESH_TOKEN}`);

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).toContain("access_token=");
    });

    it("새 쿠키에 Path=/ 속성이 설정된다", async () => {
      // Arrange
      const request = makeRequest(`refresh_token=${MOCK_REFRESH_TOKEN}`);

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).toContain("Path=/");
    });

    it("새 쿠키에 SameSite=Lax 속성이 설정된다", async () => {
      // Arrange
      const request = makeRequest(`refresh_token=${MOCK_REFRESH_TOKEN}`);

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie?.toLowerCase()).toContain("samesite=lax");
    });

    it("verifyToken이 쿠키에서 추출한 refresh_token으로 호출된다", async () => {
      // Arrange
      const request = makeRequest(`refresh_token=${MOCK_REFRESH_TOKEN}`);

      // Act
      await POST(request);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_REFRESH_TOKEN);
    });

    it("generateAccessToken이 payload에서 추출한 userId로 호출된다", async () => {
      // Arrange
      const request = makeRequest(`refresh_token=${MOCK_REFRESH_TOKEN}`);

      // Act
      await POST(request);

      // Assert
      expect(mockGenerateAccessToken).toHaveBeenCalledWith(VALID_USER_ID);
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest(`refresh_token=${MOCK_REFRESH_TOKEN}`);

      // Act
      const response = await POST(request);

      // Assert
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });
  });

  // -------------------------------------------------------------------------
  // 토큰 무효/만료 (401)
  // -------------------------------------------------------------------------

  describe("토큰 무효·만료 케이스", () => {
    it("refresh_token 쿠키가 없으면 401을 반환한다", async () => {
      // Arrange
      const request = makeRequest(); // 쿠키 없음

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("만료된 refresh_token이면 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest(`refresh_token=expired.refresh.token`);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("서명이 올바르지 않은 refresh_token이면 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid signature");
      });
      const request = makeRequest(`refresh_token=tampered.refresh.token`);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("형식이 잘못된 토큰이면 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt malformed");
      });
      const request = makeRequest(`refresh_token=not-a-valid-jwt`);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("토큰 type이 refresh가 아닌 access이면 401을 반환한다", async () => {
      // Arrange — access token을 refresh 엔드포인트에 전달하는 오용 시나리오
      mockVerifyToken.mockReturnValue({
        ...VALID_REFRESH_PAYLOAD,
        type: "access", // 잘못된 타입
      });
      const request = makeRequest(`refresh_token=access.token.used.as.refresh`);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("401 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest(); // 쿠키 없음

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("토큰 검증 실패 시 새 access_token을 발급하지 않는다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest(`refresh_token=expired.refresh.token`);

      // Act
      await POST(request);

      // Assert
      expect(mockGenerateAccessToken).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("refresh_token 쿠키 값이 빈 문자열이면 401을 반환한다", async () => {
      // Arrange
      const request = makeRequest(`refresh_token=`);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("여러 쿠키 중 refresh_token을 올바르게 추출한다", async () => {
      // Arrange
      const request = makeRequest(
        `session_id=some-session; refresh_token=${MOCK_REFRESH_TOKEN}; other=value`
      );

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_REFRESH_TOKEN);
    });
  });
});
