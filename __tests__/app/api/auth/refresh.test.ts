/**
 * POST /api/auth/refresh — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/auth/refresh/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt   → verifyToken/generateAccessToken을 mock으로 대체
 *
 * 동작 요약:
 *  - 쿠키에서 refresh_token을 읽어 verifyToken으로 검증
 *  - 검증 성공 시 새 access token 발급, access_token 쿠키에 설정
 *  - 실패 시 401 반환
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

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/auth/refresh/route";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, verifyToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  findUnique: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;
const mockGenerateAccessToken = generateAccessToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_REFRESH_TOKEN = "mock.refresh.token";
const MOCK_NEW_ACCESS_TOKEN = "mock.new.access.token";

const MOCK_TOKEN_PAYLOAD = {
  userId: MOCK_USER_ID,
  type: "refresh" as const,
  exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  iat: Math.floor(Date.now() / 1000),
};

const MOCK_EXISTING_USER = {
  id: MOCK_USER_ID,
  email: "test@example.com",
  name: "홍길동",
  passwordHash: "$2b$10$mockedHash",
  createdAt: new Date("2026-02-28T00:00:00.000Z"),
  updatedAt: new Date("2026-02-28T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// 유틸: refresh_token 쿠키를 포함한 NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequestWithCookie(refreshToken: string | null): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (refreshToken !== null) {
    headers["Cookie"] = `refresh_token=${refreshToken}`;
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
    // 기본 mock 반환값 설정 — 유효한 refresh token이 존재하는 상태
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_EXISTING_USER);
    mockGenerateAccessToken.mockReturnValue(MOCK_NEW_ACCESS_TOKEN);
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 refresh_token 쿠키로 요청 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 새 accessToken이 포함된다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("accessToken");
      expect(body.accessToken).toBe(MOCK_NEW_ACCESS_TOKEN);
    });

    it("새 access_token 쿠키가 응답 Set-Cookie 헤더에 설정된다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(MOCK_NEW_ACCESS_TOKEN);
    });

    it("verifyToken이 쿠키에서 읽어 온 refresh token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      await POST(request);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_REFRESH_TOKEN);
    });

    it("generateAccessToken이 토큰 페이로드의 userId로 호출된다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      await POST(request);

      // Assert
      expect(mockGenerateAccessToken).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it("DB에서 유저 존재 여부를 userId로 확인한다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_USER_ID }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 인증 실패 케이스 (401)
  // -------------------------------------------------------------------------

  describe("인증 실패 케이스", () => {
    it("refresh_token 쿠키가 없으면 401을 반환한다", async () => {
      // Arrange
      const request = makeRequestWithCookie(null);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("refresh_token 쿠키 없을 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequestWithCookie(null);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("잘못된(무효한) refresh token이면 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequestWithCookie("invalid.token.value");

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("만료된 refresh token이면 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequestWithCookie("expired.token.value");

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("token type이 'refresh'가 아닌 경우(access token 전달) 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockReturnValue({
        ...MOCK_TOKEN_PAYLOAD,
        type: "access", // refresh가 아닌 access token
      });
      const request = makeRequestWithCookie("access.token.passed.as.refresh");

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("token type 불일치 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      mockVerifyToken.mockReturnValue({
        ...MOCK_TOKEN_PAYLOAD,
        type: "access",
      });
      const request = makeRequestWithCookie("access.token.passed.as.refresh");

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("토큰에 해당하는 유저가 DB에 없으면 401을 반환한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("DB에 유저가 없을 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("인증 실패 시 새 access token을 발급하지 않는다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequestWithCookie("invalid.token.value");

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
    it("refresh_token 쿠키가 빈 문자열이면 401을 반환한다", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "refresh_token=",
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequestWithCookie(MOCK_REFRESH_TOKEN);

      // Act
      const response = await POST(request);

      // Assert
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });
  });
});
