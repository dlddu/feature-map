"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      console.log("[signup] Submitting registration:", { email });
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      console.log("[signup] Response status:", response.status);
      const data = await response.json();
      console.log("[signup] Response body:", JSON.stringify(data));

      if (!response.ok) {
        const errorMessage: string = data.error ?? "회원가입에 실패했습니다";
        console.log("[signup] Error message:", errorMessage, "Status:", response.status);

        if (response.status === 409) {
          setErrors({ email: errorMessage });
        } else if (
          errorMessage.includes("8자") ||
          errorMessage.includes("대문자") ||
          errorMessage.includes("소문자") ||
          errorMessage.includes("숫자")
        ) {
          setErrors({ password: errorMessage });
        } else if (
          errorMessage.includes("이메일") &&
          !errorMessage.includes("사용 중")
        ) {
          setErrors({ email: errorMessage });
        } else {
          setErrors({ general: errorMessage });
        }
        return;
      }

      console.log("[signup] Success, redirecting to /dashboard");
      router.push("/dashboard");
    } catch (err) {
      console.error("[signup] Network/fetch error:", err);
      setErrors({ general: "네트워크 오류가 발생했습니다" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8">
        <h1 className="mb-6 text-2xl font-bold text-white">회원가입</h1>

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
            {errors.email && (
              <p className="mt-1 text-sm text-red-400">{errors.email}</p>
            )}
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
              placeholder="8자 이상, 대소문자+숫자 포함"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-400">{errors.password}</p>
            )}
          </div>

          {errors.general && (
            <p className="mb-4 text-sm text-red-400">{errors.general}</p>
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
              "회원가입"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
