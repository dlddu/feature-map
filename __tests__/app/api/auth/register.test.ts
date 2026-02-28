/**
 * POST /api/auth/register — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/auth/register/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - bcrypt           → 해싱/검증 로직을 mock으로 대체 (패키지 미설치 대응)
 *  - @/lib/auth/jwt   → 토큰 발급 함수를 mock으로 대체
 *
 * 주의: User 모델에 email, passwordHash 필드가 추가되는 것을 전제로 작성
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
      create: jest.fn(),
    },
  },
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
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
  { virtual: true } // bcrypt 패키지가 아직 설치되지 않았으므로 가상 모듈로 처리
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

import { POST } from "@/app/api/auth/register/route";
import { prisma } from "@/lib/db/client";
import bcrypt from "bcrypt";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as {
  findUnique: jest.Mock;
  create: jest.Mock;
};
const mockBcrypt = bcrypt as { hash: jest.Mock; compare: jest.Mock };
const mockGenerateAccessToken = generateAccessToken as jest.Mock;
const mockGenerateRefreshToken = generateRefreshToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const VALID_EMAIL = "test@example.com";
const VALID_PASSWORD = "Password1"; // 8자 이상, 대소문자+숫자
const VALID_NAME = "홍길동";

const MOCK_HASHED_PASSWORD = "$2b$10$mockedHashedPassword";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_REFRESH_TOKEN = "mock.refresh.token";

const MOCK_CREATED_USER = {
  id: "cuid-user-001",
  email: VALID_EMAIL,
  name: VALID_NAME,
  passwordHash: MOCK_HASHED_PASSWORD,
  createdAt: new Date("2026-02-28T00:00:00.000Z"),
  updatedAt: new Date("2026-02-28T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 (각 테스트에서 필요에 따라 덮어씀)
    mockPrismaUser.findUnique.mockResolvedValue(null); // 기본: 중복 없음
    mockPrismaUser.create.mockResolvedValue(MOCK_CREATED_USER);
    mockBcrypt.hash.mockResolvedValue(MOCK_HASHED_PASSWORD);
    mockGenerateAccessToken.mockReturnValue(MOCK_ACCESS_TOKEN);
    mockGenerateRefreshToken.mockReturnValue(MOCK_REFRESH_TOKEN);
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 이메일·비밀번호로 요청 시 201 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
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

    it("refreshToken이 httpOnly 쿠키로 Set-Cookie 헤더에 설정된다", async () => {
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

    it("생성된 유저 정보(id, email)가 응답 body에 포함된다", async () => {
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
        id: MOCK_CREATED_USER.id,
        email: MOCK_CREATED_USER.email,
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

    it("name 필드를 함께 전송하면 유저 생성 시 name이 저장된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        name: VALID_NAME,
      });

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: VALID_NAME }),
        })
      );
    });

    it("name 필드 없이 요청해도 201을 반환한다 (optional 필드)", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
    });

    it("비밀번호를 bcrypt로 해싱하여 DB에 저장한다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      await POST(request);

      // Assert
      expect(mockBcrypt.hash).toHaveBeenCalledWith(VALID_PASSWORD, expect.any(Number));
      expect(mockPrismaUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: MOCK_HASHED_PASSWORD }),
        })
      );
    });

    it("generateAccessToken과 generateRefreshToken이 생성된 userId로 호출된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      await POST(request);

      // Assert
      expect(mockGenerateAccessToken).toHaveBeenCalledWith(MOCK_CREATED_USER.id);
      expect(mockGenerateRefreshToken).toHaveBeenCalledWith(MOCK_CREATED_USER.id);
    });

    it("이메일 중복 여부 확인 시 findUnique가 전달된 이메일로 호출된다", async () => {
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
  });

  // -------------------------------------------------------------------------
  // 이메일 중복 (Conflict)
  // -------------------------------------------------------------------------

  describe("이메일 중복 케이스", () => {
    it("이미 존재하는 이메일로 요청 시 409 상태 코드를 반환한다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(MOCK_CREATED_USER); // 중복 유저 존재
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(409);
    });

    it("409 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(MOCK_CREATED_USER);
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
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("이메일 중복 시 유저를 생성하지 않는다", async () => {
      // Arrange
      mockPrismaUser.findUnique.mockResolvedValue(MOCK_CREATED_USER);
      const request = makeRequest({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
      });

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 비밀번호 정책 위반 (400)
  // -------------------------------------------------------------------------

  describe("비밀번호 정책 검증", () => {
    it("비밀번호가 7자 이하인 경우 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "Ab1", // 3자 — 정책 미충족
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("비밀번호가 정확히 8자인 경우 201을 반환한다 (경계값)", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "Abcdef1!", // 8자 — 정책 충족
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
    });

    it("비밀번호에 대문자가 없으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "password1", // 소문자+숫자만
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("비밀번호에 소문자가 없으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "PASSWORD1", // 대문자+숫자만
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("비밀번호에 숫자가 없으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "PasswordOnly", // 대소문자만
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("400 응답 body에 비밀번호 정책 관련 에러 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "short",
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("비밀번호 정책 미충족 시 유저를 생성하지 않는다", async () => {
      // Arrange
      const request = makeRequest({
        email: VALID_EMAIL,
        password: "weak",
      });

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.create).not.toHaveBeenCalled();
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

    it("email 누락 시 에러 메시지가 응답 body에 포함된다", async () => {
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

    it("password 누락 시 에러 메시지가 응답 body에 포함된다", async () => {
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
      const request = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      });

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
