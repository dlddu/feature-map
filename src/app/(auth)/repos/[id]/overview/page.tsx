"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";

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
}

type StepStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

interface PipelineStep {
  id: "F1" | "F2" | "F3" | "F4" | "F5";
  label: string;
  description: string;
  status: StepStatus;
}

type SectionTab = "overview" | "layers" | "strategy" | "features";

type LoadState = "idle" | "loading" | "success" | "error" | "not_found";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const PIPELINE_STEPS: PipelineStep[] = [
  { id: "F1", label: "F1", description: "레이어 추출", status: "PENDING" },
  { id: "F2", label: "F2", description: "전략 분석", status: "PENDING" },
  { id: "F3", label: "F3", description: "Feature 추출", status: "PENDING" },
  { id: "F4", label: "F4", description: "Feature 분류", status: "PENDING" },
  { id: "F5", label: "F5", description: "인수 테스트 생성", status: "PENDING" },
];

// ---------------------------------------------------------------------------
// 유틸 함수
// ---------------------------------------------------------------------------

function getStepStatusLabel(status: StepStatus): string {
  switch (status) {
    case "COMPLETED":
      return "완료";
    case "RUNNING":
      return "실행 중";
    case "FAILED":
      return "실패";
    case "PENDING":
    default:
      return "대기 중";
  }
}

function getStepStatusClassName(status: StepStatus): string {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "RUNNING":
      return "bg-violet-500/10 text-violet-400 border-violet-500/20";
    case "FAILED":
      return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    case "PENDING":
    default:
      return "bg-zinc-700/50 text-zinc-400 border-zinc-600/20";
  }
}

function getStepDotClassName(status: StepStatus): string {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-500";
    case "RUNNING":
      return "bg-violet-500";
    case "FAILED":
      return "bg-rose-500";
    case "PENDING":
    default:
      return "bg-zinc-600";
  }
}

// ---------------------------------------------------------------------------
// PipelineCard 컴포넌트
// ---------------------------------------------------------------------------

interface PipelineCardProps {
  repoId: string;
  steps: PipelineStep[];
  isRunning: boolean;
  prerequisiteWarning: string | null;
  onRunAll: () => void;
  onStop: () => void;
  onRunStep: (stepId: string) => void;
  onDismissWarning: () => void;
}

function PipelineCard({
  repoId: _repoId,
  steps,
  isRunning,
  prerequisiteWarning,
  onRunAll,
  onStop,
  onRunStep,
  onDismissWarning,
}: PipelineCardProps) {
  return (
    <div
      data-testid="pipeline-card"
      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
    >
      {/* 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">파이프라인</h2>
        <div className="flex gap-2">
          {isRunning ? (
            <button
              type="button"
              onClick={onStop}
              className="min-h-[36px] rounded-lg bg-rose-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
            >
              중단
            </button>
          ) : (
            <button
              type="button"
              onClick={onRunAll}
              className="min-h-[36px] rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
            >
              전체 실행
            </button>
          )}
        </div>
      </div>

      {/* 선행 단계 경고 메시지 */}
      {prerequisiteWarning && (
        <div
          data-testid="prerequisite-warning"
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4"
        >
          <span className="text-amber-400">⚠</span>
          <div className="flex-1">
            <p className="text-sm text-amber-300">{prerequisiteWarning}</p>
          </div>
          <button
            type="button"
            onClick={onDismissWarning}
            className="text-amber-400 hover:text-amber-200"
            aria-label="경고 닫기"
          >
            ✕
          </button>
        </div>
      )}

      {/* 파이프라인 단계 목록 */}
      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.id}
            data-testid={`pipeline-step-${step.id.toLowerCase()}`}
            className={`flex items-center justify-between rounded-xl border p-4 transition-colors ${getStepStatusClassName(step.status)}`}
          >
            {/* 단계 정보 */}
            <div className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${getStepDotClassName(step.status)}`}
              />
              <div>
                <span className="font-mono text-sm font-semibold">
                  {step.label}
                </span>
                <span className="ml-2 text-sm opacity-80">
                  {step.description}
                </span>
              </div>
            </div>

            {/* 상태 + 실행 버튼 */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium">
                {getStepStatusLabel(step.status)}
              </span>
              {!isRunning && (
                <button
                  type="button"
                  onClick={() => onRunStep(step.id)}
                  aria-label={`${step.label} 단계 실행`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-700 text-xs text-white hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                >
                  ▶
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuickStatsGrid 컴포넌트
// ---------------------------------------------------------------------------

interface QuickStatsGridProps {
  featureCount: number;
  layerCount: number;
  strategyCount: number;
  onClickFeatures: () => void;
  onClickLayers: () => void;
}

function QuickStatsGrid({
  featureCount,
  layerCount,
  strategyCount: _strategyCount,
  onClickFeatures,
  onClickLayers,
}: QuickStatsGridProps) {
  return (
    <div
      data-testid="quick-stats-grid"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3"
    >
      {/* Feature 수 카드 */}
      <button
        type="button"
        data-testid="quick-stats-card-features"
        onClick={onClickFeatures}
        className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-800/60 focus:outline-none focus:ring-2 focus:ring-zinc-500"
      >
        <p className="text-2xl font-bold text-white">{featureCount}</p>
        <p className="mt-1 text-sm text-zinc-400">Features</p>
      </button>

      {/* 계층 수 카드 */}
      <button
        type="button"
        data-testid="quick-stats-card-layers"
        onClick={onClickLayers}
        className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-800/60 focus:outline-none focus:ring-2 focus:ring-zinc-500"
      >
        <p className="text-2xl font-bold text-white">{layerCount}</p>
        <p className="mt-1 text-sm text-zinc-400">계층</p>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionTabs 컴포넌트
// ---------------------------------------------------------------------------

interface SectionTabsProps {
  activeTab: SectionTab;
  onChangeTab: (tab: SectionTab) => void;
}

const TAB_CONFIG: { id: SectionTab; label: string; testId: string }[] = [
  { id: "overview", label: "개요", testId: "section-tab-overview" },
  { id: "layers", label: "계층", testId: "section-tab-layers" },
  { id: "strategy", label: "전략", testId: "section-tab-strategy" },
  { id: "features", label: "Features", testId: "section-tab-features" },
];

function SectionTabs({ activeTab, onChangeTab }: SectionTabsProps) {
  return (
    <div
      data-testid="section-tabs"
      role="tablist"
      aria-label="레포 상세 섹션"
      className="flex border-b border-zinc-800"
    >
      {TAB_CONFIG.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            data-testid={tab.testId}
            aria-selected={isActive}
            aria-controls={`${tab.id}-panel`}
            onClick={() => onChangeTab(tab.id)}
            className={[
              "min-h-[44px] px-5 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-500",
              isActive
                ? "border-b-2 border-emerald-500 text-white"
                : "text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 패널 컴포넌트들
// ---------------------------------------------------------------------------

interface OverviewPanelProps {
  repo: EnrichedRepo;
  steps: PipelineStep[];
  isRunning: boolean;
  prerequisiteWarning: string | null;
  onRunAll: () => void;
  onStop: () => void;
  onRunStep: (stepId: string) => void;
  onDismissWarning: () => void;
  onClickFeatures: () => void;
  onClickLayers: () => void;
}

function OverviewPanel({
  repo,
  steps,
  isRunning,
  prerequisiteWarning,
  onRunAll,
  onStop,
  onRunStep,
  onDismissWarning,
  onClickFeatures,
  onClickLayers,
}: OverviewPanelProps) {
  return (
    <div
      data-testid="overview-panel"
      role="tabpanel"
      id="overview-panel"
      aria-labelledby="section-tab-overview"
      className="space-y-6 pt-6"
    >
      <PipelineCard
        repoId={repo.id}
        steps={steps}
        isRunning={isRunning}
        prerequisiteWarning={prerequisiteWarning}
        onRunAll={onRunAll}
        onStop={onStop}
        onRunStep={onRunStep}
        onDismissWarning={onDismissWarning}
      />
      <QuickStatsGrid
        featureCount={repo.featureCount}
        layerCount={0}
        strategyCount={0}
        onClickFeatures={onClickFeatures}
        onClickLayers={onClickLayers}
      />
    </div>
  );
}

function LayersPanel() {
  return (
    <div
      data-testid="layers-panel"
      role="tabpanel"
      id="layers-panel"
      aria-labelledby="section-tab-layers"
      className="pt-6"
    >
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">계층 목록</h3>
        <p className="text-sm text-zinc-400">
          파이프라인을 실행하면 계층 분석 결과가 여기에 표시됩니다.
        </p>
      </div>
    </div>
  );
}

function StrategyPanel() {
  return (
    <div
      data-testid="strategy-panel"
      role="tabpanel"
      id="strategy-panel"
      aria-labelledby="section-tab-strategy"
      className="pt-6"
    >
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">전략 목록</h3>
        <p className="text-sm text-zinc-400">
          파이프라인을 실행하면 전략 분석 결과가 여기에 표시됩니다.
        </p>
      </div>
    </div>
  );
}

function FeaturesPanel() {
  return (
    <div
      data-testid="features-panel"
      role="tabpanel"
      id="features-panel"
      aria-labelledby="section-tab-features"
      className="pt-6"
    >
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-white">Features 목록</h3>
        <p className="text-sm text-zinc-400">
          파이프라인을 실행하면 Features 분석 결과가 여기에 표시됩니다.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 메인 페이지 컴포넌트
// ---------------------------------------------------------------------------

export default function RepoOverviewPage() {
  const params = useParams();
  const id = params?.id as string;

  const [repo, setRepo] = useState<EnrichedRepo | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [activeTab, setActiveTab] = useState<SectionTab>("overview");

  // 파이프라인 단계 상태
  const [steps, setSteps] = useState<PipelineStep[]>(
    PIPELINE_STEPS.map((s) => ({ ...s }))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [prerequisiteWarning, setPrerequisiteWarning] = useState<string | null>(
    null
  );

  // SSE 연결 ref
  const sseRef = useRef<EventSource | null>(null);

  // ---------------------------------------------------------------------------
  // 데이터 로딩
  // ---------------------------------------------------------------------------

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
        const data = await res.json();
        const repos: EnrichedRepo[] = data.repos ?? [];
        const found = repos.find((r) => r.id === id);
        if (!found) {
          setLoadState("not_found");
          return;
        }
        setRepo(found);
        setLoadState("success");

        // 최신 파이프라인 상태로 단계 초기화
        if (
          found.latestPipelineStatus === "PENDING" ||
          found.latestPipelineStatus === null
        ) {
          setSteps(PIPELINE_STEPS.map((s) => ({ ...s, status: "PENDING" })));
        }
      } catch {
        setLoadState("error");
      }
    }

    fetchRepo();
  }, [id]);

  // ---------------------------------------------------------------------------
  // SSE 구독 함수
  // ---------------------------------------------------------------------------

  const connectSSE = useCallback(
    (runId: string) => {
      // 기존 연결 정리
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }

      const url = `/api/repos/${id}/pipeline/stream?runId=${runId}`;
      const eventSource = new EventSource(url);
      sseRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            step?: string;
            status?: string;
          };

          if (data.step && data.status) {
            const newStatus = data.status as StepStatus;
            const stepId = data.step as PipelineStep["id"];

            setSteps((prev) =>
              prev.map((s) =>
                s.id === stepId ? { ...s, status: newStatus } : s
              )
            );

            // 파이프라인 완료/실패 시 running 상태 해제
            if (
              newStatus === "COMPLETED" &&
              stepId === "F5"
            ) {
              setIsRunning(false);
            }
            if (newStatus === "FAILED") {
              setIsRunning(false);
            }
          }
        } catch {
          // JSON 파싱 실패 시 무시
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        sseRef.current = null;
      };
    },
    [id]
  );

  // 언마운트 시 SSE 정리
  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 파이프라인 액션
  // ---------------------------------------------------------------------------

  async function handleRunAll() {
    if (!repo || isRunning) return;

    try {
      const res = await fetch(`/api/repos/${repo.id}/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) return;

      const data = await res.json() as {
        pipelineRunId: string;
        status: string;
        currentStep: string;
      };

      setCurrentRunId(data.pipelineRunId);
      setIsRunning(true);

      // 모든 단계를 PENDING으로 초기화 후 F1을 RUNNING으로 설정
      setSteps((prev) =>
        prev.map((s) =>
          s.id === data.currentStep
            ? { ...s, status: "RUNNING" }
            : { ...s, status: "PENDING" }
        )
      );

      // SSE 연결
      connectSSE(data.pipelineRunId);
    } catch {
      // 에러 처리
    }
  }

  async function handleStop() {
    if (!repo || !isRunning) return;

    try {
      const res = await fetch(`/api/repos/${repo.id}/pipeline/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) return;

      // SSE 연결 종료
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }

      setIsRunning(false);
      setCurrentRunId(null);

      // RUNNING 상태인 단계를 FAILED로 변경
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "RUNNING" ? { ...s, status: "FAILED" } : s
        )
      );
    } catch {
      // 에러 처리
    }
  }

  async function handleRunStep(stepId: string) {
    if (!repo || isRunning) return;

    // 선행 단계 완료 여부 확인
    const stepIndex = steps.findIndex((s) => s.id === stepId);
    if (stepIndex > 0) {
      const prerequisite = steps[stepIndex - 1];
      if (prerequisite.status !== "COMPLETED") {
        setPrerequisiteWarning(
          `선행 단계(${prerequisite.label})가 완료되지 않았습니다. 순서대로 실행해주세요.`
        );
        return;
      }
    }

    try {
      const res = await fetch(`/api/repos/${repo.id}/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepId }),
      });

      if (!res.ok) return;

      const data = await res.json() as {
        pipelineRunId: string;
        status: string;
        currentStep: string;
      };

      setCurrentRunId(data.pipelineRunId);
      setIsRunning(true);

      // 해당 단계만 RUNNING으로 설정
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId ? { ...s, status: "RUNNING" } : s
        )
      );

      // SSE 연결
      connectSSE(data.pipelineRunId);
    } catch {
      // 에러 처리
    }
  }

  // ---------------------------------------------------------------------------
  // 탭 전환 핸들러
  // ---------------------------------------------------------------------------

  function handleChangeTab(tab: SectionTab) {
    setActiveTab(tab);
  }

  function handleClickFeatures() {
    setActiveTab("features");
  }

  function handleClickLayers() {
    setActiveTab("layers");
  }

  // ---------------------------------------------------------------------------
  // 렌더링
  // ---------------------------------------------------------------------------

  // currentRunId 사용 (향후 SSE 연결 등에 활용)
  void currentRunId;

  return (
    <main className="min-h-screen bg-zinc-950 p-8">
      <div className="mx-auto max-w-4xl">
        {/* 로딩 상태: 스켈레톤 */}
        {(loadState === "idle" || loadState === "loading") && (
          <div className="animate-pulse">
            <div className="mb-6 h-8 w-1/2 rounded bg-zinc-800" />
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="mb-4 h-6 w-1/3 rounded bg-zinc-700" />
              <div className="mb-3 h-4 w-2/3 rounded bg-zinc-800" />
              <div className="mb-3 h-4 w-1/2 rounded bg-zinc-800" />
              <div className="h-4 w-1/3 rounded bg-zinc-800" />
            </div>
          </div>
        )}

        {/* 에러 상태 */}
        {loadState === "error" && (
          <div className="rounded-2xl border border-red-800 bg-red-900/20 p-6 text-center">
            <p className="text-red-400">
              레포지토리 정보를 불러오는 중 오류가 발생했습니다.
            </p>
          </div>
        )}

        {/* not_found 상태 */}
        {loadState === "not_found" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <p className="text-zinc-400">레포지토리를 찾을 수 없습니다.</p>
          </div>
        )}

        {/* 성공 상태 */}
        {loadState === "success" && repo && (
          <>
            {/* 레포명 헤더 */}
            <div className="mb-6">
              <p className="font-mono text-2xl font-bold text-white">
                {repo.fullName}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                브랜치: {repo.defaultBranch}
              </p>
            </div>

            {/* SectionTabs */}
            <SectionTabs
              activeTab={activeTab}
              onChangeTab={handleChangeTab}
            />

            {/* 탭 패널 */}
            {activeTab === "overview" && (
              <OverviewPanel
                repo={repo}
                steps={steps}
                isRunning={isRunning}
                prerequisiteWarning={prerequisiteWarning}
                onRunAll={handleRunAll}
                onStop={handleStop}
                onRunStep={handleRunStep}
                onDismissWarning={() => setPrerequisiteWarning(null)}
                onClickFeatures={handleClickFeatures}
                onClickLayers={handleClickLayers}
              />
            )}

            {activeTab === "layers" && <LayersPanel />}

            {activeTab === "strategy" && <StrategyPanel />}

            {activeTab === "features" && <FeaturesPanel />}
          </>
        )}
      </div>
    </main>
  );
}
