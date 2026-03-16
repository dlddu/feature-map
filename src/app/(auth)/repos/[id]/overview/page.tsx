"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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

type LoadState = "idle" | "loading" | "success" | "error" | "not_found";

function getStatusBadge(status: string | null): {
  label: string;
  className: string;
} {
  switch (status) {
    case "COMPLETED":
      return {
        label: "분석 완료",
        className: "bg-emerald-500/10 text-emerald-400",
      };
    case "RUNNING":
    case "IN_PROGRESS":
      return {
        label: "분석 중",
        className: "bg-violet-500/10 text-violet-400",
      };
    case "PENDING":
      return {
        label: "대기 중",
        className: "bg-amber-500/10 text-amber-400",
      };
    case "FAILED":
      return {
        label: "실패",
        className: "bg-red-500/10 text-red-400",
      };
    default:
      return {
        label: "미분석",
        className: "bg-zinc-700 text-zinc-400",
      };
  }
}

function formatLastAnalyzed(lastAnalyzedAt: string | null): string {
  if (!lastAnalyzedAt) return "아직 분석되지 않음";
  const date = new Date(lastAnalyzedAt);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `마지막 분석: ${yyyy}-${mm}-${dd}`;
}

export default function RepoOverviewPage() {
  const params = useParams();
  const id = params?.id as string;

  const [repo, setRepo] = useState<EnrichedRepo | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");

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
      } catch {
        setLoadState("error");
      }
    }

    fetchRepo();
  }, [id]);

  const statusBadge = getStatusBadge(repo?.latestPipelineStatus ?? null);

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
            <p className="text-zinc-400">
              레포지토리를 찾을 수 없습니다.
            </p>
          </div>
        )}

        {/* 성공 상태 */}
        {loadState === "success" && repo && (
          <>
            {/* 레포명 헤더 */}
            <div className="mb-8">
              <p className="font-mono text-2xl font-bold text-white">
                {repo.fullName}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                브랜치: {repo.defaultBranch}
              </p>
            </div>

            {/* 개요 섹션 */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="mb-6 text-xl font-semibold text-white">개요</h2>

              <div className="space-y-4">
                {/* 분석 상태 */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">분석 상태</span>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${statusBadge.className}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>

                {/* Feature 수 */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Feature 수</span>
                  <span className="text-white">{repo.featureCount} features</span>
                </div>

                {/* 마지막 분석 시각 */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">분석 시각</span>
                  <span className="text-zinc-300">
                    {formatLastAnalyzed(repo.lastAnalyzedAt)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
