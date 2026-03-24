/**
 * PipelineEngine
 *
 * 싱글톤 패턴으로 파이프라인 실행을 관리합니다.
 * - start(runId, options): 비동기 파이프라인 실행
 * - stop(runId): AbortController 기반 중단
 * - isRunning(runId): 실행 여부 확인
 * - F1→F2→F3→F4→F5 순차 실행
 * - 각 단계 상태 변경 시 onEvent 콜백 호출
 * - 서버 재시작 시 RUNNING → FAILED 마킹
 */

import { prisma } from "@/lib/db/client";

export type PipelineStep = "F1" | "F2" | "F3" | "F4" | "F5";

export type StepStatus = "RUNNING" | "COMPLETED" | "FAILED";

export interface StepEvent {
  step: PipelineStep;
  status: StepStatus;
  errorMessage?: string;
  timestamp: Date;
}

export interface PipelineRunOptions {
  repoId: string;
  userId: string;
  commitSha?: string;
  startStep?: PipelineStep;
  onEvent?: (event: StepEvent) => void;
  onAbortSignal?: (signal: AbortSignal) => void;
}

export const STEPS: PipelineStep[] = ["F1", "F2", "F3", "F4", "F5"];

// 싱글톤 인스턴스 (모듈 수준에서 관리)
let _instance: PipelineEngine | null = null;

// 실행 중인 파이프라인 추적: runId → RunState
interface RunState {
  controller: AbortController;
  onEvent?: (event: StepEvent) => void;
  currentStep: PipelineStep;
}

const _runningMap = new Map<string, RunState>();

export class PipelineEngine {
  private constructor() {
    throw new Error("PipelineEngine은 싱글톤입니다. getInstance()를 사용하세요.");
  }

  static getInstance(): PipelineEngine {
    if (!_instance) {
      // Object.create로 private constructor 우회하여 인스턴스 생성
      _instance = Object.create(PipelineEngine.prototype) as PipelineEngine;
    }
    return _instance;
  }

  start(runId: string, options: PipelineRunOptions): Promise<void> {
    if (_runningMap.has(runId)) {
      return Promise.reject(new Error(`파이프라인이 이미 실행 중입니다: ${runId}`));
    }

    const controller = new AbortController();
    const startStep = options.startStep ?? "F1";

    _runningMap.set(runId, {
      controller,
      onEvent: options.onEvent,
      currentStep: startStep,
    });

    // onAbortSignal 콜백이 있으면 signal 전달
    if (options.onAbortSignal) {
      options.onAbortSignal(controller.signal);
    }

    // 실행 Promise 생성 및 반환
    return this._executeRun(runId, options, controller);
  }

  private async _executeRun(
    runId: string,
    options: PipelineRunOptions,
    controller: AbortController
  ): Promise<void> {
    const { startStep, onEvent } = options;
    const signal = controller.signal;

    // startStep이 지정된 경우 해당 단계부터, 아니면 F1부터
    const startIndex = startStep ? STEPS.indexOf(startStep) : 0;
    const stepsToRun = STEPS.slice(startIndex);

    let currentStep: PipelineStep = stepsToRun[0] ?? "F1";

    try {
      for (const step of stepsToRun) {
        currentStep = step;

        // abort 신호 확인 (단계 시작 전)
        if (signal.aborted) {
          _runningMap.delete(runId);
          return;
        }

        // 실행 상태 Map 업데이트
        const state = _runningMap.get(runId);
        if (state) {
          state.currentStep = step;
        }

        // 단계 시작 이벤트 발행
        if (onEvent) {
          onEvent({
            step,
            status: "RUNNING",
            timestamp: new Date(),
          });
        }

        // DB 상태 업데이트 (RUNNING) - 여기서 에러 발생 시 catch로 이동
        await prisma.pipelineRun.update({
          where: { id: runId },
          data: {
            status: "RUNNING",
            currentStep: step,
          },
        });

        // abort 신호 재확인 (DB 업데이트 후)
        if (signal.aborted) {
          _runningMap.delete(runId);
          return;
        }

        // 단계 완료 이벤트 발행
        if (onEvent) {
          onEvent({
            step,
            status: "COMPLETED",
            timestamp: new Date(),
          });
        }

        // DB 상태 업데이트 (COMPLETED)
        await prisma.pipelineRun.update({
          where: { id: runId },
          data: {
            status: "COMPLETED",
            currentStep: step,
          },
        });
      }

      // 모든 단계 완료 - 최종 COMPLETED 업데이트
      await prisma.pipelineRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      _runningMap.delete(runId);
    } catch (error) {
      // 단계 실패 처리
      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";

      // FAILED 이벤트 발행
      if (onEvent) {
        onEvent({
          step: currentStep,
          status: "FAILED",
          errorMessage,
          timestamp: new Date(),
        });
      }

      // DB FAILED 업데이트
      try {
        await prisma.pipelineRun.update({
          where: { id: runId },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorMessage,
          },
        });
      } catch {
        // DB 업데이트 실패는 무시
      }

      _runningMap.delete(runId);

      throw error;
    }
  }

  async stop(runId: string): Promise<void> {
    const state = _runningMap.get(runId);
    if (!state) {
      // 실행 중이 아닌 경우 에러 없이 완료
      return;
    }

    // 현재 단계 저장 (맵 제거 전에)
    const currentStep = state.currentStep;
    const onEvent = state.onEvent;

    // abort 신호 전송
    state.controller.abort();

    // 맵에서 즉시 제거 (isRunning이 false를 반환하도록)
    _runningMap.delete(runId);

    // onEvent FAILED 콜백 직접 호출 (abort로 인한 중단)
    if (onEvent) {
      onEvent({
        step: currentStep,
        status: "FAILED",
        errorMessage: "사용자에 의해 중단됨",
        timestamp: new Date(),
      });
    }
  }

  isRunning(runId: string): boolean {
    return _runningMap.has(runId);
  }

  async markInterruptedRunsAsFailed(): Promise<void> {
    await prisma.pipelineRun.updateMany({
      where: {
        status: "RUNNING",
      },
      data: {
        status: "FAILED",
        errorMessage: "서버 재시작으로 인해 interrupted",
        completedAt: new Date(),
      },
    });
  }
}
