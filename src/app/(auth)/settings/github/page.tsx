"use client";

import { useEffect, useState } from "react";

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

interface UserInfo {
  id: string;
  name: string | null;
  email: string | null;
  login: string | null;
  installationId: number | null;
}

type RepoLoadState = "idle" | "loading" | "success" | "error";

export default function SettingsGithubPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [repoState, setRepoState] = useState<RepoLoadState>("idle");
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const data = await res.json();
        setUser(data.user);
      } catch {
        // 사용자 정보 조회 실패 시 무시
      }
    }
    fetchUser();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!user.installationId) return;

    async function fetchRepos() {
      setRepoState("loading");
      try {
        const res = await fetch("/api/github/repos");
        if (!res.ok) {
          setRepoState("error");
          return;
        }
        const data = await res.json();
        const repoList: GithubRepo[] = data.repositories ?? [];
        setRepos(repoList);
        if (repoList.length > 0) {
          setOrgName(repoList[0].owner.login);
        }
        setRepoState("success");
      } catch {
        setRepoState("error");
      }
    }
    fetchRepos();
  }, [user]);

  // 설치되지 않은 상태 (user가 없거나 installationId가 없는 경우)
  const isInstalled = user?.installationId != null;

  function handleInstall() {
    const appName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME ?? "featuremap";
    window.location.href = `https://github.com/apps/${appName}/installations/new`;
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-3xl font-bold text-white">설정 - GitHub</h1>

        {/* GitHub App 설치 상태 카드 */}
        <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">
            GitHub App 연결
          </h2>

          {isInstalled ? (
            <div>
              {/* 설치됨 상태 */}
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-medium text-emerald-400">
                  연결됨
                </span>
                {orgName && (
                  <span className="text-zinc-300">
                    조직: <span className="font-semibold text-white">{orgName}</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-400">
                GitHub App이 설치되어 있습니다. 아래에서 연결 가능한 저장소를 확인하세요.
              </p>
            </div>
          ) : (
            <div>
              {/* 미설치 상태 */}
              <p className="mb-4 text-zinc-300">
                GitHub App을 설치하세요. 레포지토리에 접근하려면 GitHub App 설치가 필요합니다.
              </p>
              <button
                type="button"
                onClick={handleInstall}
                className="min-h-[44px] rounded-lg bg-emerald-500 px-6 py-2 font-semibold text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
              >
                설치
              </button>
            </div>
          )}
        </div>

        {/* 레포 목록 (설치된 경우에만) */}
        {isInstalled && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">
              접근 가능한 레포
            </h2>

            {repoState === "loading" && (
              <p className="text-zinc-400">레포지토리 목록을 불러오는 중...</p>
            )}

            {repoState === "error" && (
              <div className="rounded-lg bg-red-500/10 p-4">
                <p className="text-red-400">
                  오류가 발생했습니다. 레포지토리 목록을 불러올 수 없습니다. 다시 시도해 주세요.
                </p>
              </div>
            )}

            {repoState === "success" && repos.length === 0 && (
              <p className="text-zinc-400">접근 가능한 레포지토리가 없습니다.</p>
            )}

            {repoState === "success" && repos.length > 0 && (
              <ul className="space-y-2">
                {repos.map((repo) => (
                  <li
                    key={repo.id}
                    className="flex items-center rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3"
                  >
                    <span className="font-mono text-sm text-white">
                      {repo.full_name}
                    </span>
                    {repo.private && (
                      <span className="ml-2 rounded-full bg-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                        Private
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
