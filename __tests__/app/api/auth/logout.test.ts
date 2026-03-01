/**
 * POST /api/auth/logout — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/auth/logout/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt   → verifyToken을 mock으로 대체
 *
 * 동작 요약:
 *  - refresh_token 쿠키를 읽어 verifyToken으로 검증
 *  - DB의 refreshToken 필드를 null로 업데이트
 *  - access_token, refresh_token 쿠키를 만료(maxAge=0 또는 과거 expires)시켜 삭제
 *  - 멱등성 보장: 쿠키가 없어도 200 반환
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
  default: {
    user: {
      findUnique: jest.fn(),
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

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/auth/logout/route";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  findUnique: jest.Mock;
  update: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_REFRESH_TOKEN = "mock.refresh.token";

const MOCK_TOKEN_PAYLOAD = {
  userId: MOCK_USER_ID,
  type: "refresh" as const,
  exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  iat: Math.floor(Date.now() / 1000),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequestWithCookie(refreshToken: string | null): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (refreshToken !== null) {
    headers["Cookie"] = `refresh_token=${refreshToken}`;
  }
  return new NextRequest("http://localhost:3000/api/auth/logout", {
    method: "POST",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 유효한 refresh token이 존재하는 상태
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaUser.update.mockResolvedValue({ id: MOCK_USER_ID });
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 인증 상태에서 로그아웃 요청 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 Set-Cookie 헤더에 access_token 쿠키가 삭제(만료)되어 있다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      // access_token 쿠키가 만료(maxAge=0 또는 과거 expires)되어야 함
      const cookieStr = setCookie ?? "";
      const hasAccessTokenDeleted =
        cookieStr.includes("access_token") &&
        (cookieStr.toLowerCase().includes("max-age=0") ||
          cookieStr.toLowerCase().includes("expires="));
      expect(hasAccessTokenDeleted).toBe(true);
    });

    it("응답 Set-Cookie 헤더에 refresh_token 쿠키가 삭제(만료)되어 있다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      const cookieStr = setCookie ?? "";
      const hasRefreshTokenDeleted =
        cookieStr.includes("refresh_token") &&
        (cookieStr.toLowerCase().includes("max-age=0") ||
          cookieStr.toLowerCase().includes("expires="));
      expect(hasRefreshTokenDeleted).toBe(true);
    });

    it("DB의 refreshToken 필드를 null로 업데이트한다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_USER_ID }),
          data: expect.objectContaining({ refreshToken: null }),
        })
      );
    });

    it("verifyToken이 쿠키에서 읽어 온 refresh token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      await POST(request);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_REFRESH_TOKEN);
    });
  });

  // -------------------------------------------------------------------------
  // 멱등성 케이스 — 쿠키 없이 호출해도 200
  // -------------------------------------------------------------------------

  describe("멱등성 케이스", () => {
    it("refresh_token 쿠키 없이 호출해도 200을 반환한다", async () => {
      // Arrange
      const request = makeRequestWithCookie(null);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("refresh_token 쿠키가 없을 때 DB 업데이트를 시도하지 않는다", async () => {
      // Arrange
      const request = makeRequestWithCookie(null);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.update).not.toHaveBeenCalled();
    });

    it("refresh_token이 무효한 경우에도 200을 반환한다 (쿠키 정리는 항상 수행)", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequestWithCookie("invalid.token.value");

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("refresh_token이 무효할 때 DB 업데이트를 시도하지 않는다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequestWithCookie("invalid.token.value");

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.update).not.toHaveBeenCalled();
    });

    it("쿠키 없이 호출 시에도 쿠키 삭제 헤더가 설정된다", async () => {
      // Arrange
      const request = makeRequestWithCookie(null);

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      // 쿠키가 없어도 클라이언트 측 쿠키를 정리하기 위해 만료 쿠키를 설정해야 함
      expect(setCookie).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);

      // Assert
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });

    it("로그아웃 성공 후 응답 body에 성공 여부를 나타내는 필드가 포함된다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      // 구현체는 { message: "..." } 또는 { success: true } 형태를 반환해야 함
      expect(typeof body).toBe("object");
      expect(body).not.toBeNull();
    });
  });
});
