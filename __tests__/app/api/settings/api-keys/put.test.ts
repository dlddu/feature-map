/**
 * PUT /api/settings/api-keys/:id — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/settings/api-keys/[id]/route.ts (미구현)
 *
 * Mock 전략:
 *  - @/lib/db/client   → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt    → verifyToken을 mock으로 대체
 *  - @/lib/crypto/aes  → encrypt/maskApiKey를 mock으로 대체
 *
 * 동작 요약:
 *  - access_token 쿠키에서 JWT를 검증하여 userId를 추출
 *  - Body: { key: string }
 *  - 기존 키를 새 키로 대체 (재암호화)
 *  - 소유권 확인 필요 (다른 유저의 키 변경 불가 → 403)
 *  - 응답: { id, provider, maskedKey, label, isActive } (200)
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — jest.mock은 호이스팅되므로 import 전에 선언
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  prisma: {
    aPIKey: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
  default: {
    aPIKey: {
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

jest.mock("@/lib/crypto/aes", () => ({
  __esModule: true,
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  maskApiKey: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { PUT } from "@/app/api/settings/api-keys/[id]/route";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { encrypt, maskApiKey } from "@/lib/crypto/aes";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaAPIKey = prisma.aPIKey as unknown as {
  findUnique: jest.Mock;
  update: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;
const mockEncrypt = encrypt as jest.Mock;
const mockMaskApiKey = maskApiKey as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const OTHER_USER_ID = "cuid-user-other-999";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_KEY_ID = "apikey-cuid-001";

const MOCK_TOKEN_PAYLOAD = {
  userId: MOCK_USER_ID,
  type: "access" as const,
  exp: Math.floor(Date.now() / 1000) + 15 * 60,
  iat: Math.floor(Date.now() / 1000),
};

const MOCK_EXISTING_API_KEY = {
  id: MOCK_KEY_ID,
  userId: MOCK_USER_ID,
  provider: "openai",
  encryptedKey: "old:encrypted:key",
  label: "개인용 OpenAI",
  isActive: true,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
};

const NEW_API_KEY = "sk-proj-newKeyaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";
const MOCK_NEW_ENCRYPTED_KEY = "encrypted:aes256gcm:newiv:newciphertext";
const MOCK_NEW_MASKED_KEY = "sk-...6789";

const MOCK_UPDATED_API_KEY = {
  ...MOCK_EXISTING_API_KEY,
  encryptedKey: MOCK_NEW_ENCRYPTED_KEY,
  updatedAt: new Date("2026-03-15T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
  id: string,
  body: unknown,
  options: { accessToken?: string } = { accessToken: MOCK_ACCESS_TOKEN }
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.accessToken !== undefined) {
    headers["Cookie"] = `access_token=${options.accessToken}`;
  }
  return new NextRequest(
    `http://localhost:3000/api/settings/api-keys/${id}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    }
  );
}

// Next.js App Router의 params 형식
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PUT /api/settings/api-keys/:id", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 성공 시나리오
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaAPIKey.findUnique.mockResolvedValue(MOCK_EXISTING_API_KEY);
    mockEncrypt.mockReturnValue(MOCK_NEW_ENCRYPTED_KEY);
    mockMaskApiKey.mockReturnValue(MOCK_NEW_MASKED_KEY);
    mockPrismaAPIKey.update.mockResolvedValue(MOCK_UPDATED_API_KEY);
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 요청으로 API 키 변경 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 { id, provider, maskedKey, label, isActive }가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("id", MOCK_KEY_ID);
      expect(body).toHaveProperty("provider", "openai");
      expect(body).toHaveProperty("maskedKey");
      expect(body).toHaveProperty("label");
      expect(body).toHaveProperty("isActive");
    });

    it("응답 body에 encryptedKey 원문이 노출되지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body).not.toHaveProperty("encryptedKey");
      expect(body).not.toHaveProperty("key");
    });

    it("maskedKey가 새 키의 maskApiKey 반환값으로 설정된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body.maskedKey).toBe(MOCK_NEW_MASKED_KEY);
    });

    it("encrypt가 새 키로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockEncrypt).toHaveBeenCalledWith(NEW_API_KEY);
    });

    it("prisma.aPIKey.update가 올바른 id와 새 encryptedKey로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockPrismaAPIKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_KEY_ID }),
          data: expect.objectContaining({
            encryptedKey: MOCK_NEW_ENCRYPTED_KEY,
          }),
        })
      );
    });

    it("존재 여부 확인을 위해 findUnique가 키 id로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockPrismaAPIKey.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_KEY_ID }),
        })
      );
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);

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
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY }, {}); // 쿠키 없음
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(401);
    });

    it("만료된 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest(
        MOCK_KEY_ID,
        { key: NEW_API_KEY },
        { accessToken: "expired.token" }
      );
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 DB를 업데이트하지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY }, {});
      const params = makeParams(MOCK_KEY_ID);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockPrismaAPIKey.update).not.toHaveBeenCalled();
    });

    it("401 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY }, {});
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // 소유권 미충족 케이스 (403)
  // -------------------------------------------------------------------------

  describe("소유권 미충족 케이스 (403)", () => {
    it("다른 유저의 API 키를 변경하려 하면 403을 반환한다", async () => {
      // Arrange — 키의 소유자가 다른 유저
      mockPrismaAPIKey.findUnique.mockResolvedValue({
        ...MOCK_EXISTING_API_KEY,
        userId: OTHER_USER_ID, // 다른 유저 소유
      });
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(403);
    });

    it("소유권 미충족 시 DB를 업데이트하지 않는다", async () => {
      // Arrange
      mockPrismaAPIKey.findUnique.mockResolvedValue({
        ...MOCK_EXISTING_API_KEY,
        userId: OTHER_USER_ID,
      });
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockPrismaAPIKey.update).not.toHaveBeenCalled();
    });

    it("403 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaAPIKey.findUnique.mockResolvedValue({
        ...MOCK_EXISTING_API_KEY,
        userId: OTHER_USER_ID,
      });
      const request = makeRequest(MOCK_KEY_ID, { key: NEW_API_KEY });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // 리소스 없음 케이스 (404)
  // -------------------------------------------------------------------------

  describe("리소스 없음 케이스 (404)", () => {
    it("존재하지 않는 id로 요청 시 404를 반환한다", async () => {
      // Arrange
      mockPrismaAPIKey.findUnique.mockResolvedValue(null); // 존재하지 않음
      const request = makeRequest("nonexistent-id", { key: NEW_API_KEY });
      const params = makeParams("nonexistent-id");

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(404);
    });

    it("404 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaAPIKey.findUnique.mockResolvedValue(null);
      const request = makeRequest("nonexistent-id", { key: NEW_API_KEY });
      const params = makeParams("nonexistent-id");

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("리소스 없음 시 DB를 업데이트하지 않는다", async () => {
      // Arrange
      mockPrismaAPIKey.findUnique.mockResolvedValue(null);
      const request = makeRequest("nonexistent-id", { key: NEW_API_KEY });
      const params = makeParams("nonexistent-id");

      // Act
      await PUT(request, params);

      // Assert
      expect(mockPrismaAPIKey.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 입력 오류 케이스 (400)
  // -------------------------------------------------------------------------

  describe("입력 오류 케이스 (400)", () => {
    it("key 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, {});
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(400);
    });

    it("key가 빈 문자열이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: "" });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(400);
    });

    it("빈 body로 요청 시 400을 반환한다", async () => {
      // Arrange
      const request = new NextRequest(
        `http://localhost:3000/api/settings/api-keys/${MOCK_KEY_ID}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: `access_token=${MOCK_ACCESS_TOKEN}`,
          },
          body: "",
        }
      );
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(400);
    });

    it("400 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, {});
      const params = makeParams(MOCK_KEY_ID);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("입력 오류 시 DB를 업데이트하지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_KEY_ID, { key: "" });
      const params = makeParams(MOCK_KEY_ID);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockPrismaAPIKey.update).not.toHaveBeenCalled();
    });
  });
});
