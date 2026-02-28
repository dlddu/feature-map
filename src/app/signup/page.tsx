"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  buildRegisterPayload,
  parseRegisterError,
  type SignupFormState,
} from "./formState";

const INITIAL_STATE: SignupFormState = {
  status: "idle",
  emailError: null,
  passwordError: null,
  generalError: null,
};

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formState, setFormState] = useState<SignupFormState>(INITIAL_STATE);

  // 회원가입 성공 후 대시보드로 리다이렉트
  // useEffect를 통해 React 렌더링 사이클 완료 후 안정적으로 네비게이션 수행
  useEffect(() => {
    if (formState.status === "success") {
      router.push("/dashboard");
    }
  }, [formState.status, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setFormState({
      status: "loading",
      emailError: null,
      passwordError: null,
      generalError: null,
    });

    const payload = buildRegisterPayload(email, password);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFormState({
          status: "success",
          emailError: null,
          passwordError: null,
          generalError: null,
        });
        return;
      }

      const body = await res.json();
      const parsed = parseRegisterError({ status: res.status, body });

      setFormState({
        status: "error",
        emailError: parsed.emailError ?? null,
        passwordError: parsed.passwordError ?? null,
        generalError: parsed.generalError ?? null,
      });
    } catch {
      const parsed = parseRegisterError({ status: 0, body: {} });
      setFormState({
        status: "error",
        emailError: null,
        passwordError: null,
        generalError: parsed.generalError ?? "네트워크 오류가 발생했습니다.",
      });
    }
  };

  const isLoading = formState.status === "loading";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md p-8 bg-gray-800 rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-white mb-6">회원가입</h1>

        <form onSubmit={handleSubmit} noValidate>
          {/* 이메일 필드 */}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="user@example.com"
              autoComplete="email"
            />
            {formState.emailError && (
              <p className="mt-1 text-sm text-red-400" role="alert">
                {formState.emailError}
              </p>
            )}
          </div>

          {/* 비밀번호 필드 */}
          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="8자 이상, 대소문자+숫자 포함"
              autoComplete="new-password"
            />
            {formState.passwordError && (
              <p className="mt-1 text-sm text-red-400" role="alert">
                {formState.passwordError}
              </p>
            )}
          </div>

          {/* 일반 오류 메시지 */}
          {formState.generalError && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {formState.generalError}
            </p>
          )}

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span
                  role="status"
                  aria-label="로딩 중"
                  className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                />
                처리 중...
              </span>
            ) : (
              "회원가입"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
