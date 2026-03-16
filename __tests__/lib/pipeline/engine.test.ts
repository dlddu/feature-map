/**
 * PipelineEngine — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/lib/pipeline/engine.ts
 *
 * Mock 전략:
 *  - @/lib/db/client   → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - @/lib/llm/gateway → LLM Gateway를 mock으로 대체 (외부 API 호출 격리)
 *
 * 동작 요약:
 *  - PipelineEngine은 F1→F5 단계를 순차 실행하는 핵심 엔진
 *  - 각 단계(F1~F5)는 LLM Gateway를 호출하고 결과를 DB에 저장
 *  - 단계 시작/완료 시 PipelineRun의 currentStep/status를 업데이트
 *  - AbortController 패턴으로 중단 요청 처리
 *  - 중단 시 현재 단계 실행 후 다음 단계 진행하지 않음
 *  - 각 단계 실패 시 PipelineRun status를 FAILED로 업데이트
 *  - 서버 재시작 후 RUNNING 상태인 실행은 FAILED(interrupted)로 복구
 */

// ---------------------------------------------------------------------------
// Mocks — jest.mock은 호이스팅되므로 import 전에 선언
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  prisma: {
    pipelineRun: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    layer: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    strategy: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    feature: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
  default: {
    pipelineRun: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    layer: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    strategy: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    feature: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/llm/gateway", () => ({
  __esModule: true,
  LLMGateway: jest.fn().mockImplementation(() => ({
    call: jest.fn(),
    chat: jest.fn(),
    validateRequest: jest.fn(),
    formatRequest: jest.fn(),
    normalizeResponse: jest.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { PipelineEngine } from "@/lib/pipeline/engine";
import { prisma } from "@/lib/db/client";
import { LLMGateway } from "@/lib/llm/gateway";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaRun = prisma.pipelineRun as unknown as {
  findUnique: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};
const mockPrismaLayer = prisma.layer as unknown as {
  createMany: jest.Mock;
  deleteMany: jest.Mock;
};
const mockPrismaStrategy = prisma.strategy as unknown as {
  createMany: jest.Mock;
  deleteMany: jest.Mock;
};
const mockPrismaFeature = prisma.feature as unknown as {
  createMany: jest.Mock;
  deleteMany: jest.Mock;
};
const MockLLMGateway = LLMGateway as jest.MockedClass<typeof LLMGateway>;

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_REPO_ID = "repo-cuid-001";
const MOCK_RUN_ID = "pipeline-run-cuid-001";
const MOCK_USER_ID = "cuid-user-001";

const MOCK_PIPELINE_RUN = {
  id: MOCK_RUN_ID,
  repoId: MOCK_REPO_ID,
  userId: MOCK_USER_ID,
  commitSha: "abc123",
  status: "RUNNING",
  currentStep: "F1",
  startedAt: new Date("2026-03-16T00:00:00.000Z"),
  completedAt: null,
  errorMessage: null,
};

// F1 LLM 응답 픽스처
const MOCK_F1_LLM_RESPONSE = {
  content: JSON.stringify({
    layers: [
      {
        name: "Presentation Layer",
        description: "UI components",
        category: "frontend",
        evidence: ["src/app/page.tsx"],
        orderIndex: 0,
      },
      {
        name: "Business Logic Layer",
        description: "Core logic",
        category: "backend",
        evidence: ["src/lib/api.ts"],
        orderIndex: 1,
      },
    ],
  }),
  provider: "openai" as const,
  usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
};

// F2 LLM 응답 픽스처
const MOCK_F2_LLM_RESPONSE = {
  content: JSON.stringify({
    strategies: [
      {
        name: "Repository Pattern",
        description: "Data access abstraction",
        layerId: "layer-001",
      },
    ],
  }),
  provider: "openai" as const,
  usage: { promptTokens: 600, completionTokens: 300, totalTokens: 900 },
};

// ---------------------------------------------------------------------------
// 유틸: LLM Gateway mock 인스턴스 접근 헬퍼
// ---------------------------------------------------------------------------

function getMockGatewayInstance() {
  return MockLLMGateway.mock.instances[0] as {
    call: jest.Mock;
    chat: jest.Mock;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PipelineEngine", () => {
  let engine: PipelineEngine;

  beforeEach(() => {
    // 기본 mock 반환값 설정
    mockPrismaRun.findUnique.mockResolvedValue(MOCK_PIPELINE_RUN);
    mockPrismaRun.update.mockResolvedValue(MOCK_PIPELINE_RUN);
    mockPrismaRun.updateMany.mockResolvedValue({ count: 0 });
    mockPrismaLayer.createMany.mockResolvedValue({ count: 2 });
    mockPrismaLayer.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaStrategy.createMany.mockResolvedValue({ count: 1 });
    mockPrismaStrategy.deleteMany.mockResolvedValue({ count: 0 });
    mockPrismaFeature.createMany.mockResolvedValue({ count: 0 });
    mockPrismaFeature.deleteMany.mockResolvedValue({ count: 0 });

    engine = new PipelineEngine();
  });

  // -------------------------------------------------------------------------
  // 생성자 및 초기화
  // -------------------------------------------------------------------------

  describe("생성자 및 초기화", () => {
    it("PipelineEngine 인스턴스를 생성할 수 있다", () => {
      // Assert
      expect(engine).toBeInstanceOf(PipelineEngine);
    });

    it("초기 상태에서 실행 중인 단계가 없다", () => {
      // Assert
      expect(engine.isRunning()).toBe(false);
    });

    it("초기 상태에서 중단 요청이 없다", () => {
      // Assert
      expect(engine.isAborted()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // F1 단계: 레이어 추출
  // -------------------------------------------------------------------------

  describe("F1 단계: 레이어 추출", () => {
    it("runStep(F1)을 호출하면 LLM Gateway를 호출한다", async () => {
      // Arrange
      const mockGateway = {
        call: jest.fn().mockResolvedValue(MOCK_F1_LLM_RESPONSE),
        chat: jest.fn().mockResolvedValue(MOCK_F1_LLM_RESPONSE),
      };
      MockLLMGateway.mockImplementation(() => mockGateway as unknown as LLMGateway);
      engine = new PipelineEngine();

      // Act
      await engine.runStep(MOCK_RUN_ID, "F1");

      // Assert
      expect(mockGateway.call ?? mockGateway.chat).toHaveBeenCalled();
    });

    it("F1 실행 시 PipelineRun의 currentStep이 F1로 업데이트된다", async () => {
      // Arrange
      const mockGateway = {
        call: jest.fn().mockResolvedValue(MOCK_F1_LLM_RESPONSE),
        chat: jest.fn().mockResolvedValue(MOCK_F1_LLM_RESPONSE),
      };
      MockLLMGateway.mockImplementation(() => mockGateway as unknown as LLMGateway);
      engine = new PipelineEngine();

      // Act
      await engine.runStep(MOCK_RUN_ID, "F1");

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_RUN_ID }),
          data: expect.objectContaining({ currentStep: "F1" }),
        })
      );
    });

    it("F1 완료 시 레이어 데이터가 DB에 저장된다", async () => {
      // Arrange
      const mockGateway = {
        call: jest.fn().mockResolvedValue(MOCK_F1_LLM_RESPONSE),
        chat: jest.fn().mockResolvedValue(MOCK_F1_LLM_RESPONSE),
      };
      MockLLMGateway.mockImplementation(() => mockGateway as unknown as LLMGateway);
      engine = new PipelineEngine();

      // Act
      await engine.runStep(MOCK_RUN_ID, "F1");

      // Assert — layer.createMany가 repoId와 함께 호출되어야 함
      expect(mockPrismaLayer.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ repoId: MOCK_REPO_ID }),
          ]),
        })
      );
    });

    it("F1 LLM 응답 파싱 실패 시 PipelineRun status가 FAILED로 업데이트된다", async () => {
      // Arrange
      const mockGateway = {
        call: jest.fn().mockResolvedValue({ content: "invalid json", provider: "openai", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }),
        chat: jest.fn().mockResolvedValue({ content: "invalid json", provider: "openai", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }),
      };
      MockLLMGateway.mockImplementation(() => mockGateway as unknown as LLMGateway);
      engine = new PipelineEngine();

      // Act
      await engine.runStep(MOCK_RUN_ID, "F1");

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_RUN_ID }),
          data: expect.objectContaining({ status: "FAILED" }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 전체 파이프라인 실행 (F1→F5)
  // -------------------------------------------------------------------------

  describe("전체 파이프라인 실행 (F1→F5)", () => {
    it("run()을 호출하면 F1→F5 순서로 단계가 실행된다", async () => {
      // Arrange
      const executedSteps: string[] = [];
      const mockRunStep = jest
        .spyOn(engine, "runStep")
        .mockImplementation(async (_runId: string, step: string) => {
          executedSteps.push(step);
        });

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert
      expect(executedSteps).toEqual(["F1", "F2", "F3", "F4", "F5"]);
      mockRunStep.mockRestore();
    });

    it("모든 단계 완료 시 PipelineRun status가 COMPLETED로 업데이트된다", async () => {
      // Arrange
      jest.spyOn(engine, "runStep").mockResolvedValue(undefined);

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_RUN_ID }),
          data: expect.objectContaining({
            status: "COMPLETED",
            completedAt: expect.any(Date),
          }),
        })
      );
    });

    it("특정 단계 실패 시 이후 단계를 실행하지 않는다", async () => {
      // Arrange
      const executedSteps: string[] = [];
      jest
        .spyOn(engine, "runStep")
        .mockImplementation(async (_runId: string, step: string) => {
          executedSteps.push(step);
          if (step === "F2") {
            throw new Error("F2 단계 실패");
          }
        });

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert — F2에서 실패하면 F3, F4, F5는 실행되지 않아야 함
      expect(executedSteps).not.toContain("F3");
      expect(executedSteps).not.toContain("F4");
      expect(executedSteps).not.toContain("F5");
    });

    it("단계 실패 시 PipelineRun status가 FAILED로 업데이트된다", async () => {
      // Arrange
      jest.spyOn(engine, "runStep").mockRejectedValue(new Error("단계 실패"));

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: MOCK_RUN_ID }),
          data: expect.objectContaining({ status: "FAILED" }),
        })
      );
    });

    it("단계 실패 시 PipelineRun errorMessage에 에러 내용이 기록된다", async () => {
      // Arrange
      const errorMessage = "F1 LLM 호출 실패";
      jest.spyOn(engine, "runStep").mockRejectedValue(new Error(errorMessage));

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorMessage: expect.stringContaining(errorMessage),
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 개별 단계 실행 (runStep)
  // -------------------------------------------------------------------------

  describe("개별 단계 실행 (runStep)", () => {
    it.each(["F1", "F2", "F3", "F4", "F5"])(
      "runStep(%s)이 오류 없이 실행된다",
      async (step) => {
        // Arrange
        const mockGateway = {
          call: jest.fn().mockResolvedValue({
            content: JSON.stringify({ layers: [], strategies: [], features: [], acceptanceTests: [], dependencyMap: [] }),
            provider: "openai",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          }),
          chat: jest.fn().mockResolvedValue({
            content: JSON.stringify({ layers: [], strategies: [], features: [], acceptanceTests: [], dependencyMap: [] }),
            provider: "openai",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          }),
        };
        MockLLMGateway.mockImplementation(() => mockGateway as unknown as LLMGateway);
        engine = new PipelineEngine();

        // Act & Assert — 에러 없이 완료되어야 함
        await expect(engine.runStep(MOCK_RUN_ID, step)).resolves.not.toThrow();
      }
    );

    it("유효하지 않은 step 값으로 runStep 호출 시 에러를 던진다", async () => {
      // Act & Assert
      await expect(engine.runStep(MOCK_RUN_ID, "F6")).rejects.toThrow();
    });

    it("빈 문자열 step으로 runStep 호출 시 에러를 던진다", async () => {
      // Act & Assert
      await expect(engine.runStep(MOCK_RUN_ID, "")).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 중단(Abort) 처리
  // -------------------------------------------------------------------------

  describe("중단(Abort) 처리", () => {
    it("abort()를 호출하면 isAborted()가 true를 반환한다", () => {
      // Act
      engine.abort();

      // Assert
      expect(engine.isAborted()).toBe(true);
    });

    it("중단 요청 후 run()을 호출하면 첫 번째 단계부터 실행하지 않는다", async () => {
      // Arrange
      const executedSteps: string[] = [];
      jest
        .spyOn(engine, "runStep")
        .mockImplementation(async (_runId: string, step: string) => {
          executedSteps.push(step);
        });

      // Act
      engine.abort();
      await engine.run(MOCK_RUN_ID);

      // Assert — 중단 요청 후이므로 어떤 단계도 실행되지 않아야 함
      expect(executedSteps).toHaveLength(0);
    });

    it("run() 실행 중 abort()를 호출하면 현재 단계 완료 후 다음 단계를 실행하지 않는다", async () => {
      // Arrange
      const executedSteps: string[] = [];
      jest
        .spyOn(engine, "runStep")
        .mockImplementation(async (_runId: string, step: string) => {
          executedSteps.push(step);
          if (step === "F1") {
            // F1 실행 중에 중단 요청
            engine.abort();
          }
        });

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert — F1은 완료되고 F2 이후는 실행되지 않아야 함
      expect(executedSteps).toContain("F1");
      expect(executedSteps).not.toContain("F2");
    });

    it("중단 후 PipelineRun status가 FAILED로 업데이트된다", async () => {
      // Arrange
      jest.spyOn(engine, "runStep").mockImplementation(async (_runId, step) => {
        if (step === "F1") engine.abort();
      });

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "FAILED" }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 서버 재시작 후 상태 복구 (recoverInterruptedRuns)
  // -------------------------------------------------------------------------

  describe("서버 재시작 후 상태 복구 (recoverInterruptedRuns)", () => {
    it("recoverInterruptedRuns()를 호출하면 RUNNING 상태의 실행을 FAILED로 변경한다", async () => {
      // Arrange
      mockPrismaRun.findMany.mockResolvedValue([
        MOCK_PIPELINE_RUN,
        { ...MOCK_PIPELINE_RUN, id: "run-002", currentStep: "F3" },
      ]);

      // Act
      await engine.recoverInterruptedRuns();

      // Assert
      expect(mockPrismaRun.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "RUNNING" }),
          data: expect.objectContaining({
            status: "FAILED",
            errorMessage: expect.stringMatching(/interrupt|재시작|서버/i),
          }),
        })
      );
    });

    it("recoverInterruptedRuns() 호출 시 RUNNING 상태 실행 목록을 조회한다", async () => {
      // Arrange
      mockPrismaRun.findMany.mockResolvedValue([]);

      // Act
      await engine.recoverInterruptedRuns();

      // Assert
      expect(mockPrismaRun.findMany ?? mockPrismaRun.updateMany).toHaveBeenCalled();
    });

    it("RUNNING 상태인 실행이 없을 때 recoverInterruptedRuns()가 오류 없이 완료된다", async () => {
      // Arrange
      mockPrismaRun.findMany.mockResolvedValue([]);

      // Act & Assert
      await expect(engine.recoverInterruptedRuns()).resolves.not.toThrow();
    });

    it("복구된 실행의 errorMessage에 서버 재시작 관련 메시지가 포함된다", async () => {
      // Arrange
      mockPrismaRun.findMany.mockResolvedValue([MOCK_PIPELINE_RUN]);

      // Act
      await engine.recoverInterruptedRuns();

      // Assert
      const updateCall = mockPrismaRun.updateMany.mock.calls[0];
      if (updateCall) {
        const updateData = updateCall[0]?.data;
        expect(updateData?.errorMessage).toMatch(/interrupt|재시작|서버/i);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 상태 콜백 / 이벤트 시스템
  // -------------------------------------------------------------------------

  describe("상태 콜백 / 이벤트 시스템", () => {
    it("단계 시작 시 onStepStart 콜백이 호출된다", async () => {
      // Arrange
      const onStepStart = jest.fn();
      jest.spyOn(engine, "runStep").mockResolvedValue(undefined);
      engine.on("stepStart", onStepStart);

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert — F1~F5 각 단계마다 호출되어야 함
      expect(onStepStart).toHaveBeenCalledTimes(5);
    });

    it("단계 완료 시 onStepComplete 콜백이 호출된다", async () => {
      // Arrange
      const onStepComplete = jest.fn();
      jest.spyOn(engine, "runStep").mockResolvedValue(undefined);
      engine.on("stepComplete", onStepComplete);

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert — F1~F5 각 단계마다 호출되어야 함
      expect(onStepComplete).toHaveBeenCalledTimes(5);
    });

    it("단계 실패 시 onStepError 콜백이 호출된다", async () => {
      // Arrange
      const onStepError = jest.fn();
      jest
        .spyOn(engine, "runStep")
        .mockRejectedValue(new Error("단계 실패"));
      engine.on("stepError", onStepError);

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert
      expect(onStepError).toHaveBeenCalledWith(
        expect.objectContaining({ step: "F1" }),
        expect.any(Error)
      );
    });

    it("콜백 이벤트 데이터에 step과 status 필드가 포함된다", async () => {
      // Arrange
      const receivedEvents: Array<{ step: string; status: string }> = [];
      jest.spyOn(engine, "runStep").mockResolvedValue(undefined);
      engine.on("stepStart", (event: { step: string; status: string }) => {
        receivedEvents.push(event);
      });

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert
      expect(receivedEvents[0]).toHaveProperty("step");
      expect(receivedEvents[0]).toHaveProperty("status");
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("존재하지 않는 runId로 run() 호출 시 에러가 전파된다", async () => {
      // Arrange
      mockPrismaRun.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(engine.run("nonexistent-run-id")).rejects.toThrow();
    });

    it("이미 COMPLETED 상태인 runId로 run() 호출 시 에러를 던진다", async () => {
      // Arrange
      mockPrismaRun.findUnique.mockResolvedValue({
        ...MOCK_PIPELINE_RUN,
        status: "COMPLETED",
      });

      // Act & Assert
      await expect(engine.run(MOCK_RUN_ID)).rejects.toThrow();
    });

    it("run() 호출 중에는 isRunning()이 true를 반환한다", async () => {
      // Arrange
      let isRunningDuringExecution = false;
      jest.spyOn(engine, "runStep").mockImplementation(async () => {
        isRunningDuringExecution = engine.isRunning();
      });

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert
      expect(isRunningDuringExecution).toBe(true);
    });

    it("run() 완료 후에는 isRunning()이 false를 반환한다", async () => {
      // Arrange
      jest.spyOn(engine, "runStep").mockResolvedValue(undefined);

      // Act
      await engine.run(MOCK_RUN_ID);

      // Assert
      expect(engine.isRunning()).toBe(false);
    });
  });
});
