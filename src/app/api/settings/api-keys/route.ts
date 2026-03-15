import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto/aes";

const ALLOWED_PROVIDERS = ["openai", "anthropic"] as const;

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

  // DB에서 API 키 목록 조회
  const keys = await prisma.aPIKey.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  // 각 키 복호화 후 마스킹
  const apiKeys = keys.map((k) => {
    try {
      const decryptedKey = decrypt(k.encryptedKey);
      const maskedKey = maskApiKey(decryptedKey);
      return {
        id: k.id,
        provider: k.provider,
        maskedKey,
        label: k.label,
        isActive: k.isActive,
      };
    } catch {
      return {
        id: k.id,
        provider: k.provider,
        maskedKey: "sk-...****",
        label: k.label,
        isActive: k.isActive,
        error: "복호화 실패",
      };
    }
  });

  return NextResponse.json({ apiKeys });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
  const key = typeof body.key === "string" ? body.key : undefined;
  const label = body.label !== undefined
    ? (typeof body.label === "string" ? body.label : undefined)
    : undefined;

  if (!provider || !ALLOWED_PROVIDERS.includes(provider as typeof ALLOWED_PROVIDERS[number])) {
    return NextResponse.json(
      { error: "provider는 'openai' 또는 'anthropic' 중 하나여야 합니다" },
      { status: 400 }
    );
  }

  if (key === undefined || key === "") {
    return NextResponse.json(
      { error: "key는 필수입니다" },
      { status: 400 }
    );
  }

  // label이 명시적으로 빈 문자열인 경우 400
  if (body.label !== undefined && label === "") {
    return NextResponse.json(
      { error: "label은 빈 문자열일 수 없습니다" },
      { status: 400 }
    );
  }

  // 암호화 및 마스킹
  const encryptedKey = encrypt(key);
  const maskedKey = maskApiKey(key);

  // DB 저장
  const apiKey = await prisma.aPIKey.create({
    data: {
      userId,
      provider,
      encryptedKey,
      label: label ?? null,
    },
  });

  return NextResponse.json(
    {
      id: apiKey.id,
      provider: apiKey.provider,
      maskedKey,
      label: apiKey.label,
      isActive: apiKey.isActive,
    },
    { status: 201 }
  );
}
