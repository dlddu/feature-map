import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

function getUserIdFromRequest(request: NextRequest): string {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) {
    throw new Error("인증이 필요합니다");
  }
  const payload = verifyToken(accessToken);
  return payload.userId;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 인증
  let userId: string;
  try {
    userId = getUserIdFromRequest(request);
  } catch {
    return NextResponse.json(
      { error: "인증이 필요합니다" },
      { status: 401 }
    );
  }

  // 현재 유저의 LLM 설정 조회
  const configs = await prisma.lLMConfig.findMany({
    where: { userId },
  });

  // userId 미노출 처리
  const safeConfigs = configs.map(({ featureType, provider, model, temperature, maxTokens }) => ({
    featureType,
    provider,
    model,
    temperature,
    maxTokens,
  }));

  return NextResponse.json(
    { configs: safeConfigs },
    { status: 200 }
  );
}
