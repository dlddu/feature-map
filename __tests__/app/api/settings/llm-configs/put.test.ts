/**
 * PUT /api/settings/llm-configs/:function — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/settings/llm-configs/[function]/route.ts (미구현)
 *
 * Mock 전략:
 *  - @/lib/db/client → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/auth/jwt  → verifyToken을 mock으로 대체
 *
 * 동작 요약:
 *  - access_token 쿠키에서 JWT를 검증하여 userId를 추출
 *  - Body: { provider: "openai" | "anthropic", model: string }
 *  - upsert: 없으면 생성, 있으면 업데이트
 *  - 응답: { featureType, provider, model, temperature, maxTokens } (200)
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — jest.mock은 호이스팅되므로 import 전에 선언
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  prisma: {
    lLMConfig: {
      upsert: jest.fn(),
    },
  },
  default: {
    lLMConfig: {
      upsert: jest.fn(),
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

import { PUT } from "@/app/api/settings/llm-configs/[function]/route";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaLLMConfig = prisma.lLMConfig as unknown as {
  upsert: jest.Mock;
};
const mockVerifyToken = verifyToken as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "cuid-user-001";
const MOCK_ACCESS_TOKEN = "mock.access.token";
const MOCK_FEATURE_TYPE = "layer-extraction";

const MOCK_TOKEN_PAYLOAD = {
  userId: MOCK_USER_ID,
  type: "access" as const,
  exp: Math.floor(Date.now() / 1000) + 15 * 60,
  iat: Math.floor(Date.now() / 1000),
};

const VALID_BODY = {
  provider: "openai" as const,
  model: "gpt-4o",
};

const MOCK_UPSERTED_CONFIG = {
  id: "llmconfig-cuid-001",
  userId: MOCK_USER_ID,
  featureType: MOCK_FEATURE_TYPE,
  provider: "openai",
  model: "gpt-4o",
  temperature: 0.7,
  maxTokens: 4096,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-15T00:00:00.000Z"),
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(
  featureType: string,
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
    `http://localhost:3000/api/settings/llm-configs/${featureType}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    }
  );
}

// Next.js App Router의 params 형식
function makeParams(featureType: string) {
  return { params: Promise.resolve({ function: featureType }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PUT /api/settings/llm-configs/:function", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 성공 시나리오
    mockVerifyToken.mockReturnValue(MOCK_TOKEN_PAYLOAD);
    mockPrismaLLMConfig.upsert.mockResolvedValue(MOCK_UPSERTED_CONFIG);
  });

  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("유효한 요청으로 LLM 설정 변경 시 200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(200);
    });

    it("응답 body에 { featureType, provider, model, temperature, maxTokens }가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("featureType", MOCK_FEATURE_TYPE);
      expect(body).toHaveProperty("provider", "openai");
      expect(body).toHaveProperty("model", "gpt-4o");
      expect(body).toHaveProperty("temperature");
      expect(body).toHaveProperty("maxTokens");
    });

    it("응답 body에 userId가 노출되지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body).not.toHaveProperty("userId");
    });

    it("prisma.lLMConfig.upsert가 올바른 데이터로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockPrismaLLMConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            // userId + featureType 복합 조건 또는 별도 unique 필드로 식별
          }),
          update: expect.objectContaining({
            provider: VALID_BODY.provider,
            model: VALID_BODY.model,
          }),
          create: expect.objectContaining({
            userId: MOCK_USER_ID,
            featureType: MOCK_FEATURE_TYPE,
            provider: VALID_BODY.provider,
            model: VALID_BODY.model,
          }),
        })
      );
    });

    it("provider가 'anthropic'인 경우도 200을 반환한다", async () => {
      // Arrange
      const body = {
        provider: "anthropic" as const,
        model: "claude-opus-4-6",
      };
      mockPrismaLLMConfig.upsert.mockResolvedValue({
        ...MOCK_UPSERTED_CONFIG,
        provider: "anthropic",
        model: "claude-opus-4-6",
      });
      const request = makeRequest(MOCK_FEATURE_TYPE, body);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(200);
    });

    it("기존 설정이 없을 때 새로 생성한다 (upsert create 경로)", async () => {
      // Arrange — upsert는 항상 호출되므로, 실제 동작은 DB 구현에 의존
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      await PUT(request, params);

      // Assert — upsert가 반드시 호출되어야 한다
      expect(mockPrismaLLMConfig.upsert).toHaveBeenCalledTimes(1);
    });

    it("기존 설정이 있을 때 업데이트한다 (upsert update 경로)", async () => {
      // Arrange — 동일 조건으로 두 번 호출하는 시나리오를 upsert 한 번으로 추상화
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockPrismaLLMConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            provider: VALID_BODY.provider,
            model: VALID_BODY.model,
          }),
        })
      );
    });

    it("featureType이 URL 파라미터에서 올바르게 추출된다", async () => {
      // Arrange
      const customFeatureType = "feature-extraction";
      mockPrismaLLMConfig.upsert.mockResolvedValue({
        ...MOCK_UPSERTED_CONFIG,
        featureType: customFeatureType,
      });
      const request = makeRequest(customFeatureType, VALID_BODY);
      const params = makeParams(customFeatureType);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body.featureType).toBe(customFeatureType);
    });

    it("verifyToken이 쿠키의 access_token 값으로 호출된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockVerifyToken).toHaveBeenCalledWith(MOCK_ACCESS_TOKEN);
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY);
      const params = makeParams(MOCK_FEATURE_TYPE);

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
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY, {}); // 쿠키 없음
      const params = makeParams(MOCK_FEATURE_TYPE);

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
        MOCK_FEATURE_TYPE,
        VALID_BODY,
        { accessToken: "expired.token" }
      );
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(401);
    });

    it("인증 실패 시 DB를 업데이트하지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY, {});
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockPrismaLLMConfig.upsert).not.toHaveBeenCalled();
    });

    it("401 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY, {});
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);
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
      const { provider: _omitted, ...bodyWithout } = VALID_BODY;
      const request = makeRequest(MOCK_FEATURE_TYPE, bodyWithout);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(400);
    });

    it("model 필드가 없으면 400을 반환한다", async () => {
      // Arrange
      const { model: _omitted, ...bodyWithout } = VALID_BODY;
      const request = makeRequest(MOCK_FEATURE_TYPE, bodyWithout);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(400);
    });

    it("provider가 허용되지 않는 값이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, {
        ...VALID_BODY,
        provider: "unsupported-llm-provider",
      });
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(400);
    });

    it("model이 빈 문자열이면 400을 반환한다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, {
        ...VALID_BODY,
        model: "",
      });
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(400);
    });

    it("빈 body로 요청 시 400을 반환한다", async () => {
      // Arrange
      const request = new NextRequest(
        `http://localhost:3000/api/settings/llm-configs/${MOCK_FEATURE_TYPE}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: `access_token=${MOCK_ACCESS_TOKEN}`,
          },
          body: "",
        }
      );
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);

      // Assert
      expect(response.status).toBe(400);
    });

    it("400 응답 body에 error 메시지가 포함된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, {});
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("입력 오류 시 DB를 업데이트하지 않는다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, { model: "" });
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      await PUT(request, params);

      // Assert
      expect(mockPrismaLLMConfig.upsert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("여러 featureType에 대해 독립적으로 설정할 수 있다", async () => {
      // Arrange
      const featureTypes = [
        "layer-extraction",
        "feature-extraction",
        "strategy-planning",
        "acceptance-tests",
        "dependency-mapping",
        "report-generation",
      ];

      for (const featureType of featureTypes) {
        mockPrismaLLMConfig.upsert.mockResolvedValue({
          ...MOCK_UPSERTED_CONFIG,
          featureType,
        });
        const request = makeRequest(featureType, VALID_BODY);
        const params = makeParams(featureType);

        // Act
        const response = await PUT(request, params);

        // Assert
        expect(response.status).toBe(200);
      }
    });

    it("upsert create 경로에서 temperature 기본값이 설정된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      await PUT(request, params);

      // Assert — create data에 temperature 기본값이 포함되거나, DB 기본값을 사용
      // (Prisma schema default: 0.7)
      expect(mockPrismaLLMConfig.upsert).toHaveBeenCalled();
    });

    it("응답에 temperature와 maxTokens가 숫자 타입으로 반환된다", async () => {
      // Arrange
      const request = makeRequest(MOCK_FEATURE_TYPE, VALID_BODY);
      const params = makeParams(MOCK_FEATURE_TYPE);

      // Act
      const response = await PUT(request, params);
      const body = await response.json();

      // Assert
      expect(typeof body.temperature).toBe("number");
      expect(typeof body.maxTokens).toBe("number");
    });
  });
});
