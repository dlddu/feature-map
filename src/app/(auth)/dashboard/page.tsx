"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface RegisteredRepo {
  id: string;
  githubRepoId: number;
  fullName: string;
  defaultBranch: string;
  installationId: number;
  cloneUrl: string | null;
}

interface GithubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: {
    login: string;
  };
  private: boolean;
  default_branch: string;
  clone_url: string;
}

export default function DashboardPage() {
  const router = useRouter();

  const [registeredRepos, setRegisteredRepos] = useState<RegisteredRepo[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [installationId, setInstallationId] = useState<number | null>(null);

  // 사용자 정보 조회 (installationId 포함)
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        setInstallationId(data.user?.installationId ?? null);
      } catch {
        // 사용자 정보 조회 실패 시 무시
      }
    }
    fetchUser();
  }, []);

  // 등록된 레포 목록 조회
  const fetchRegisteredRepos = useCallback(async () => {
    try {
      const res = await fetch("/api/repos");
      if (!res.ok) return;
      const data = await res.json();
      setRegisteredRepos(data.repos ?? []);
    } catch {
      // 조회 실패 시 무시
    }
  }, []);

  useEffect(() => {
    fetchRegisteredRepos();
  }, [fetchRegisteredRepos]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function handleOpenDialog() {
    setIsDialogOpen(true);
    setSelectedRepo(null);

    try {
      const res = await fetch("/api/github/repos");
      if (!res.ok) return;
      const data = await res.json();
      setGithubRepos(data.repositories ?? []);
    } catch {
      // 레포 목록 조회 실패 시 무시
    }
  }

  function handleCloseDialog() {
    setIsDialogOpen(false);
    setSelectedRepo(null);
  }

  function handleSelectRepo(repo: GithubRepo) {
    const alreadyRegistered = registeredRepos.some(
      (r) => r.githubRepoId === repo.id
    );
    if (alreadyRegistered) return;
    setSelectedRepo(repo);
  }

  async function handleConnect() {
    if (!selectedRepo || installationId == null) return;
    setIsConnecting(true);

    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubRepoId: selectedRepo.id,
          fullName: selectedRepo.full_name,
          installationId,
          defaultBranch: selectedRepo.default_branch,
          cloneUrl: selectedRepo.clone_url,
        }),
      });

      if (!res.ok) {
        setIsConnecting(false);
        return;
      }

      const data = await res.json();
      const newRepo = data.repo ?? data;

      // 대시보드에 새 레포 카드 추가
      setRegisteredRepos((prev) => [
        ...prev,
        {
          id: newRepo.id,
          githubRepoId: newRepo.githubRepoId,
          fullName: newRepo.fullName,
          defaultBranch: newRepo.defaultBranch,
          installationId: newRepo.installationId,
          cloneUrl: newRepo.cloneUrl ?? null,
        },
      ]);

      handleCloseDialog();
    } catch {
      // 연결 실패 시 무시
    } finally {
      setIsConnecting(false);
    }
  }

  const registeredFullNames = new Set(registeredRepos.map((r) => r.fullName));

  return (
    <main className="min-h-screen bg-zinc-950 p-8">
      <div className="mx-auto max-w-4xl">
        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white">Dashboard</h1>
            <p className="mt-2 text-lg text-zinc-400">
              FeatureMap 대시보드에 오신 것을 환영합니다
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[44px] rounded-lg bg-zinc-800 px-6 py-2 font-semibold text-white hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
          >
            로그아웃
          </button>
        </div>

        {/* 레포 섹션 */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-white">연결된 레포지토리</h2>
          <button
            type="button"
            onClick={handleOpenDialog}
            className="min-h-[44px] rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
          >
            + 레포 연결
          </button>
        </div>

        {/* 등록된 레포 카드 목록 */}
        {registeredRepos.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-zinc-400">
              연결된 레포지토리가 없습니다. &quot;+ 레포 연결&quot; 버튼을 눌러 레포를 추가하세요.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {registeredRepos.map((repo) => (
              <div
                key={repo.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
              >
                <p className="font-mono font-semibold text-white">
                  {repo.fullName}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  브랜치: {repo.defaultBranch}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 레포 선택 다이얼로그 */}
      {isDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseDialog();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="레포 선택"
            data-testid="repo-select-sheet"
            className="mx-4 w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">레포 연결</h2>
              <button
                type="button"
                onClick={handleCloseDialog}
                className="min-h-[44px] min-w-[44px] rounded-lg text-zinc-400 hover:text-white focus:outline-none"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            {/* GitHub 레포 목록 */}
            <div className="mb-6 max-h-64 overflow-y-auto space-y-2">
              {githubRepos.length === 0 ? (
                <p className="text-center text-zinc-400">
                  접근 가능한 레포지토리가 없습니다.
                </p>
              ) : (
                githubRepos.map((repo) => {
                  const alreadyRegistered = registeredFullNames.has(repo.full_name);
                  const isSelected = selectedRepo?.id === repo.id;

                  return (
                    <div
                      key={repo.id}
                      data-testid="repo-item"
                      aria-disabled={alreadyRegistered ? "true" : undefined}
                      onClick={() => handleSelectRepo(repo)}
                      className={[
                        "flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition-colors",
                        alreadyRegistered
                          ? "cursor-not-allowed border-zinc-700 bg-zinc-800/50 opacity-60"
                          : isSelected
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-zinc-700 bg-zinc-800 hover:border-zinc-500",
                      ].join(" ")}
                    >
                      <span className="font-mono text-sm text-white">
                        {repo.full_name}
                      </span>
                      <div className="flex items-center gap-2">
                        {alreadyRegistered && (
                          <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                            이미 연결됨
                          </span>
                        )}
                        {isSelected && !alreadyRegistered && (
                          <span className="text-emerald-400">✓</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 액션 버튼 */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCloseDialog}
                className="min-h-[44px] flex-1 rounded-lg border border-zinc-700 bg-transparent px-4 py-2 font-semibold text-zinc-300 hover:bg-zinc-800 focus:outline-none"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={!selectedRepo || isConnecting || installationId == null}
                className="min-h-[44px] flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                {isConnecting ? "연결 중..." : "연결"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
