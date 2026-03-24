/**
 * PipelineEngine — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/lib/pipeline/engine.ts
 *
 * Mock 전략:
 *  - @/lib/db/client → Prisma 싱글톤을 mock하여 DB 의존성 제거
 *  - 각 단계 실행기 (F1~F5) → jest.fn()으로 대체
 *
 * PipelineEngine 동작 요약:
 *  - 싱글톤 패턴으로 getInstance()를 통해 접근
 *  - start(runId, options): 비동기 파이프라인 실행 시작
 *  - stop(runId): 실행 중인 파이프라인 중단 (AbortController)
 *  - isRunning(runId): 특정 runId가 실행 중인지 확인
 *  - F1→F2→F3→F4→F5 순차 실행 (step 지정 시 해당 단계부터)
 *  - 이벤트 발행: 각 단계 상태 변경 시 콜백 또는 EventEmitter
 *  - 서버 재시작 시 RUNNING 상태 → FAILED 마킹
 */

// ---------------------------------------------------------------------------
// Mocks — jest.mock은 호이스팅되므로 import 전에 선언
// ---------------------------------------------------------------------------

jest.mock("@/lib/db/client", () => ({
  __esModule: true,
  prisma: {
    pipelineRun: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
  default: {
    pipelineRun: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports (mock 선언 이후에 위치해야 함)
// ---------------------------------------------------------------------------

import { PipelineEngine } from "@/lib/pipeline/engine";
import type { PipelineRunOptions, StepEvent } from "@/lib/pipeline/engine";
import { prisma } from "@/lib/db/client";

// ---------------------------------------------------------------------------
// 타입 헬퍼
// ---------------------------------------------------------------------------

const mockPrismaRun = prisma.pipelineRun as unknown as {
  findUnique: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};

// ---------------------------------------------------------------------------
// 테스트 픽스처
// ---------------------------------------------------------------------------

const MOCK_RUN_ID = "run-cuid-001";
const MOCK_REPO_ID = "repo-cuid-001";
const MOCK_USER_ID = "cuid-user-001";

const MOCK_PIPELINE_RUN = {
  id: MOCK_RUN_ID,
  repoId: MOCK_REPO_ID,
  userId: MOCK_USER_ID,
  commitSha: "abc123",
  status: "RUNNING",
  currentStep: "F1",
  startedAt: new Date("2026-03-24T00:00:00.000Z"),
  completedAt: null,
  errorMessage: null,
  createdAt: new Date("2026-03-24T00:00:00.000Z"),
  updatedAt: new Date("2026-03-24T00:00:00.000Z"),
};

const MOCK_RUN_OPTIONS: PipelineRunOptions = {
  repoId: MOCK_REPO_ID,
  userId: MOCK_USER_ID,
  commitSha: "abc123",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PipelineEngine", () => {
  let engine: PipelineEngine;

  beforeEach(() => {
    // 싱글톤 인스턴스를 매 테스트 전에 초기화
    engine = PipelineEngine.getInstance();
    mockPrismaRun.findUnique.mockResolvedValue(MOCK_PIPELINE_RUN);
    mockPrismaRun.update.mockResolvedValue(MOCK_PIPELINE_RUN);
    mockPrismaRun.updateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    // 실행 중인 모든 파이프라인 정리
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 싱글톤 패턴
  // -------------------------------------------------------------------------

  describe("싱글톤 패턴", () => {
    it("getInstance()가 항상 동일한 인스턴스를 반환한다", () => {
      // Act
      const instance1 = PipelineEngine.getInstance();
      const instance2 = PipelineEngine.getInstance();

      // Assert
      expect(instance1).toBe(instance2);
    });

    it("PipelineEngine을 직접 new로 생성하면 에러가 발생한다", () => {
      // Act & Assert
      expect(() => new (PipelineEngine as unknown as new () => PipelineEngine)()).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // start() 메서드
  // -------------------------------------------------------------------------

  describe("start()", () => {
    it("start()를 호출하면 isRunning()이 true를 반환한다", async () => {
      // Arrange
      const onEvent = jest.fn();

      // Act
      engine.start(MOCK_RUN_ID, { ...MOCK_RUN_OPTIONS, onEvent });

      // Assert — 비동기 시작 직후 isRunning이 true여야 함
      expect(engine.isRunning(MOCK_RUN_ID)).toBe(true);
    });

    it("start()는 Promise를 반환한다", () => {
      // Arrange
      const onEvent = jest.fn();

      // Act
      const result = engine.start(MOCK_RUN_ID, { ...MOCK_RUN_OPTIONS, onEvent });

      // Assert
      expect(result).toBeInstanceOf(Promise);

      // 정리 — 완료될 때까지 기다리지 않아도 됨
      return result.catch(() => {});
    });

    it("이미 실행 중인 runId로 start()를 호출하면 에러가 발생한다", async () => {
      // Arrange
      const onEvent = jest.fn();
      engine.start(MOCK_RUN_ID, { ...MOCK_RUN_OPTIONS, onEvent });

      // Act & Assert
      await expect(
        engine.start(MOCK_RUN_ID, { ...MOCK_RUN_OPTIONS, onEvent })
      ).rejects.toThrow();
    });

    it("F1 단계 시작 시 onEvent 콜백이 step=F1, status=RUNNING으로 호출된다", async () => {
      // Arrange
      const onEvent = jest.fn();
      // DB update mock이 각 단계를 즉시 완료하도록 설정
      mockPrismaRun.update.mockResolvedValue({
        ...MOCK_PIPELINE_RUN,
        status: "COMPLETED",
        currentStep: "F1",
      });

      // Act
      const runPromise = engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
        startStep: "F1",
      });

      // 첫 이벤트가 발행될 때까지 대기
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          step: "F1",
          status: "RUNNING",
        })
      );

      await runPromise.catch(() => {});
    });

    it("전체 실행 시 F1부터 F5까지 순차적으로 실행한다", async () => {
      // Arrange
      const steps: string[] = [];
      const onEvent = jest.fn().mockImplementation((event: StepEvent) => {
        if (event.status === "RUNNING") {
          steps.push(event.step);
        }
      });

      mockPrismaRun.update.mockResolvedValue({
        ...MOCK_PIPELINE_RUN,
        status: "COMPLETED",
      });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      });

      // Assert
      expect(steps).toEqual(["F1", "F2", "F3", "F4", "F5"]);
    });

    it("startStep이 F3이면 F3, F4, F5만 실행한다", async () => {
      // Arrange
      const steps: string[] = [];
      const onEvent = jest.fn().mockImplementation((event: StepEvent) => {
        if (event.status === "RUNNING") {
          steps.push(event.step);
        }
      });

      mockPrismaRun.update.mockResolvedValue({
        ...MOCK_PIPELINE_RUN,
        status: "COMPLETED",
      });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
        startStep: "F3",
      });

      // Assert
      expect(steps).toEqual(["F3", "F4", "F5"]);
    });

    it("각 단계 완료 시 onEvent 콜백이 status=COMPLETED로 호출된다", async () => {
      // Arrange
      const completedSteps: string[] = [];
      const onEvent = jest.fn().mockImplementation((event: StepEvent) => {
        if (event.status === "COMPLETED") {
          completedSteps.push(event.step);
        }
      });

      mockPrismaRun.update.mockResolvedValue({
        ...MOCK_PIPELINE_RUN,
        status: "COMPLETED",
      });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      });

      // Assert
      expect(completedSteps).toEqual(["F1", "F2", "F3", "F4", "F5"]);
    });

    it("모든 단계 완료 시 DB가 COMPLETED 상태로 업데이트된다", async () => {
      // Arrange
      const onEvent = jest.fn();
      mockPrismaRun.update.mockResolvedValue({
        ...MOCK_PIPELINE_RUN,
        status: "COMPLETED",
        completedAt: new Date(),
      });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      });

      // Assert — 최종 업데이트에서 COMPLETED 상태가 설정되어야 함
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_RUN_ID },
          data: expect.objectContaining({
            status: "COMPLETED",
            completedAt: expect.any(Date),
          }),
        })
      );
    });

    it("모든 단계 완료 후 isRunning()이 false를 반환한다", async () => {
      // Arrange
      const onEvent = jest.fn();
      mockPrismaRun.update.mockResolvedValue({
        ...MOCK_PIPELINE_RUN,
        status: "COMPLETED",
        completedAt: new Date(),
      });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      });

      // Assert
      expect(engine.isRunning(MOCK_RUN_ID)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // stop() 메서드
  // -------------------------------------------------------------------------

  describe("stop()", () => {
    it("stop()을 호출하면 isRunning()이 false를 반환한다", async () => {
      // Arrange
      const onEvent = jest.fn();
      // start()를 호출하되 즉시 완료되지 않도록 설정
      mockPrismaRun.update.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );
      engine.start(MOCK_RUN_ID, { ...MOCK_RUN_OPTIONS, onEvent });

      // Act
      await engine.stop(MOCK_RUN_ID);

      // Assert
      expect(engine.isRunning(MOCK_RUN_ID)).toBe(false);
    });

    it("stop()을 호출하면 onEvent 콜백이 status=FAILED로 호출된다", async () => {
      // Arrange
      const onEvent = jest.fn();
      mockPrismaRun.update.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );
      engine.start(MOCK_RUN_ID, { ...MOCK_RUN_OPTIONS, onEvent });

      // Act
      await engine.stop(MOCK_RUN_ID);
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "FAILED",
        })
      );
    });

    it("stop()은 Promise를 반환한다", () => {
      // Arrange
      const onEvent = jest.fn();
      engine.start(MOCK_RUN_ID, { ...MOCK_RUN_OPTIONS, onEvent });

      // Act
      const result = engine.stop(MOCK_RUN_ID);

      // Assert
      expect(result).toBeInstanceOf(Promise);

      return result;
    });

    it("실행 중이지 않은 runId로 stop()을 호출해도 에러가 발생하지 않는다", async () => {
      // Arrange & Act & Assert
      await expect(
        engine.stop("non-existent-run-id")
      ).resolves.not.toThrow();
    });

    it("stop() 호출 시 Map에서 해당 runId의 controller가 제거된다", async () => {
      // Arrange
      const onEvent = jest.fn();
      mockPrismaRun.update.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );
      engine.start(MOCK_RUN_ID, { ...MOCK_RUN_OPTIONS, onEvent });
      expect(engine.isRunning(MOCK_RUN_ID)).toBe(true);

      // Act
      await engine.stop(MOCK_RUN_ID);

      // Assert
      expect(engine.isRunning(MOCK_RUN_ID)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // isRunning() 메서드
  // -------------------------------------------------------------------------

  describe("isRunning()", () => {
    it("start() 전에는 false를 반환한다", () => {
      // Act & Assert
      expect(engine.isRunning(MOCK_RUN_ID)).toBe(false);
    });

    it("존재하지 않는 runId에 대해 false를 반환한다", () => {
      // Act & Assert
      expect(engine.isRunning("non-existent-id")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 오류 처리 (단계 실패)
  // -------------------------------------------------------------------------

  describe("단계 실패 처리", () => {
    it("단계 실행 중 에러 발생 시 onEvent 콜백이 status=FAILED로 호출된다", async () => {
      // Arrange
      const onEvent = jest.fn();
      // F1 단계 실행 중 에러를 시뮬레이션
      // DB update가 첫 번째 호출에서 에러를 던짐 (F1 단계 실행 에러)
      mockPrismaRun.update
        .mockRejectedValueOnce(new Error("F1 단계 실패: 코드 분석 오류"))
        .mockResolvedValue({ ...MOCK_PIPELINE_RUN, status: "FAILED" });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      }).catch(() => {});

      // Assert
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "FAILED",
        })
      );
    });

    it("단계 실패 시 DB가 FAILED 상태로 업데이트된다", async () => {
      // Arrange
      const onEvent = jest.fn();
      mockPrismaRun.update
        .mockRejectedValueOnce(new Error("단계 실패"))
        .mockResolvedValue({ ...MOCK_PIPELINE_RUN, status: "FAILED" });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      }).catch(() => {});

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_RUN_ID },
          data: expect.objectContaining({
            status: "FAILED",
          }),
        })
      );
    });

    it("단계 실패 후 isRunning()이 false를 반환한다", async () => {
      // Arrange
      const onEvent = jest.fn();
      mockPrismaRun.update
        .mockRejectedValueOnce(new Error("단계 실패"))
        .mockResolvedValue({ ...MOCK_PIPELINE_RUN, status: "FAILED" });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      }).catch(() => {});

      // Assert
      expect(engine.isRunning(MOCK_RUN_ID)).toBe(false);
    });

    it("단계 실패 시 이후 단계는 실행되지 않는다", async () => {
      // Arrange
      const executedSteps: string[] = [];
      const onEvent = jest.fn().mockImplementation((event: StepEvent) => {
        if (event.status === "RUNNING") {
          executedSteps.push(event.step);
        }
      });

      // F2 단계에서 에러가 발생하도록 설정
      let callCount = 0;
      mockPrismaRun.update.mockImplementation(() => {
        callCount++;
        // F1 RUNNING, F1 COMPLETED는 성공, F2 RUNNING에서 실패
        if (callCount === 3) {
          return Promise.reject(new Error("F2 실패"));
        }
        return Promise.resolve({ ...MOCK_PIPELINE_RUN, status: "COMPLETED" });
      });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      }).catch(() => {});

      // Assert — F1만 RUNNING으로 시작되어야 하고 F3~F5는 실행되지 않아야 함
      expect(executedSteps).not.toContain("F3");
      expect(executedSteps).not.toContain("F4");
      expect(executedSteps).not.toContain("F5");
    });

    it("단계 실패 시 에러 메시지가 DB에 저장된다", async () => {
      // Arrange
      const onEvent = jest.fn();
      const errorMessage = "F1 단계 실패: 저장소 접근 불가";
      mockPrismaRun.update
        .mockRejectedValueOnce(new Error(errorMessage))
        .mockResolvedValue({ ...MOCK_PIPELINE_RUN, status: "FAILED" });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      }).catch(() => {});

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            errorMessage: expect.any(String),
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // 서버 재시작 처리 (interrupted RUNNING → FAILED)
  // -------------------------------------------------------------------------

  describe("서버 재시작 처리", () => {
    it("markInterruptedRunsAsFailed()가 RUNNING 상태 레코드를 FAILED로 업데이트한다", async () => {
      // Arrange
      mockPrismaRun.updateMany.mockResolvedValue({ count: 2 });

      // Act
      await engine.markInterruptedRunsAsFailed();

      // Assert
      expect(mockPrismaRun.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "RUNNING",
          }),
          data: expect.objectContaining({
            status: "FAILED",
            errorMessage: expect.stringContaining("interrupted"),
          }),
        })
      );
    });

    it("markInterruptedRunsAsFailed()는 Promise를 반환한다", () => {
      // Arrange
      mockPrismaRun.updateMany.mockResolvedValue({ count: 0 });

      // Act
      const result = engine.markInterruptedRunsAsFailed();

      // Assert
      expect(result).toBeInstanceOf(Promise);
      return result;
    });

    it("RUNNING 상태가 없을 때 markInterruptedRunsAsFailed()는 에러 없이 완료된다", async () => {
      // Arrange
      mockPrismaRun.updateMany.mockResolvedValue({ count: 0 });

      // Act & Assert
      await expect(engine.markInterruptedRunsAsFailed()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // AbortController 기반 중단 메커니즘
  // -------------------------------------------------------------------------

  describe("AbortController 기반 중단", () => {
    it("stop() 호출 시 현재 실행 중인 단계가 중단 신호를 받는다", async () => {
      // Arrange
      const onEvent = jest.fn();
      let abortSignal: AbortSignal | undefined;

      // start()가 내부적으로 AbortController를 사용하여 신호를 전달하는지 검증
      // AbortSignal이 onEvent에 포함되거나 내부적으로 처리되는지 확인
      mockPrismaRun.update.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );

      engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
        onAbortSignal: (signal: AbortSignal) => {
          abortSignal = signal;
        },
      });

      // Act
      await engine.stop(MOCK_RUN_ID);

      // Assert — AbortSignal이 abort 상태여야 함
      if (abortSignal) {
        expect(abortSignal.aborted).toBe(true);
      }
      expect(engine.isRunning(MOCK_RUN_ID)).toBe(false);
    });

    it("여러 파이프라인이 동시에 실행될 수 있다", async () => {
      // Arrange
      const RUN_ID_2 = "run-cuid-002";
      const onEvent1 = jest.fn();
      const onEvent2 = jest.fn();

      mockPrismaRun.update.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );

      // Act
      engine.start(MOCK_RUN_ID, { ...MOCK_RUN_OPTIONS, onEvent: onEvent1 });
      engine.start(RUN_ID_2, {
        ...MOCK_RUN_OPTIONS,
        repoId: "repo-cuid-002",
        onEvent: onEvent2,
      });

      // Assert — 두 파이프라인 모두 실행 중이어야 함
      expect(engine.isRunning(MOCK_RUN_ID)).toBe(true);
      expect(engine.isRunning(RUN_ID_2)).toBe(true);

      // 정리
      await engine.stop(MOCK_RUN_ID);
      await engine.stop(RUN_ID_2);
    });

    it("하나의 파이프라인을 stop해도 다른 파이프라인은 영향받지 않는다", async () => {
      // Arrange
      const RUN_ID_2 = "run-cuid-002";
      const onEvent1 = jest.fn();
      const onEvent2 = jest.fn();

      mockPrismaRun.update.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );

      engine.start(MOCK_RUN_ID, { ...MOCK_RUN_OPTIONS, onEvent: onEvent1 });
      engine.start(RUN_ID_2, {
        ...MOCK_RUN_OPTIONS,
        repoId: "repo-cuid-002",
        onEvent: onEvent2,
      });

      // Act
      await engine.stop(MOCK_RUN_ID);

      // Assert
      expect(engine.isRunning(MOCK_RUN_ID)).toBe(false);
      expect(engine.isRunning(RUN_ID_2)).toBe(true);

      // 정리
      await engine.stop(RUN_ID_2);
    });
  });

  // -------------------------------------------------------------------------
  // DB 상태 업데이트
  // -------------------------------------------------------------------------

  describe("DB 상태 업데이트", () => {
    it("각 단계 시작 시 DB currentStep이 업데이트된다", async () => {
      // Arrange
      const onEvent = jest.fn();
      mockPrismaRun.update.mockResolvedValue({
        ...MOCK_PIPELINE_RUN,
        status: "COMPLETED",
      });

      // Act
      await engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      });

      // Assert — 각 단계에서 DB update가 호출되어야 함 (최소 F1~F5 각 1회씩)
      const updateCalls = mockPrismaRun.update.mock.calls;
      const updatedSteps = updateCalls
        .map((call: [{ data: { currentStep?: string } }]) => call[0].data?.currentStep)
        .filter(Boolean);

      // F1~F5 단계가 모두 업데이트되어야 함
      expect(updatedSteps).toEqual(
        expect.arrayContaining(["F1", "F2", "F3", "F4", "F5"])
      );
    });

    it("각 단계 시작 시 DB status가 RUNNING으로 업데이트된다", async () => {
      // Arrange
      const onEvent = jest.fn();
      mockPrismaRun.update.mockResolvedValue({
        ...MOCK_PIPELINE_RUN,
        status: "RUNNING",
      });

      // Act
      engine.start(MOCK_RUN_ID, {
        ...MOCK_RUN_OPTIONS,
        onEvent,
      });

      // 첫 번째 DB 업데이트 대기
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert
      expect(mockPrismaRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_RUN_ID },
          data: expect.objectContaining({
            status: "RUNNING",
          }),
        })
      );

      // 정리
      await engine.stop(MOCK_RUN_ID);
    });
  });
});
