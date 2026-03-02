import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { authenticateRequest, isAuthError } from "@/lib/auth/authenticate";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth.error;

  // 사용자 정보를 선택된 필드만 반환
  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      login: true,
      avatarUrl: true,
      installationId: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "사용자를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  return NextResponse.json({ user }, { status: 200 });
}
