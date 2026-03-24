"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

interface EnrichedRepo {
  id: string;
  githubRepoId: number;
  fullName: string;
  defaultBranch: string;
  installationId: number;
  cloneUrl: string | null;
  latestPipelineStatus: string | null;
  featureCount: number;
  lastAnalyzedAt: string | null;
  layerCount?: number;
  strategyCount?: number;
}

type PipelineStep = "F1" | "F2" | "F3" | "F4" | "F5";
type StepStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
type SectionTab = "overview" | "layers" | "strategy" | "features";
type LoadState = "idle" | "loading" | "success" | "error" | "not_found";

interface StepState {
  step: PipelineStep;
  status: StepStatus;
}

const STEPS: PipelineStep[] = ["F1", "F2", "F3", "F4", "F5"];

const STEP_LABELS: Record<PipelineStep, string> = {
  F1: "레이어 추출",
  F2: "전략 분석",
  F3: "Feature 추출",
  F4: "Feature 분류",
  F5: "인수 테스트 생성",
};

// ---------------------------------------------------------------------------
// 유틸리티
// ---------------------------------------------------------------------------

function getStepStatusColor(status: StepStatus): string {
  switch (status) {
    case "COMPLETED":
      return "text-emerald-400 border-emerald-500";
    case "RUNNING":
      return "text-violet-400 border-violet-500";
    case "FAILED":
      return "text-rose-400 border-rose-500";
    default:
      return "text-zinc-500 border-zinc-600";
  }
}

function getStepStatusLabel(status: StepStatus): string {
  switch (status) {
    case "COMPLETED":
      return "완료";
    case "RUNNING":
      return "실행 중";
    case "FAILED":
      return "실패";
    default:
      return "대기 중";
  }
}

function getStepStatusBadgeClass(status: StepStatus): string {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-500/10 text-emerald-400";
    case "RUNNING":
      return "bg-violet-500/10 text-violet-400 animate-pulse";
    case "FAILED":
      return "bg-rose-500/10 text-rose-400";
    default:
      return "bg-zinc-700 text-zinc-400";
  }
}

// ---------------------------------------------------------------------------
// 컴포넌트: StepIndicator
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  step: PipelineStep;
  status: StepStatus;
  isLast: boolean;
  isRunning: boolean;
  onRun: (step: PipelineStep) => void;
  prerequisiteCompleted: boolean;
  showWarning: boolean;
  onWarningClose: () => void;
}

function StepIndicator({
  step,
  status,
  isLast,
  isRunning,
  onRun,
  prerequisiteCompleted,
  showWarning,
  onWarningClose,
}: StepIndicatorProps) {
  const colorClass = getStepStatusColor(status);
  const label = STEP_LABELS[step];
  const statusLabel = getStepStatusLabel(status);
  const badgeClass = getStepStatusBadgeClass(status);

  const handleRunClick = () => {
    if (!prerequisiteCompleted) {
      // 선행 단계 미완료 경고 표시는 부모에서 처리
      onRun(step);
      return;
    }
    onRun(step);
  };

  return (
    <div
      data-testid={`pipeline-step-${step.toLowerCase()}`}
      className="flex flex-col items-center"
    >
      <div className="flex items-center w-full">
        {/* 원형 아이콘 */}
        <div
          data-testid={`step-indicator-${step.toLowerCase()}`}
          className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${colorClass} bg-zinc-900 text-sm font-bold flex-shrink-0`}
        >
          {status === "COMPLETED" ? "✓" : step}
        </div>

        {/* 연결선 */}
        {!isLast && (
          <div className="flex-1 h-0.5 bg-zinc-700 mx-2" />
        )}
      </div>

      {/* 단계 정보 */}
      <div className="mt-2 text-center">
        <p className="text-xs text-zinc-300 font-medium">{label}</p>
        <span
          data-testid={`step-status-${step.toLowerCase()}`}
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
        >
          {statusLabel}
        </span>

        {/* 개별 실행 버튼 */}
        {!isRunning && (
          <div className="mt-2">
            <button
              data-testid={`step-run-btn-${step.toLowerCase()}`}
              onClick={handleRunClick}
              className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
              title={`${step} 단계 실행`}
            >
              ▶
            </button>
          </div>
        )}

        {/* 선행 단계 미완료 경고 */}
        {showWarning && (
          <div
            data-testid="prerequisite-warning"
            className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400"
          >
            선행 단계를 먼저 완료해주세요
            <button
              onClick={onWarningClose}
              className="ml-1 text-amber-300 hover:text-amber-100"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 컴포넌트: PipelineCard
// ---------------------------------------------------------------------------

interface PipelineCardProps {
  stepStates: StepState[];
  isRunning: boolean;
  onRunAll: () => void;
  onAbort: () => void;
  onRunStep: (step: PipelineStep) => void;
  warningStep: PipelineStep | null;
  onWarningClose: () => void;
}

function PipelineCard({
  stepStates,
  isRunning,
  onRunAll,
  onAbort,
  onRunStep,
  warningStep,
  onWarningClose,
}: PipelineCardProps) {
  const getStepStatus = (step: PipelineStep): StepStatus => {
    return stepStates.find((s) => s.step === step)?.status ?? "PENDING";
  };

  const isStepPrerequisiteCompleted = (step: PipelineStep): boolean => {
    const stepIndex = STEPS.indexOf(step);
    if (stepIndex === 0) return true;
    const prevStep = STEPS[stepIndex - 1];
    if (!prevStep) return true;
    return getStepStatus(prevStep) === "COMPLETED";
  };

  return (
    <div
      data-testid="pipeline-card"
      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">파이프라인</h2>
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              data-testid="run-all-btn"
              onClick={onRunAll}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
            >
              전체 실행
            </button>
          ) : (
            <button
              data-testid="abort-btn"
              onClick={onAbort}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 transition-colors"
            >
              중단
            </button>
          )}
        </div>
      </div>

      {/* F1~F5 StepIndicator */}
      <div className="grid grid-cols-5 gap-2">
        {STEPS.map((step, index) => (
          <StepIndicator
            key={step}
            step={step}
            status={getStepStatus(step)}
            isLast={index === STEPS.length - 1}
            isRunning={isRunning}
            onRun={onRunStep}
            prerequisiteCompleted={isStepPrerequisiteCompleted(step)}
            showWarning={warningStep === step}
            onWarningClose={onWarningClose}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 컴포넌트: QuickStatsGrid
// ---------------------------------------------------------------------------

interface QuickStatsGridProps {
  layerCount: number;
  strategyCount: number;
  featureCount: number;
  onTabChange: (tab: SectionTab) => void;
}

function QuickStatsGrid({
  layerCount,
  strategyCount,
  featureCount,
  onTabChange,
}: QuickStatsGridProps) {
  return (
    <div
      data-testid="quick-stats-grid"
      className="grid grid-cols-3 gap-4"
    >
      <button
        data-testid="quick-stats-card-layers"
        onClick={() => onTabChange("layers")}
        className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left hover:border-zinc-700 transition-colors"
      >
        <p className="text-2xl font-bold text-white">{layerCount}</p>
        <p className="mt-1 text-sm text-zinc-400">수평계층</p>
      </button>

      <button
        data-testid="quick-stats-card-strategies"
        onClick={() => onTabChange("strategy")}
        className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left hover:border-zinc-700 transition-colors"
      >
        <p className="text-2xl font-bold text-white">{strategyCount}</p>
        <p className="mt-1 text-sm text-zinc-400">탐색전략</p>
      </button>

      <button
        data-testid="quick-stats-card-features"
        onClick={() => onTabChange("features")}
        className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left hover:border-zinc-700 transition-colors"
      >
        <p className="text-2xl font-bold text-white">{featureCount}</p>
        <p className="mt-1 text-sm text-zinc-400">Features</p>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 컴포넌트: SectionTabs
// ---------------------------------------------------------------------------

interface SectionTabsProps {
  activeTab: SectionTab;
  onTabChange: (tab: SectionTab) => void;
}

function SectionTabs({ activeTab, onTabChange }: SectionTabsProps) {
  const tabs: { id: SectionTab; label: string; testId: string }[] = [
    { id: "overview", label: "개요", testId: "section-tab-overview" },
    { id: "layers", label: "계층", testId: "section-tab-layers" },
    { id: "strategy", label: "전략", testId: "section-tab-strategy" },
    { id: "features", label: "Features", testId: "section-tab-features" },
  ];

  return (
    <div
      data-testid="section-tabs"
      role="tablist"
      className="flex border-b border-zinc-800 mb-6"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            data-testid={tab.testId}
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              isActive
                ? "border-violet-500 text-violet-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 페이지 컴포넌트
// ---------------------------------------------------------------------------

export default function RepoOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [repo, setRepo] = useState<EnrichedRepo | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [activeTab, setActiveTab] = useState<SectionTab>("overview");
  const [stepStates, setStepStates] = useState<StepState[]>(
    STEPS.map((step) => ({ step, status: "PENDING" as StepStatus }))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [warningStep, setWarningStep] = useState<PipelineStep | null>(null);

  // 레포 데이터 로드
  useEffect(() => {
    if (!id) return;

    async function fetchRepo() {
      setLoadState("loading");
      try {
        const res = await fetch("/api/repos");
        if (!res.ok) {
          setLoadState("error");
          return;
        }
        const data = await res.json() as { repos?: EnrichedRepo[] };
        const repos: EnrichedRepo[] = data.repos ?? [];
        const found = repos.find((r) => r.id === id);
        if (!found) {
          setLoadState("not_found");
          return;
        }
        setRepo(found);
        setLoadState("success");
      } catch {
        setLoadState("error");
      }
    }

    fetchRepo();
  }, [id]);

  // SSE 연결 (파이프라인 실행 중)
  useEffect(() => {
    if (!id || !isRunning) return;

    const eventSource = new EventSource(
      `/api/repos/${id}/pipeline/stream`
    );

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          step?: PipelineStep;
          status?: StepStatus;
        };
        if (data.step && data.status) {
          setStepStates((prev) =>
            prev.map((s) =>
              s.step === data.step ? { ...s, status: data.status! } : s
            )
          );

          // 모든 단계 완료 시 running 상태 해제
          if (data.step === "F5" && (data.status === "COMPLETED" || data.status === "FAILED")) {
            setIsRunning(false);
          }
          // 단계 실패 시 running 상태 해제
          if (data.status === "FAILED") {
            setIsRunning(false);
          }
        }
      } catch {
        // 파싱 오류 무시
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setIsRunning(false);
    };

    return () => {
      eventSource.close();
    };
  }, [id, isRunning]);

  // 전체 실행
  const handleRunAll = useCallback(async () => {
    if (!id) return;

    try {
      const res = await fetch(`/api/repos/${id}/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        // 상태 초기화
        setStepStates(STEPS.map((step) => ({ step, status: "PENDING" as StepStatus })));
        setIsRunning(true);
        // F1 상태를 RUNNING으로 업데이트
        setStepStates((prev) =>
          prev.map((s) => (s.step === "F1" ? { ...s, status: "RUNNING" } : s))
        );
      }
    } catch {
      // 오류 처리
    }
  }, [id]);

  // 중단
  const handleAbort = useCallback(async () => {
    if (!id) return;

    try {
      await fetch(`/api/repos/${id}/pipeline/stop`, {
        method: "POST",
      });
      setIsRunning(false);
      // Mark running steps as FAILED
      setStepStates((prev) =>
        prev.map((s) => (s.status === "RUNNING" ? { ...s, status: "FAILED" } : s))
      );
    } catch {
      // 오류 처리
    }
  }, [id]);

  // 개별 단계 실행
  const handleRunStep = useCallback(
    async (step: PipelineStep) => {
      if (!id) return;

      // 선행 단계 완료 여부 확인
      const stepIndex = STEPS.indexOf(step);
      if (stepIndex > 0) {
        const prevStep = STEPS[stepIndex - 1]!;
        const prevStatus = stepStates.find((s) => s.step === prevStep)?.status;
        if (prevStatus !== "COMPLETED") {
          setWarningStep(step);
          return;
        }
      }

      try {
        const res = await fetch(`/api/repos/${id}/pipeline/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step }),
        });

        if (res.ok) {
          setIsRunning(true);
          setStepStates((prev) =>
            prev.map((s) => (s.step === step ? { ...s, status: "RUNNING" } : s))
          );
        }
      } catch {
        // 오류 처리
      }
    },
    [id, stepStates]
  );

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* 로딩 상태: 스켈레톤 */}
      {(loadState === "idle" || loadState === "loading") && (
        <div className="p-8 animate-pulse">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 h-8 w-1/2 rounded bg-zinc-800" />
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="mb-4 h-6 w-1/3 rounded bg-zinc-700" />
              <div className="mb-3 h-4 w-2/3 rounded bg-zinc-800" />
            </div>
          </div>
        </div>
      )}

      {/* 에러 상태 */}
      {loadState === "error" && (
        <div className="p-8">
          <div className="mx-auto max-w-4xl rounded-2xl border border-red-800 bg-red-900/20 p-6 text-center">
            <p className="text-red-400">
              레포지토리 정보를 불러오는 중 오류가 발생했습니다.
            </p>
          </div>
        </div>
      )}

      {/* not_found 상태 */}
      {loadState === "not_found" && (
        <div className="p-8">
          <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <p className="text-zinc-400">레포지토리를 찾을 수 없습니다.</p>
          </div>
        </div>
      )}

      {/* 성공 상태 */}
      {loadState === "success" && repo && (
        <div>
          {/* MobileHeader */}
          <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
            <button
              onClick={() => router.back()}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
              aria-label="뒤로가기"
            >
              ←
            </button>
            <h1 className="font-mono text-lg font-bold text-white truncate">
              {repo.fullName}
            </h1>
          </div>

          <div className="mx-auto max-w-4xl px-4 py-6">
            {/* SectionTabs */}
            <SectionTabs activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Overview Panel */}
            {activeTab === "overview" && (
              <div data-testid="overview-panel" role="tabpanel">
                <h2 className="text-lg font-semibold text-white mb-6">개요</h2>
                <div className="space-y-6">
                  {/* PipelineCard */}
                  <PipelineCard
                    stepStates={stepStates}
                    isRunning={isRunning}
                    onRunAll={handleRunAll}
                    onAbort={handleAbort}
                    onRunStep={handleRunStep}
                    warningStep={warningStep}
                    onWarningClose={() => setWarningStep(null)}
                  />

                  {/* QuickStatsGrid */}
                  <QuickStatsGrid
                    layerCount={repo.layerCount ?? 0}
                    strategyCount={repo.strategyCount ?? 0}
                    featureCount={repo.featureCount}
                    onTabChange={setActiveTab}
                  />
                </div>
              </div>
            )}

            {/* Layers Panel */}
            {activeTab === "layers" && (
              <div data-testid="layers-panel" role="tabpanel">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
                  <h2 className="mb-4 text-lg font-semibold text-white">계층</h2>
                  <p className="text-zinc-400">수평계층 정보가 여기에 표시됩니다.</p>
                </div>
              </div>
            )}

            {/* Strategy Panel */}
            {activeTab === "strategy" && (
              <div data-testid="strategy-panel" role="tabpanel">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
                  <h2 className="mb-4 text-lg font-semibold text-white">전략</h2>
                  <p className="text-zinc-400">탐색전략 정보가 여기에 표시됩니다.</p>
                </div>
              </div>
            )}

            {/* Features Panel */}
            {activeTab === "features" && (
              <div data-testid="features-panel" role="tabpanel">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
                  <h2 className="mb-4 text-lg font-semibold text-white">Features</h2>
                  <p className="text-zinc-400">Features 정보가 여기에 표시됩니다.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
