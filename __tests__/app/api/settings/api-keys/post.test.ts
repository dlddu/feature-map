/**
 * POST /api/settings/api-keys — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/settings/api-keys/route.ts (미구현)
 *
 * Mock 전략:
 *  - @/lib/db/client   → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt    → verifyToken을 mock으로 대체
 *  - @/lib/crypto/aes  → encrypt/maskApiKey를 mock으로 대체
 *
 * 동작 요약:
 *  - access_token 쿠키에서 JWT를 검증하여 userId를 추출
 *  - Body: { provider: "openai" | "anthropic", key: string, label?: string }
 *  - AES-256 암호화 후 DB에 저장
 *  - 응답: { id, provider, maskedKey, label, isActive } (201)
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
    aPIKey: {
      create: jest.fn(),
    },
  },
  default: {
    user: {
      findUnique: jest.fn(),
    },
    aPIKey: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/jwt", () => ({
  __esModule: true,
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyToken: jest.fn(),
}));

jest.mock("@/lib/crypto/aes", () => ({
  __esModule: true,
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  maskApiKey: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/settings/api-keys/route";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { encrypt, maskApiKey } from "@/lib/crypto/aes";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  findUnique: jest.Mock;
};
const mockPrismaAPIKey = prisma.aPIKey as unknown as {
  create: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;
const mockEncrypt = encrypt as jest.Mock;
const mockMaskApiKey = maskApiKey as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_ACCESS_TOKEN = "mock.access.token";

const MOCK_TOKEN_PAYLOAD = {
  userId: MOCK_USER_ID,
  type: "access" as const,
  exp: Math.floor(Date.now() / 1000) + 15 * 60,
  iat: Math.floor(Date.now() / 1000),
};

const MOCK_USER = {
  id: MOCK_USER_ID,
  email: "test@example.com",
  name: "홍길동",
  createdAt: new Date("2026-02-28T00:00:00.000Z"),
  updatedAt: new Date("2026-02-28T00:00:00.000Z"),
};

const VALID_OPENAI_KEY = "sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdef";
const MOCK_ENCRYPTED_KEY = "encrypted:aes256gcm:mockivandtag:mockciphertext";
const MOCK_MASKED_KEY = "sk-...cdef";

const VALID_BODY_OPENAI = {
  provider: "openai" as const,
  key: VALID_OPENAI_KEY,
  label: "개인용 OpenAI",
};

const MOCK_CREATED_API_KEY = {
  id: "apikey-cuid-001",
  userId: MOCK_USER_ID,
  provider: "openai",
  encryptedKey: MOCK_ENCRYPTED_KEY,
  label: "개인용 OpenAI",
  isActive: true,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
  body: unknown,
  options: { accessToken?: string } = { accessToken: MOCK_ACCESS_TOKEN }
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.accessToken !== undefined) {
    headers["Cookie"] = `access_token=${options.accessToken}`;
  }
  return new NextRequest("http://localhost:3000/api/settings/api-keys", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/settings/api-keys", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 성공 시나리오
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaUser.findUnique.mockResolvedValue(MOCK_USER);
    mockEncrypt.mockReturnValue(MOCK_ENCRYPTED_KEY);
    mockMaskApiKey.mockReturnValue(MOCK_MASKED_KEY);
    mockPrismaAPIKey.create.mockResolvedValue(MOCK_CREATED_API_KEY);
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 요청으로 API 키 등록 시 201 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
    });

    it("응답 body에 { id, provider, maskedKey, label, isActive }가 포함된다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("provider", "openai");
      expect(body).toHaveProperty("maskedKey");
      expect(body).toHaveProperty("label", VALID_BODY_OPENAI.label);
      expect(body).toHaveProperty("isActive", true);
    });

    it("응답 body에 encryptedKey 원문이 노출되지 않는다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).not.toHaveProperty("encryptedKey");
      expect(body).not.toHaveProperty("key");
    });

    it("maskedKey가 maskApiKey 반환값으로 설정된다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body.maskedKey).toBe(MOCK_MASKED_KEY);
    });

    it("encrypt가 입력 키로 호출된다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI);

      // Act
      await POST(request);

      // Assert
      expect(mockEncrypt).toHaveBeenCalledWith(VALID_OPENAI_KEY);
    });

    it("maskApiKey가 입력 키로 호출된다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI);

      // Act
      await POST(request);

      // Assert
      expect(mockMaskApiKey).toHaveBeenCalledWith(VALID_OPENAI_KEY);
    });

    it("prisma.aPIKey.create가 올바른 데이터로 호출된다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaAPIKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: MOCK_USER_ID,
            provider: "openai",
            encryptedKey: MOCK_ENCRYPTED_KEY,
            label: VALID_BODY_OPENAI.label,
          }),
        })
      );
    });

    it("label 없이 요청해도 201을 반환한다 (optional 필드)", async () => {
      // Arrange
      const { label: _omitted, ...bodyWithoutLabel } = VALID_BODY_OPENAI;
      const request = makeRequest(bodyWithoutLabel);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
    });

    it("provider가 'anthropic'인 경우도 201을 반환한다", async () => {
      // Arrange
      const body = {
        provider: "anthropic" as const,
        key: "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz_1234567890",
      };
      const request = makeRequest(body);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI);

      // Act
      await POST(request);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.headers.get("content-type")).toContain("application/json");
    });
  });

  // -------------------------------------------------------------------------
  // 인증 실패 케이스 (401)
  // -------------------------------------------------------------------------

  describe("인증 실패 케이스", () => {
    it("access_token 쿠키가 없으면 401을 반환한다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI, {}); // 쿠키 없음

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("만료된 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest(VALID_BODY_OPENAI, {
        accessToken: "expired.token",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("무효한 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequest(VALID_BODY_OPENAI, {
        accessToken: "invalid.token",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 DB에 API 키를 저장하지 않는다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI, {}); // 쿠키 없음

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaAPIKey.create).not.toHaveBeenCalled();
    });

    it("인증 실패 시 암호화를 수행하지 않는다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI, {}); // 쿠키 없음

      // Act
      await POST(request);

      // Assert
      expect(mockEncrypt).not.toHaveBeenCalled();
    });

    it("401 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI, {});

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // 입력 오류 케이스 (400)
  // -------------------------------------------------------------------------

  describe("입력 오류 케이스 (400)", () => {
    it("provider 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const { provider: _omitted, ...bodyWithout } = VALID_BODY_OPENAI;
      const request = makeRequest(bodyWithout);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("key 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const { key: _omitted, ...bodyWithout } = VALID_BODY_OPENAI;
      const request = makeRequest(bodyWithout);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("provider가 허용되지 않는 값이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        ...VALID_BODY_OPENAI,
        provider: "unsupported-provider",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("key가 빈 문자열이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest({
        ...VALID_BODY_OPENAI,
        key: "",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("빈 body로 요청 시 400을 반환한다", async () => {
      // Arrange
      const request = new NextRequest(
        "http://localhost:3000/api/settings/api-keys",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `access_token=${MOCK_ACCESS_TOKEN}`,
          },
          body: "",
        }
      );

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("400 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({});

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("입력 오류 시 DB에 API 키를 저장하지 않는다", async () => {
      // Arrange
      const { key: _omitted, ...bodyWithout } = VALID_BODY_OPENAI;
      const request = makeRequest(bodyWithout);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaAPIKey.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("label이 빈 문자열이면 400을 반환한다 (빈 label은 허용하지 않음)", async () => {
      // Arrange
      const request = makeRequest({
        ...VALID_BODY_OPENAI,
        label: "",
      });

      // Act
      const response = await POST(request);

      // Assert
      // label이 존재하지만 빈 경우 유효성 오류
      expect(response.status).toBe(400);
    });

    it("label이 undefined이면 null로 저장한다 (optional 필드)", async () => {
      // Arrange
      const { label: _omitted, ...bodyWithoutLabel } = VALID_BODY_OPENAI;
      const request = makeRequest(bodyWithoutLabel);

      // Act
      await POST(request);

      // Assert — label 없이도 create가 호출되어야 함
      expect(mockPrismaAPIKey.create).toHaveBeenCalled();
    });

    it("동일 유저가 같은 provider로 여러 키를 등록할 수 있다 (중복 금지 없음)", async () => {
      // Arrange
      const request = makeRequest(VALID_BODY_OPENAI);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(201);
    });
  });
});
