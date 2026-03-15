/**
 * GET /api/settings/llm-configs — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/settings/llm-configs/route.ts (미구현)
 *
 * Mock 전략:
 *  - @/lib/db/client → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt  → verifyToken을 mock으로 대체
 *
 * 동작 요약:
 *  - access_token 쿠키에서 JWT를 검증하여 userId를 추출
 *  - 현재 유저의 LLM 설정 목록 반환
 *  - 응답: { configs: [{ featureType, provider, model, temperature, maxTokens }] } (200)
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — jest.mock은 호이스팅되므로 import 전에 선언
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  prisma: {
    lLMConfig: {
      findMany: jest.fn(),
    },
  },
  default: {
    lLMConfig: {
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

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/settings/llm-configs/route";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaLLMConfig = prisma.lLMConfig as unknown as {
  findMany: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;

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

const MOCK_LLM_CONFIGS = [
  {
    id: "llmconfig-cuid-001",
    userId: MOCK_USER_ID,
    featureType: "layer-extraction",
    provider: "openai",
    model: "gpt-4o",
    temperature: 0.7,
    maxTokens: 4096,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  },
  {
    id: "llmconfig-cuid-002",
    userId: MOCK_USER_ID,
    featureType: "feature-extraction",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    temperature: 0.5,
    maxTokens: 8192,
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
  return new NextRequest("http://localhost:3000/api/settings/llm-configs", {
    method: "GET",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/settings/llm-configs", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 성공 시나리오
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaLLMConfig.findMany.mockResolvedValue(MOCK_LLM_CONFIGS);
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 요청으로 LLM 설정 조회 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 configs 배열이 포함된다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("configs");
      expect(Array.isArray(body.configs)).toBe(true);
    });

    it("configs 배열이 올바른 개수의 항목을 반환한다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(body.configs).toHaveLength(MOCK_LLM_CONFIGS.length);
    });

    it("각 config 항목에 { featureType, provider, model, temperature, maxTokens }가 포함된다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      const firstConfig = body.configs[0];
      expect(firstConfig).toHaveProperty("featureType");
      expect(firstConfig).toHaveProperty("provider");
      expect(firstConfig).toHaveProperty("model");
      expect(firstConfig).toHaveProperty("temperature");
      expect(firstConfig).toHaveProperty("maxTokens");
    });

    it("각 config 항목에 userId가 노출되지 않는다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      const firstConfig = body.configs[0];
      expect(firstConfig).not.toHaveProperty("userId");
    });

    it("config 데이터가 DB 반환값과 일치한다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(body.configs[0]).toMatchObject({
        featureType: MOCK_LLM_CONFIGS[0].featureType,
        provider: MOCK_LLM_CONFIGS[0].provider,
        model: MOCK_LLM_CONFIGS[0].model,
        temperature: MOCK_LLM_CONFIGS[0].temperature,
        maxTokens: MOCK_LLM_CONFIGS[0].maxTokens,
      });
    });

    it("LLM 설정이 없는 경우 빈 배열을 반환한다", async () => {
      // Arrange
      mockPrismaLLMConfig.findMany.mockResolvedValue([]);
      const request = makeRequest();

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(body.configs).toEqual([]);
    });

    it("findMany가 현재 유저의 userId로 필터링하여 호출된다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      await GET(request);

      // Assert
      expect(mockPrismaLLMConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: MOCK_USER_ID }),
        })
      );
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      await GET(request);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await GET(request);

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
      const request = makeRequest({}); // 쿠키 없음

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("만료된 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("jwt expired");
      });
      const request = makeRequest({ accessToken: "expired.token" });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("무효한 access_token으로 요청 시 401을 반환한다", async () => {
      // Arrange
      mockVerifyToken.mockImplementation(() => {
        throw new Error("invalid token");
      });
      const request = makeRequest({ accessToken: "invalid.token" });

      // Act
      const response = await GET(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 DB를 조회하지 않는다", async () => {
      // Arrange
      const request = makeRequest({}); // 쿠키 없음

      // Act
      await GET(request);

      // Assert
      expect(mockPrismaLLMConfig.findMany).not.toHaveBeenCalled();
    });

    it("401 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest({});

      // Act
      const response = await GET(request);
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
    it("다른 유저의 LLM 설정을 반환하지 않는다 (userId 필터링)", async () => {
      // Arrange
      const otherUserId = "other-user-999";
      // findMany는 userId 필터 후 결과를 반환하므로, 다른 유저 데이터가 섞여 있어도
      // 호출 인수에 현재 userId가 포함되어야 한다
      const request = makeRequest();

      // Act
      await GET(request);

      // Assert
      expect(mockPrismaLLMConfig.findMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: otherUserId }),
        })
      );
    });

    it("configs 항목에 내부 DB id가 포함되어도 무방하다 (구현 선택 사항)", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await GET(request);
      const body = await response.json();

      // Assert — 최소 필수 필드는 반드시 포함
      expect(body.configs[0]).toHaveProperty("featureType");
      expect(body.configs[0]).toHaveProperty("model");
    });
  });
});
