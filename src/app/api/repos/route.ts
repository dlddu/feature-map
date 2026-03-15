import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 쿠키에서 access_token 추출
  const token = request.cookies.get("access_token")?.value;

  if (!token || token === "") {
    return NextResponse.json(
      { error: "인증이 필요합니다" },
      { status: 401 }
    );
  }

  // 토큰 검증
  let userId: string;
  try {
    const payload = verifyToken(token);
    if (payload.type !== "access") {
      return NextResponse.json(
        { error: "유효하지 않은 토큰 타입입니다" },
        { status: 401 }
      );
    }
    userId = payload.userId;
  } catch {
    return NextResponse.json(
      { error: "유효하지 않은 토큰입니다" },
      { status: 401 }
    );
  }

  // DB에서 사용자 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return NextResponse.json(
      { error: "사용자를 찾을 수 없습니다" },
      { status: 401 }
    );
  }

  // 등록된 레포 목록 + 파이프라인 + features 함께 조회
  const repos = await prisma.repo.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      pipelineRuns: {
        include: { features: true },
        orderBy: { startedAt: "desc" },
      },
    },
  });

  // 집계 필드 추가
  const enrichedRepos = repos.map((repo) => {
    const latestPipeline = repo.pipelineRuns[0] ?? null;
    const featureCount = repo.pipelineRuns.reduce(
      (sum, run) => sum + run.features.length,
      0
    );
    return {
      id: repo.id,
      githubRepoId: repo.githubRepoId,
      fullName: repo.fullName,
      defaultBranch: repo.defaultBranch,
      installationId: repo.installationId,
      userId: repo.userId,
      cloneUrl: repo.cloneUrl,
      createdAt: repo.createdAt,
      updatedAt: repo.updatedAt,
      latestPipelineStatus: latestPipeline?.status ?? null,
      featureCount,
      lastAnalyzedAt: latestPipeline?.completedAt ?? null,
    };
  });

  return NextResponse.json({ repos: enrichedRepos }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 쿠키에서 access_token 추출
  const token = request.cookies.get("access_token")?.value;

  if (!token || token === "") {
    return NextResponse.json(
      { error: "인증이 필요합니다" },
      { status: 401 }
    );
  }

  // 토큰 검증
  let userId: string;
  try {
    const payload = verifyToken(token);
    if (payload.type !== "access") {
      return NextResponse.json(
        { error: "유효하지 않은 토큰 타입입니다" },
        { status: 401 }
      );
    }
    userId = payload.userId;
  } catch {
    return NextResponse.json(
      { error: "유효하지 않은 토큰입니다" },
      { status: 401 }
    );
  }

  // DB에서 사용자 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return NextResponse.json(
      { error: "사용자를 찾을 수 없습니다" },
      { status: 401 }
    );
  }

  // Body 파싱
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (!text || text.trim() === "") {
      return NextResponse.json(
        { error: "필수 필드가 누락되었습니다" },
        { status: 400 }
      );
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "올바른 JSON 형식이 아닙니다" },
      { status: 400 }
    );
  }

  const githubRepoId = body.githubRepoId;
  const fullName = body.fullName;
  const installationId = body.installationId;
  const defaultBranch = body.defaultBranch;
  const cloneUrl = body.cloneUrl;

  // 필수 필드 검증
  if (typeof githubRepoId !== "number") {
    return NextResponse.json(
      { error: "필수 필드가 누락되었습니다" },
      { status: 400 }
    );
  }

  if (typeof fullName !== "string" || fullName === "") {
    return NextResponse.json(
      { error: "필수 필드가 누락되었습니다" },
      { status: 400 }
    );
  }

  if (typeof installationId !== "number") {
    return NextResponse.json(
      { error: "필수 필드가 누락되었습니다" },
      { status: 400 }
    );
  }

  // 중복 확인
  const existingRepo = await prisma.repo.findUnique({
    where: { githubRepoId },
  });

  if (existingRepo) {
    return NextResponse.json(
      { error: "이미 등록된 레포입니다" },
      { status: 409 }
    );
  }

  // 레포 생성
  const repo = await prisma.repo.create({
    data: {
      githubRepoId,
      fullName,
      defaultBranch: typeof defaultBranch === "string" ? defaultBranch : "main",
      cloneUrl: typeof cloneUrl === "string" ? cloneUrl : undefined,
      installationId,
      userId,
    },
  });

  return NextResponse.json({ repo }, { status: 201 });
}
