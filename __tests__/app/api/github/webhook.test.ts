/**
 * POST /api/github/webhook — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/github/webhook/route.ts
 *
 * Mock 전략:
 *  - @/lib/db/client  → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - crypto           → Webhook 서명 검증을 mock으로 대체
 *
 * 동작 요약:
 *  - `x-hub-signature-256` 헤더로 Webhook 서명 검증
 *  - `x-github-event: installation` 헤더 처리
 *  - action: "created" → 해당 GitHub 계정의 User를 찾아 installationId 저장
 *  - action: "deleted" → 해당 User의 installationId 제거 및 관련 Repo 레코드 삭제
 *  - PUBLIC_PATHS에 추가 필요 (인증 불필요)
 *
 * 참고:
 *  - Webhook 서명: HMAC-SHA256(payload, GITHUB_WEBHOOK_SECRET) 비교
 *  - githubId는 installation.account.id로 식별
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — jest.mock은 호이스팅되므로 import 전에 선언
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  prisma: {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    repo: {
      deleteMany: jest.fn(),
    },
  },
  default: {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    repo: {
      deleteMany: jest.fn(),
    },
  },
}));

// crypto 모듈 mock — Webhook 서명 검증 로직을 제어
jest.mock("crypto", () => {
  const actual = jest.requireActual<typeof import("crypto")>("crypto");
  return {
    ...actual,
    createHmac: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue("valid-signature-hex"),
    }),
    timingSafeEqual: jest.fn().mockReturnValue(true),
  };
});

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/github/webhook/route";
import { prisma } from "@/lib/db/client";
import * as crypto from "crypto";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaUser = prisma.user as unknown as {
  findFirst: jest.Mock;
  update: jest.Mock;
};
const mockPrismaRepo = prisma.repo as unknown as {
  deleteMany: jest.Mock;
};
const mockCreateHmac = crypto.createHmac as jest.Mock;
const mockTimingSafeEqual = crypto.timingSafeEqual as jest.Mock;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_GITHUB_USER_ID = 12345;
const MOCK_INSTALLATION_ID = 99001;
const MOCK_USER_ID = "cuid-user-001";
const VALID_SIGNATURE = "sha256=valid-signature-hex";

const MOCK_USER = {
  id: MOCK_USER_ID,
  email: "test@example.com",
  githubId: String(MOCK_GITHUB_USER_ID),
  installationId: null,
  createdAt: new Date("2026-02-28T00:00:00.000Z"),
  updatedAt: new Date("2026-02-28T00:00:00.000Z"),
};

const MOCK_USER_WITH_INSTALLATION = {
  ...MOCK_USER,
  installationId: MOCK_INSTALLATION_ID,
};

const INSTALLATION_CREATED_PAYLOAD = {
  action: "created",
  installation: {
    id: MOCK_INSTALLATION_ID,
    account: {
      id: MOCK_GITHUB_USER_ID,
      login: "testuser",
      type: "User",
    },
  },
  repositories: [
    {
      id: 100001,
      name: "sample-app",
      full_name: "testuser/sample-app",
      private: false,
    },
  ],
};

const INSTALLATION_DELETED_PAYLOAD = {
  action: "deleted",
  installation: {
    id: MOCK_INSTALLATION_ID,
    account: {
      id: MOCK_GITHUB_USER_ID,
      login: "testuser",
      type: "User",
    },
  },
};

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeWebhookRequest(
  payload: unknown,
  options: {
    event?: string;
    signature?: string | null;
  } = {}
): NextRequest {
  const { event = "installation", signature = VALID_SIGNATURE } = options;
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-github-event": event,
  };
  if (signature !== null) {
    headers["x-hub-signature-256"] = signature;
  }

  return new NextRequest("http://localhost:3000/api/github/webhook", {
    method: "POST",
    headers,
    body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/github/webhook", () => {
  beforeEach(() => {
    // 기본 mock 반환값 설정 — 서명 검증 성공, 사용자 존재
    mockCreateHmac.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue("valid-signature-hex"),
    });
    mockTimingSafeEqual.mockReturnValue(true);
    mockPrismaUser.findFirst.mockResolvedValue(MOCK_USER);
    mockPrismaUser.update.mockResolvedValue(MOCK_USER_WITH_INSTALLATION);
    mockPrismaRepo.deleteMany.mockResolvedValue({ count: 0 });
  });

  // -------------------------------------------------------------------------
  // Happy Path — installation created
  // -------------------------------------------------------------------------

  describe("installation created 이벤트 (happy path)", () => {
    it("installation created 이벤트 수신 시 200을 반환한다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("installation created 시 해당 사용자의 installationId가 DB에 저장된다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installationId: MOCK_INSTALLATION_ID,
          }),
        })
      );
    });

    it("installation created 시 githubId로 사용자를 조회한다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            githubId: String(MOCK_GITHUB_USER_ID),
          }),
        })
      );
    });

    it("installation created 응답 body에 성공 메시지가 포함된다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("ok", true);
    });
  });

  // -------------------------------------------------------------------------
  // Happy Path — installation deleted
  // -------------------------------------------------------------------------

  describe("installation deleted 이벤트 (happy path)", () => {
    beforeEach(() => {
      mockPrismaUser.findFirst.mockResolvedValue(MOCK_USER_WITH_INSTALLATION);
      mockPrismaUser.update.mockResolvedValue({
        ...MOCK_USER_WITH_INSTALLATION,
        installationId: null,
      });
    });

    it("installation deleted 이벤트 수신 시 200을 반환한다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_DELETED_PAYLOAD);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("installation deleted 시 사용자의 installationId가 null로 제거된다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_DELETED_PAYLOAD);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            installationId: null,
          }),
        })
      );
    });

    it("installation deleted 시 해당 사용자의 관련 Repo 레코드가 삭제된다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_DELETED_PAYLOAD);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaRepo.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: MOCK_USER_ID,
          }),
        })
      );
    });

    it("installation deleted 시 Repo 삭제 후 installationId를 null로 업데이트한다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_DELETED_PAYLOAD);

      // Act
      await POST(request);

      // Assert
      // 두 작업이 모두 수행되어야 함
      expect(mockPrismaRepo.deleteMany).toHaveBeenCalled();
      expect(mockPrismaUser.update).toHaveBeenCalled();
    });

    it("installation deleted 응답 body에 성공 메시지가 포함된다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_DELETED_PAYLOAD);

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("ok", true);
    });
  });

  // -------------------------------------------------------------------------
  // Webhook 서명 검증 실패 (401)
  // -------------------------------------------------------------------------

  describe("Webhook 서명 검증 실패 케이스", () => {
    it("x-hub-signature-256 헤더가 없으면 401을 반환한다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD, {
        signature: null,
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("서명이 유효하지 않으면 401을 반환한다", async () => {
      // Arrange
      mockTimingSafeEqual.mockReturnValue(false);
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD, {
        signature: "sha256=invalid-signature",
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it("서명 검증 실패 시 응답 body에 에러 메시지가 포함된다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD, {
        signature: null,
      });

      // Act
      const response = await POST(request);
      const body = await response.json();

      // Assert
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("서명 검증 실패 시 DB 업데이트를 하지 않는다", async () => {
      // Arrange
      mockTimingSafeEqual.mockReturnValue(false);
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD, {
        signature: "sha256=wrong-signature",
      });

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 지원하지 않는 이벤트 타입
  // -------------------------------------------------------------------------

  describe("지원하지 않는 이벤트 타입", () => {
    it("installation 이외의 x-github-event는 200과 함께 무시한다", async () => {
      // Arrange
      const request = makeWebhookRequest(
        { action: "some_action" },
        { event: "push" }
      );

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("지원하지 않는 이벤트 시 DB 업데이트를 하지 않는다", async () => {
      // Arrange
      const request = makeWebhookRequest(
        { action: "some_action" },
        { event: "push" }
      );

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.update).not.toHaveBeenCalled();
    });

    it("installation 이벤트의 알 수 없는 action은 200과 함께 무시한다", async () => {
      // Arrange
      const request = makeWebhookRequest({
        action: "suspend",
        installation: {
          id: MOCK_INSTALLATION_ID,
          account: { id: MOCK_GITHUB_USER_ID, login: "testuser", type: "User" },
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // 사용자 없음 케이스
  // -------------------------------------------------------------------------

  describe("사용자를 찾을 수 없는 경우", () => {
    it("installation created 시 DB에 해당 githubId 사용자가 없으면 200으로 무시한다", async () => {
      // Arrange
      mockPrismaUser.findFirst.mockResolvedValue(null);
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("사용자를 찾지 못하면 DB update를 하지 않는다", async () => {
      // Arrange
      mockPrismaUser.findFirst.mockResolvedValue(null);
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD);

      // Act
      await POST(request);

      // Assert
      expect(mockPrismaUser.update).not.toHaveBeenCalled();
    });

    it("installation deleted 시 DB에 해당 githubId 사용자가 없으면 200으로 무시한다", async () => {
      // Arrange
      mockPrismaUser.findFirst.mockResolvedValue(null);
      const request = makeWebhookRequest(INSTALLATION_DELETED_PAYLOAD);

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("x-github-event 헤더가 없으면 200과 함께 무시한다", async () => {
      // Arrange
      const request = new NextRequest(
        "http://localhost:3000/api/github/webhook",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hub-signature-256": VALID_SIGNATURE,
          },
          body: JSON.stringify(INSTALLATION_CREATED_PAYLOAD),
        }
      );

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("payload body가 비어 있으면 400을 반환한다", async () => {
      // Arrange
      const request = new NextRequest(
        "http://localhost:3000/api/github/webhook",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-github-event": "installation",
            "x-hub-signature-256": VALID_SIGNATURE,
          },
          body: "",
        }
      );

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeWebhookRequest(INSTALLATION_CREATED_PAYLOAD);

      // Act
      const response = await POST(request);

      // Assert
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });
  });
});
