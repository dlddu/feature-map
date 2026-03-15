/**
 * GET /api/settings/api-keys — Unit Tests
 *
 * 테스트 대상: src/app/api/settings/api-keys/route.ts GET 핸들러
 *
 * Mock 전략:
 *  - @/lib/db/client   → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt    → verifyToken을 mock으로 대체
 *  - @/lib/crypto/aes  → decrypt/maskApiKey를 mock으로 대체
 *
 * 동작 요약:
 *  - access_token 쿠키에서 JWT를 검증하여 userId를 추출
 *  - DB에서 해당 userId의 API 키 목록을 조회
 *  - 각 키를 복호화 후 마스킹하여 반환
 *  - 응답: { apiKeys: [{ id, provider, maskedKey, label, isActive }] } (200)
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — jest.mock은 호이스팅되므로 import 전에 선언
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  prisma: {
    aPIKey: {
      findMany: jest.fn(),
    },
  },
  default: {
    aPIKey: {
      findMany: jest.fn(),
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

import { GET } from "@/app/api/settings/api-keys/route";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { decrypt, maskApiKey } from "@/lib/crypto/aes";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaAPIKey = prisma.aPIKey as unknown as {
  findMany: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;
const mockDecrypt = decrypt as jest.Mock;
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

const MOCK_DB_KEYS = [
  {
    id: "apikey-cuid-001",
    userId: MOCK_USER_ID,
    provider: "openai",
    encryptedKey: "encrypted:openai-key",
    label: "개인용 OpenAI",
    isActive: true,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  },
  {
    id: "apikey-cuid-002",
    userId: MOCK_USER_ID,
    provider: "anthropic",
    encryptedKey: "encrypted:anthropic-key",
    label: null,
    isActive: true,
    createdAt: new Date("2026-03-02T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
  },
];

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
  options: { accessToken?: string } = { accessToken: MOCK_ACCESS_TOKEN }
): NextRequest {
  const headers: Record<string, string> = {};
  if (options.accessToken !== undefined) {
    headers["Cookie"] = `access_token=${options.accessToken}`;
  }
  return new NextRequest("http://localhost:3000/api/settings/api-keys", {
    method: "GET",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/settings/api-keys", () => {
  beforeEach(() => {
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaAPIKey.findMany.mockResolvedValue(MOCK_DB_KEYS);
    mockDecrypt.mockImplementation((encrypted: string) => {
      if (encrypted === "encrypted:openai-key") return "sk-openai-realkey1234";
      if (encrypted === "encrypted:anthropic-key")
        return "sk-ant-realkey5678";
      return "sk-unknown";
    });
    mockMaskApiKey.mockImplementation((key: string) => {
      return `sk-...${key.slice(-4)}`;
    });
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 요청으로 API 키 목록 조회 시 200 상태 코드를 반환한다", async () => {
      const request = makeRequest();
      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it("응답 body에 apiKeys 배열이 포함된다", async () => {
      const request = makeRequest();
      const response = await GET(request);
      const body = await response.json();
      expect(body).toHaveProperty("apiKeys");
      expect(Array.isArray(body.apiKeys)).toBe(true);
    });

    it("각 키에 { id, provider, maskedKey, label, isActive }가 포함된다", async () => {
      const request = makeRequest();
      const response = await GET(request);
      const body = await response.json();

      expect(body.apiKeys).toHaveLength(2);
      expect(body.apiKeys[0]).toHaveProperty("id", "apikey-cuid-001");
      expect(body.apiKeys[0]).toHaveProperty("provider", "openai");
      expect(body.apiKeys[0]).toHaveProperty("maskedKey", "sk-...1234");
      expect(body.apiKeys[0]).toHaveProperty("label", "개인용 OpenAI");
      expect(body.apiKeys[0]).toHaveProperty("isActive", true);
    });

    it("응답에 encryptedKey가 노출되지 않는다", async () => {
      const request = makeRequest();
      const response = await GET(request);
      const body = await response.json();

      for (const key of body.apiKeys) {
        expect(key).not.toHaveProperty("encryptedKey");
        expect(key).not.toHaveProperty("userId");
      }
    });

    it("maskedKey가 maskApiKey 반환값으로 설정된다", async () => {
      const request = makeRequest();
      const response = await GET(request);
      const body = await response.json();

      expect(body.apiKeys[0].maskedKey).toBe("sk-...1234");
      expect(body.apiKeys[1].maskedKey).toBe("sk-...5678");
    });

    it("decrypt가 각 encryptedKey로 호출된다", async () => {
      const request = makeRequest();
      await GET(request);

      expect(mockDecrypt).toHaveBeenCalledWith("encrypted:openai-key");
      expect(mockDecrypt).toHaveBeenCalledWith("encrypted:anthropic-key");
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      const request = makeRequest();
      await GET(request);
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("prisma.aPIKey.findMany가 userId로 호출된다", async () => {
      const request = makeRequest();
      await GET(request);

      expect(mockPrismaAPIKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: MOCK_USER_ID },
        })
      );
    });

    it("응답 Content-Type이 application/json이다", async () => {
      const request = makeRequest();
      const response = await GET(request);
      expect(response.headers.get("content-type")).toContain(
        "application/json"
      );
    });
  });

  // -------------------------------------------------------------------------
  // 빈 결과
  // -------------------------------------------------------------------------

  describe("빈 결과", () => {
    it("등록된 키가 없으면 빈 배열을 반환한다", async () => {
      mockPrismaAPIKey.findMany.mockResolvedValue([]);
      const request = makeRequest();
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.apiKeys).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 인증 실패 케이스 (401)
  // -------------------------------------------------------------------------

  describe("인증 실패 케이스", () => {
    it("access_token 쿠키가 없으면 401을 반환한다", async () => {
      const request = makeRequest({});
      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it("만료된 access_token으로 요청 시 401을 반환한다", async () => {
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest({ accessToken: "expired.token" });
      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it("무효한 access_token으로 요청 시 401을 반환한다", async () => {
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequest({ accessToken: "invalid.token" });
      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 DB를 조회하지 않는다", async () => {
      const request = makeRequest({});
      await GET(request);
      expect(mockPrismaAPIKey.findMany).not.toHaveBeenCalled();
    });

    it("401 응답 body에 error 메시지가 포함된다", async () => {
      const request = makeRequest({});
      const response = await GET(request);
      const body = await response.json();

      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // 복호화 실패 케이스
  // -------------------------------------------------------------------------

  describe("복호화 실패 케이스", () => {
    it("복호화 실패 시 해당 키에 fallback maskedKey와 error를 반환한다", async () => {
      mockDecrypt.mockImplementation((encrypted: string) => {
        if (encrypted === "encrypted:openai-key") return "sk-openai-realkey1234";
        throw new Error("Decryption failed");
      });

      const request = makeRequest();
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.apiKeys).toHaveLength(2);

      // 첫 번째 키는 정상 복호화
      expect(body.apiKeys[0].maskedKey).toBe("sk-...1234");
      expect(body.apiKeys[0]).not.toHaveProperty("error");

      // 두 번째 키는 복호화 실패
      expect(body.apiKeys[1].maskedKey).toBe("sk-...****");
      expect(body.apiKeys[1]).toHaveProperty("error", "복호화 실패");
    });

    it("모든 키 복호화 실패 시에도 200을 반환한다", async () => {
      mockDecrypt.mockImplementation(() => {
        throw new Error("Decryption failed");
      });

      const request = makeRequest();
      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.apiKeys).toHaveLength(2);
      for (const key of body.apiKeys) {
        expect(key.maskedKey).toBe("sk-...****");
        expect(key.error).toBe("복호화 실패");
      }
    });
  });
});
