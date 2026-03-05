import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/require-user";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user, error } = await requireUser(request);
  if (error) return error;

  // 등록된 레포 목록 조회
  const repos = await prisma.repo.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ repos }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user, error } = await requireUser(request);
  if (error) return error;

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
      userId: user.id,
    },
  });

  return NextResponse.json({ repo }, { status: 201 });
}
