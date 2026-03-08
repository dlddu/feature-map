import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const token = request.cookies.get("access_token")?.value;

  if (!token || token === "") {
    return NextResponse.json(
      { error: "인증이 필요합니다" },
      { status: 401 }
    );
  }

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

  const { id } = await params;

  const repo = await prisma.repo.findUnique({
    where: { id },
  });

  if (!repo) {
    return NextResponse.json(
      { error: "레포를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  if (repo.userId !== userId) {
    return NextResponse.json(
      { error: "삭제 권한이 없습니다" },
      { status: 403 }
    );
  }

  await prisma.repo.delete({
    where: { id },
  });

  return NextResponse.json({ success: true }, { status: 200 });
}
