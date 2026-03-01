/**
 * POST /api/auth/login — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/auth/login/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - bcrypt           → compare 로직을 mock으로 대체
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

const MOCK_USER = {
  id: "cuid-user-001",
  email: VALID_EMAIL,
  name: "홍길동",
  passwordHash: MOCK_HASHED_PASSWORD,
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
    // 기본 mock 반환값 설정 (각 테스트에서 필요에 따라 덮어씀)
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER);
    mockBcrypt.compare.mockResolvedValue(true); // 기본: 비밀번호 일치
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

    it("access_token이 httpOnly 쿠키로 Set-Cookie 헤더에 설정된다", async () => {
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
      expect(setCookie).toContain(MOCK_ACCESS_TOKEN);
      expect(setCookie?.toLowerCase()).toContain("httponly");
    });

    it("refresh_token이 httpOnly 쿠키로 Set-Cookie 헤더에 설정된다", async () => {
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

    it("쿠키 이름이 access_token과 refresh_token이다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).toContain("access_token=");
      expect(setCookie).toContain("refresh_token=");
    });

    it("쿠키에 Path=/ 속성이 설정된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).toContain("Path=/");
    });

    it("쿠키에 SameSite=Lax 속성이 설정된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie?.toLowerCase()).toContain("samesite=lax");
    });

    it("응답 body에 유저 정보(id, email)가 포함된다", async () => {
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
        id: MOCK_USER.id,
        email: MOCK_USER.email,
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

    it("이메일로 유저 조회 시 findUnique가 올바른 이메일로 호출된다", async () => {
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

    it("bcrypt.compare가 입력된 비밀번호와 저장된 해시로 호출된다", async () => {
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

    it("generateAccessToken과 generateRefreshToken이 userId로 호출된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      await POST(request);

      // Assert
      expect(mockGenerateAccessToken).toHaveBeenCalledWith(MOCK_USER.id);
      expect(mockGenerateRefreshToken).toHaveBeenCalledWith(MOCK_USER.id);
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

  // -------------------------------------------------------------------------
  // 인증 실패 (401)
  // -------------------------------------------------------------------------

  describe("인증 실패 케이스", () => {
    it("존재하지 않는 이메일로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null); // 유저 없음
      const request = makeRequest({
        email: "nonexistent@example.com",
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("비밀번호가 틀린 경우 401을 반환한다", async () => {
      // Arrange
      mockBcrypt.compare.mockResolvedValue(false); // 비밀번호 불일치
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "WrongPassword1",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("401 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const request = makeRequest({
        email: "nonexistent@example.com",
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

    it("비밀번호가 틀린 경우 401 응답 body에 에러 메시지가 포함된다", async () => {
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

    it("유저가 없는 경우 토큰을 발급하지 않는다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const request = makeRequest({
        email: "nonexistent@example.com",
        password: VALID_PASSWORD,
      });

      // Act
      await POST(request);

      // Assert
      expect(mockGenerateAccessToken).not.toHaveBeenCalled();
      expect(mockGenerateRefreshToken).not.toHaveBeenCalled();
    });

    it("비밀번호가 틀린 경우 토큰을 발급하지 않는다", async () => {
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

    it("passwordHash가 없는 유저(OAuth 전용 계정)는 401을 반환한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue({
        ...MOCK_USER,
        passwordHash: null, // GitHub OAuth 전용 계정
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
  });

  // -------------------------------------------------------------------------
  // 필수 필드 누락 (400)
  // -------------------------------------------------------------------------

  describe("필수 필드 누락 케이스", () => {
    it("email 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({ password: VALID_PASSWORD });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("password 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({ email: VALID_EMAIL });

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

    it("request body가 비어 있으면 400을 반환한다", async () => {
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

    it("필수 필드 누락 시 에러 메시지가 응답 body에 포함된다", async () => {
      // Arrange
      const request = makeRequest({ password: VALID_PASSWORD });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("이메일이 빈 문자열이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({ email: "", password: VALID_PASSWORD });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("비밀번호가 빈 문자열이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({ email: VALID_EMAIL, password: "" });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("이메일 형식이 올바르지 않으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        email: "not-an-email",
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("유저 없음과 비밀번호 오류에 동일한 401을 반환하여 사용자 열거를 방지한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(null);
      const requestNoUser = makeRequest({
        email: "nonexistent@example.com",
        password: VALID_PASSWORD,
      });
      mockBcrypt.compare.mockResolvedValue(false);
      const requestWrongPw = makeRequest({
        email: VALID_EMAIL,
        password: "WrongPassword1",
      });

      // Act
      const responseNoUser = await POST(requestNoUser);
      mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER);
      const responseWrongPw = await POST(requestWrongPw);

      // Assert
      expect(responseNoUser.status).toBe(401);
      expect(responseWrongPw.status).toBe(401);
    });
  });
});
