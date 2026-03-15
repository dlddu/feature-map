import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";

const ALLOWED_PROVIDERS = ["openai", "anthropic"] as const;

function getUserIdFromRequest(request: NextRequest): string {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) {
    throw new Error("인증이 필요합니다");
  }
  const payload = verifyToken(accessToken);
  return payload.userId;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ function: string }> }
): Promise<NextResponse> {
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

  // Body 파싱
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (!text || text.trim() === "") {
      return NextResponse.json(
        { error: "요청 본문이 비어 있습니다" },
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

  // 입력 검증
  const provider = typeof body.provider === "string" ? body.provider : undefined;
  const model = typeof body.model === "string" ? body.model : undefined;

  if (!provider || !ALLOWED_PROVIDERS.includes(provider as typeof ALLOWED_PROVIDERS[number])) {
    return NextResponse.json(
      { error: "provider는 'openai' 또는 'anthropic' 중 하나여야 합니다" },
      { status: 400 }
    );
  }

  if (model === undefined || model === "") {
    return NextResponse.json(
      { error: "model은 필수입니다" },
      { status: 400 }
    );
  }

  // URL 파라미터에서 featureType 추출
  const { function: featureType } = await params;

  // Upsert: 없으면 생성, 있으면 업데이트
  const config = await prisma.lLMConfig.upsert({
    where: {
      userId_featureType: {
        userId,
        featureType,
      },
    },
    update: {
      provider,
      model,
    },
    create: {
      userId,
      featureType,
      provider,
      model,
    },
  });

  return NextResponse.json(
    {
      featureType: config.featureType,
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    },
    { status: 200 }
  );
}
