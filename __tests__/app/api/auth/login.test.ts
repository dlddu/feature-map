/**
 * POST /api/auth/login — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/auth/login/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - bcrypt           → 해싱/검증 로직을 mock으로 대체
 *  - @/lib/auth/jwt   → 토큰 발급 함수를 mock으로 대체
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

jest.mock(
  "bcrypt",
  () => ({
    __esModule: true,
    default: {
      hash: jest.fn(),
      compare: jest.fn(),
    },
    hash: jest.fn(),
    compare: jest.fn(),
  }),
  { virtual: true }
);

jest.mock("@/lib/auth/jwt", () => ({
  __esModule: true,
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyToken: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/auth/login/route";
import { prisma } from "@/lib/db/client";
import bcrypt from "bcrypt";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  findUnique: jest.Mock;
};
const mockBcrypt = bcrypt as unknown as { hash: jest.Mock; compare: jest.Mock };
const mockGenerateAccessToken = generateAccessToken as jest.Mock;
const mockGenerateRefreshToken = generateRefreshToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const VALID_EMAIL = "test@example.com";
const VALID_PASSWORD = "Password1";

const MOCK_HASHED_PASSWORD = "$2b$10$mockedHashedPassword";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_REFRESH_TOKEN = "mock.refresh.token";

const MOCK_EXISTING_USER = {
  id: "cuid-user-001",
  email: VALID_EMAIL,
  name: "홍길동",
  passwordHash: MOCK_HASHED_PASSWORD,
  createdAt: new Date("2026-02-28T00:00:00.000Z"),
  updatedAt: new Date("2026-02-28T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 유효한 유저가 DB에 존재하고 비밀번호가 일치하는 상태
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_EXISTING_USER);
    mockBcrypt.compare.mockResolvedValue(true);
    mockGenerateAccessToken.mockReturnValue(MOCK_ACCESS_TOKEN);
    mockGenerateRefreshToken.mockReturnValue(MOCK_REFRESH_TOKEN);
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 이메일·비밀번호로 요청 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 accessToken이 포함된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("accessToken");
      expect(body.accessToken).toBe(MOCK_ACCESS_TOKEN);
    });

    it("응답 body에 user 객체(id, email)가 포함된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("user");
      expect(body.user).toMatchObject({
        id: MOCK_EXISTING_USER.id,
        email: MOCK_EXISTING_USER.email,
      });
    });

    it("응답 body에 passwordHash가 노출되지 않는다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body.user).not.toHaveProperty("passwordHash");
      expect(body.user).not.toHaveProperty("password");
    });

    it("refreshToken이 httpOnly 쿠키(refresh_token)로 Set-Cookie 헤더에 설정된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(MOCK_REFRESH_TOKEN);
      expect(setCookie?.toLowerCase()).toContain("httponly");
    });

    it("DB 조회 시 findUnique가 전달된 이메일로 호출된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: VALID_EMAIL }),
        })
      );
    });

    it("bcrypt.compare가 입력 비밀번호와 DB의 passwordHash로 호출된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      await POST(request);

      // Assert
      expect(mockBcrypt.compare).toHaveBeenCalledWith(
        VALID_PASSWORD,
        MOCK_HASHED_PASSWORD
      );
    });

    it("generateAccessToken과 generateRefreshToken이 유저 id로 호출된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      await POST(request);

      // Assert
      expect(mockGenerateAccessToken).toHaveBeenCalledWith(MOCK_EXISTING_USER.id);
      expect(mockGenerateRefreshToken).toHaveBeenCalledWith(MOCK_EXISTING_USER.id);
    });
  });

  // -------------------------------------------------------------------------
  // 인증 실패 케이스 (401)
  // -------------------------------------------------------------------------

  describe("인증 실패 케이스", () => {
    it("존재하지 않는 이메일로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const request = makeRequest({
        email: "notfound@example.com",
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("존재하지 않는 이메일 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const request = makeRequest({
        email: "notfound@example.com",
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("비밀번호가 일치하지 않으면 401을 반환한다", async () => {
      // Arrange
      mockBcrypt.compare.mockResolvedValue(false);
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "WrongPassword1",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("비밀번호 불일치 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      mockBcrypt.compare.mockResolvedValue(false);
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "WrongPassword1",
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("passwordHash가 없는 유저(OAuth 전용 계정)로 로그인 시 401을 반환한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue({
        ...MOCK_EXISTING_USER,
        passwordHash: null, // OAuth 전용 계정 — 비밀번호 없음
      });
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("passwordHash가 없는 유저 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue({
        ...MOCK_EXISTING_USER,
        passwordHash: null,
      });
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("인증 실패 시 토큰을 발급하지 않는다", async () => {
      // Arrange
      mockBcrypt.compare.mockResolvedValue(false);
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "WrongPassword1",
      });

      // Act
      await POST(request);

      // Assert
      expect(mockGenerateAccessToken).not.toHaveBeenCalled();
      expect(mockGenerateRefreshToken).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 필수 필드 누락 (400)
  // -------------------------------------------------------------------------

  describe("필수 필드 누락 케이스", () => {
    it("email 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("email 누락 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("password 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("password 누락 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("빈 body로 요청 시 400을 반환한다", async () => {
      // Arrange
      const request = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("email과 password 모두 없으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({});

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
    it("이메일이 빈 문자열이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        email: "",
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("비밀번호가 빈 문자열이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("필드 누락 시 DB를 조회하지 않는다", async () => {
      // Arrange
      const request = makeRequest({
        password: VALID_PASSWORD,
        // email 누락
      });

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.findUnique).not.toHaveBeenCalled();
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });
  });
});
