/**
 * POST /api/auth/test-login — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/auth/test-login/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt   → 토큰 발급 함수를 mock으로 대체
 *
 * 동작 요약:
 *  - NODE_ENV=test 또는 development에서만 활성화
 *  - userId를 body에서 받아 해당 유저의 토큰 발급
 *  - NODE_ENV=production → 404
 *  - userId 누락 → 400
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

import { POST } from "@/app/api/auth/test-login/route";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  findUnique: jest.Mock;
};
const mockGenerateAccessToken = generateAccessToken as jest.Mock;
const mockGenerateRefreshToken = generateRefreshToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_REFRESH_TOKEN = "mock.refresh.token";

const MOCK_EXISTING_USER = {
  id: MOCK_USER_ID,
  email: "test@example.com",
  name: "테스트 유저",
  passwordHash: "$2b$10$mockedHash",
  createdAt: new Date("2026-02-28T00:00:00.000Z"),
  updatedAt: new Date("2026-02-28T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/test-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// 환경변수 제어 헬퍼
// ---------------------------------------------------------------------------

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(env: string): void {
  Object.defineProperty(process.env, "NODE_ENV", {
    value: env,
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/test-login", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_EXISTING_USER);
    mockGenerateAccessToken.mockReturnValue(MOCK_ACCESS_TOKEN);
    mockGenerateRefreshToken.mockReturnValue(MOCK_REFRESH_TOKEN);
  });

  afterEach(() => {
    // NODE_ENV를 원래 값으로 복구
    setNodeEnv(originalNodeEnv);
  });

  // -------------------------------------------------------------------------
  // NODE_ENV=test 환경 (활성화)
  // -------------------------------------------------------------------------

  describe("NODE_ENV=test 환경", () => {
    beforeEach(() => {
      setNodeEnv("test");
    });

    it("userId를 전달하면 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 accessToken이 포함된다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("accessToken");
      expect(body.accessToken).toBe(MOCK_ACCESS_TOKEN);
    });

    it("응답 Set-Cookie 헤더에 refresh_token httpOnly 쿠키가 설정된다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(MOCK_REFRESH_TOKEN);
      expect(setCookie?.toLowerCase()).toContain("httponly");
    });

    it("응답 Set-Cookie 헤더에 access_token 쿠키가 설정된다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(MOCK_ACCESS_TOKEN);
    });

    it("generateAccessToken과 generateRefreshToken이 전달된 userId로 호출된다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      await POST(request);

      // Assert
      expect(mockGenerateAccessToken).toHaveBeenCalledWith(MOCK_USER_ID);
      expect(mockGenerateRefreshToken).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it("userId 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({});

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("userId 누락 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({});

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("userId가 빈 문자열이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({ userId: "" });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("빈 body로 요청 시 400을 반환한다", async () => {
      // Arrange
      const request = new NextRequest(
        "http://localhost:3000/api/auth/test-login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "",
        }
      );

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // NODE_ENV=development 환경 (활성화)
  // -------------------------------------------------------------------------

  describe("NODE_ENV=development 환경", () => {
    beforeEach(() => {
      setNodeEnv("development");
    });

    it("development 환경에서 userId를 전달하면 200을 반환한다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("development 환경에서 응답 body에 accessToken이 포함된다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("accessToken");
      expect(body.accessToken).toBe(MOCK_ACCESS_TOKEN);
    });

    it("development 환경에서 userId 누락 시 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({});

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // NODE_ENV=production 환경 (비활성화)
  // -------------------------------------------------------------------------

  describe("NODE_ENV=production 환경", () => {
    beforeEach(() => {
      setNodeEnv("production");
    });

    it("production 환경에서 요청 시 404를 반환한다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(404);
    });

    it("production 환경에서 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("production 환경에서 DB를 조회하지 않는다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.findUnique).not.toHaveBeenCalled();
    });

    it("production 환경에서 토큰을 발급하지 않는다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      await POST(request);

      // Assert
      expect(mockGenerateAccessToken).not.toHaveBeenCalled();
      expect(mockGenerateRefreshToken).not.toHaveBeenCalled();
    });

    it("production 환경에서 userId 없이 요청해도 404를 반환한다 (환경 체크가 우선)", async () => {
      // Arrange
      const request = makeRequest({});

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    beforeEach(() => {
      setNodeEnv("test");
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest({ userId: MOCK_USER_ID });

      // Act
      const response = await POST(request);

      // Assert
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });

    it("숫자 타입 userId를 전달해도 400을 반환한다 (문자열 타입이어야 함)", async () => {
      // Arrange
      const request = makeRequest({ userId: 12345 }); // 숫자 타입

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });
  });
});
