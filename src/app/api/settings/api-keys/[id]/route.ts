import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { verifyToken } from "@/lib/auth/jwt";
import { encrypt, maskApiKey } from "@/lib/crypto/aes";

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
  { params }: { params: Promise<{ id: string }> }
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
  const key = typeof body.key === "string" ? body.key : undefined;

  if (key === undefined || key === "") {
    return NextResponse.json(
      { error: "key는 필수입니다" },
      { status: 400 }
    );
  }

  // URL 파라미터에서 id 추출
  const { id } = await params;

  // 기존 API 키 조회
  const existing = await prisma.aPIKey.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "API 키를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 소유권 확인
  if (existing.userId !== userId) {
    return NextResponse.json(
      { error: "권한이 없습니다" },
      { status: 403 }
    );
  }

  // 새 키 암호화 및 마스킹
  const encryptedKey = encrypt(key);
  const maskedKey = maskApiKey(key);

  // DB 업데이트
  const updated = await prisma.aPIKey.update({
    where: { id },
    data: { encryptedKey },
  });

  return NextResponse.json(
    {
      id: updated.id,
      provider: updated.provider,
      maskedKey,
      label: updated.label,
      isActive: updated.isActive,
    },
    { status: 200 }
  );
}
