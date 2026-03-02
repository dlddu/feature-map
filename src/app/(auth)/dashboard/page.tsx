"use client";

import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-24">
      <h1 className="text-4xl font-bold text-white">Dashboard</h1>
      <p className="mt-4 text-lg text-zinc-400">
        FeatureMap 대시보드에 오신 것을 환영합니다
      </p>
      <button
        type="button"
        onClick={handleLogout}
        className="mt-8 rounded-lg bg-zinc-800 px-6 py-2 font-semibold text-white hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-950"
      >
        로그아웃
      </button>
    </main>
  );
}
