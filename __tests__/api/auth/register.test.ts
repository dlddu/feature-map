/**
 * POST /api/auth/register 통합 테스트
 *
 * 검증 대상: src/app/api/auth/register/route.ts (Next.js App Router Route Handler)
 * - 이메일 중복 검사 (409 Conflict)
 * - 비밀번호 정책 검증 (422 Unprocessable Entity)
 * - bcrypt 해싱 후 DB 저장
 * - JWT Access Token + Refresh Token(httpOnly 쿠키) 발급 (201 Created)
 *
 * 의존성 모킹:
 * - @prisma/client: Prisma User 모델 (email, passwordHash 필드)은 아직 스키마에 없으므로 전체 모킹
 * - src/lib/auth/password: bcrypt 해싱 (실제 bcrypt는 느리므로 해싱만 모킹)
 *
 * NOTE: TDD Red Phase - 구현 전 작성된 테스트이므로 현재 실패 상태가 정상입니다.
 */

// ---------------------------------------------------------------------------
// Prisma 모킹: Prisma Client 전체를 mock으로 교체하여 실제 DB 접근을 방지한다.
// User 모델에 email / passwordHash 필드가 아직 없으므로 타입 단언을 사용한다.
// ---------------------------------------------------------------------------
const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
    },
  },
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
    },
  },
}));

// ---------------------------------------------------------------------------
// bcrypt 모킹: 실제 bcrypt 연산 없이 결정론적 해시 값을 반환한다.
// ---------------------------------------------------------------------------
jest.mock("@/lib/auth/password", () => ({
  hashPassword: jest.fn().mockResolvedValue("$2b$10$hashed_password_mock"),
  comparePassword: jest.fn().mockResolvedValue(true),
  validatePassword: jest.requireActual("@/lib/auth/password").validatePassword,
}));

import { POST } from "@/app/api/auth/register/route";

// ---------------------------------------------------------------------------
// 헬퍼: Next.js App Router Route Handler는 Web API Request를 인자로 받는다.
// ---------------------------------------------------------------------------
function buildRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy Path: 정상 회원가입
  // -------------------------------------------------------------------------

  describe("happy path: 정상 회원가입", () => {
    it("should return 201 when valid email and password are provided", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null); // 중복 이메일 없음
      mockUserCreate.mockResolvedValue({
        id: "user-test-001",
        email: "newuser@example.com",
        passwordHash: "$2b$10$hashed_password_mock",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = buildRequest({
        email: "newuser@example.com",
        password: "Password1",
      });

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(201);
    });

    it("should return a JSON body containing an accessToken on success", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: "user-test-001",
        email: "newuser@example.com",
        passwordHash: "$2b$10$hashed_password_mock",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = buildRequest({
        email: "newuser@example.com",
        password: "Password1",
      });

      // Act
      const res = await POST(req);
      const body = await res.json();

      // Assert
      expect(body).toHaveProperty("accessToken");
      expect(typeof body.accessToken).toBe("string");
      expect(body.accessToken.split(".")).toHaveLength(3); // JWT 형식
    });

    it("should set a httpOnly refreshToken cookie on success", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: "user-test-001",
        email: "newuser@example.com",
        passwordHash: "$2b$10$hashed_password_mock",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = buildRequest({
        email: "newuser@example.com",
        password: "Password1",
      });

      // Act
      const res = await POST(req);

      // Assert
      const setCookieHeader = res.headers.get("set-cookie");
      expect(setCookieHeader).not.toBeNull();
      // refreshToken 쿠키가 존재해야 한다
      expect(setCookieHeader).toMatch(/refresh_token=/i);
      // httpOnly 플래그가 설정되어야 한다
      expect(setCookieHeader).toMatch(/HttpOnly/i);
    });

    it("should call prisma.user.create with the hashed password, not the plain password", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: "user-test-001",
        email: "newuser@example.com",
        passwordHash: "$2b$10$hashed_password_mock",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const plainPassword = "Password1";
      const req = buildRequest({
        email: "newuser@example.com",
        password: plainPassword,
      });

      // Act
      await POST(req);

      // Assert
      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: "$2b$10$hashed_password_mock",
          }),
        })
      );
      // 평문 비밀번호는 DB에 저장되어서는 안 된다
      expect(mockUserCreate).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password: plainPassword,
          }),
        })
      );
    });

    it("should look up user by email before creating to check for duplicates", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockResolvedValue({
        id: "user-test-001",
        email: "newuser@example.com",
        passwordHash: "$2b$10$hashed_password_mock",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = buildRequest({
        email: "newuser@example.com",
        password: "Password1",
      });

      // Act
      await POST(req);

      // Assert
      expect(mockUserFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ email: "newuser@example.com" }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Error Case: 이메일 중복 (409 Conflict)
  // -------------------------------------------------------------------------

  describe("error case: 이메일 중복", () => {
    it("should return 409 when email is already registered", async () => {
      // Arrange: 이미 등록된 유저가 존재하는 상황
      mockUserFindUnique.mockResolvedValue({
        id: "existing-user-001",
        email: "existing@example.com",
        passwordHash: "$2b$10$existing_hash",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = buildRequest({
        email: "existing@example.com",
        password: "Password1",
      });

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(409);
    });

    it("should return an error message indicating duplicate email", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue({
        id: "existing-user-001",
        email: "existing@example.com",
        passwordHash: "$2b$10$existing_hash",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = buildRequest({
        email: "existing@example.com",
        password: "Password1",
      });

      // Act
      const res = await POST(req);
      const body = await res.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(body.error).toMatch(/이미 사용 중인 이메일|이미 등록된 이메일/);
    });

    it("should not call prisma.user.create when email is duplicated", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue({
        id: "existing-user-001",
        email: "existing@example.com",
        passwordHash: "$2b$10$existing_hash",
      });

      const req = buildRequest({
        email: "existing@example.com",
        password: "Password1",
      });

      // Act
      await POST(req);

      // Assert
      expect(mockUserCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Error Case: 비밀번호 정책 위반 (422 Unprocessable Entity)
  // -------------------------------------------------------------------------

  describe("error case: 비밀번호 정책 위반", () => {
    it("should return 422 when password is shorter than 8 characters", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);

      const req = buildRequest({
        email: "user@example.com",
        password: "Ab1", // 3자
      });

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(422);
    });

    it("should return 422 when password has no uppercase letter", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);

      const req = buildRequest({
        email: "user@example.com",
        password: "password1", // 소문자+숫자, 대문자 없음
      });

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(422);
    });

    it("should return 422 when password has no lowercase letter", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);

      const req = buildRequest({
        email: "user@example.com",
        password: "PASSWORD1", // 대문자+숫자, 소문자 없음
      });

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(422);
    });

    it("should return 422 when password has no digit", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);

      const req = buildRequest({
        email: "user@example.com",
        password: "PasswordABC", // 대+소문자만, 숫자 없음
      });

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(422);
    });

    it("should return a body with a password error message explaining the policy", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);

      const req = buildRequest({
        email: "user@example.com",
        password: "short",
      });

      // Act
      const res = await POST(req);
      const body = await res.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    });

    it("should not call prisma.user.create when password policy is violated", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);

      const req = buildRequest({
        email: "user@example.com",
        password: "weak",
      });

      // Act
      await POST(req);

      // Assert
      expect(mockUserCreate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Error Case: 요청 바디 유효성 검사 (400 Bad Request)
  // -------------------------------------------------------------------------

  describe("error case: 잘못된 요청 바디", () => {
    it("should return 400 when email field is missing", async () => {
      // Arrange
      const req = buildRequest({ password: "Password1" });

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(400);
    });

    it("should return 400 when password field is missing", async () => {
      // Arrange
      const req = buildRequest({ email: "user@example.com" });

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(400);
    });

    it("should return 400 when both fields are missing", async () => {
      // Arrange
      const req = buildRequest({});

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(400);
    });

    it("should return 400 when email format is invalid", async () => {
      // Arrange
      const req = buildRequest({
        email: "not-a-valid-email",
        password: "Password1",
      });

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Error Case: 서버 내부 오류 (500 Internal Server Error)
  // -------------------------------------------------------------------------

  describe("error case: DB 오류", () => {
    it("should return 500 when prisma.user.create throws an unexpected error", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockRejectedValue(new Error("DB connection failed"));

      const req = buildRequest({
        email: "user@example.com",
        password: "Password1",
      });

      // Act
      const res = await POST(req);

      // Assert
      expect(res.status).toBe(500);
    });

    it("should not expose internal error details in the response body", async () => {
      // Arrange
      mockUserFindUnique.mockResolvedValue(null);
      mockUserCreate.mockRejectedValue(new Error("DB connection failed"));

      const req = buildRequest({
        email: "user@example.com",
        password: "Password1",
      });

      // Act
      const res = await POST(req);
      const body = await res.json();

      // Assert
      // 클라이언트에 DB 상세 오류를 노출해서는 안 된다
      expect(JSON.stringify(body)).not.toMatch(/DB connection failed/);
    });
  });
});
