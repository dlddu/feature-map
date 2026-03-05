import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user, error } = await requireUser(request);
  if (error) return error;

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      login: user.login,
      avatarUrl: user.avatarUrl,
      installationId: user.installationId,
      createdAt: user.createdAt,
    },
  }, { status: 200 });
}
