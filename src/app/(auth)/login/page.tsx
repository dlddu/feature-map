"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage: string =
          data.error ?? "이메일 또는 비밀번호가 올바르지 않습니다";
        setError(errorMessage);
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("이메일 또는 비밀번호가 올바르지 않습니다");
    } finally {
      setIsLoading(false);
    }
  }

  function handleGitHubLogin() {
    window.location.href = "/api/auth/github/callback";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-8">
        <h1 className="mb-6 text-2xl font-bold text-white">로그인</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-zinc-300"
            >
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-zinc-300"
            >
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          {error && (
            <p className="mb-4 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-white hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <svg
                  className="mr-2 h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                처리 중...
              </>
            ) : (
              "로그인"
            )}
          </button>
        </form>

        <div className="my-6 flex items-center">
          <div className="flex-1 border-t border-zinc-700" />
          <span className="mx-4 text-sm text-zinc-500">또는</span>
          <div className="flex-1 border-t border-zinc-700" />
        </div>

        <button
          type="button"
          onClick={handleGitHubLogin}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 font-semibold text-white hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          GitHub
        </button>

        <p className="mt-6 text-center text-sm text-zinc-500">
          계정이 없으신가요?{" "}
          <Link
            href="/signup"
            className="text-emerald-400 hover:text-emerald-300"
          >
            회원가입
          </Link>
        </p>
      </div>
    </main>
  );
}
