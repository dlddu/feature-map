import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser, isAuthFailure } from "@/lib/auth/require-user";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser(request);
  if (isAuthFailure(auth)) return auth.response;

  const { user: authUser } = auth;

  // select를 사용하여 필요한 필드만 반환
  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
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
