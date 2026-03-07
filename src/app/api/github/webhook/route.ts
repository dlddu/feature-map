import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/client";

function verifyWebhookSignature(payload: string, signature: string): boolean {
  const hmac = createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!);
  hmac.update(payload);
  const expected = `sha256=${hmac.digest("hex")}`;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const event = request.headers.get("x-github-event");

  // event 헤더가 없거나 installation 이벤트가 아니면 무시
  if (!event || event !== "installation") {
    return NextResponse.json({ ok: true, message: "Event ignored" }, { status: 200 });
  }

  // 서명 검증
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // body를 text로 읽기
  const payload = await request.text();

  // 서명 검증 수행
  const isValid = verifyWebhookSignature(payload, signature);
  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // body 파싱
  if (!payload || payload.trim() === "") {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(payload);
  } catch {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  const action = body.action as string;
  const installation = body.installation as {
    id: number;
    account: { id: number; login: string; type: string };
  } | undefined;

  if (!installation) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const githubId = Number(installation.account.id);

  if (action === "created") {
    // githubId로 사용자 조회
    const user = await prisma.user.findFirst({
      where: { githubId },
    });

    if (!user) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // installationId 저장
    await prisma.user.update({
      where: { id: user.id },
      data: { installationId: installation.id },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (action === "deleted") {
    // githubId로 사용자 조회
    const user = await prisma.user.findFirst({
      where: { githubId },
    });

    if (!user) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // 관련 Repo 삭제
    await prisma.repo.deleteMany({
      where: { userId: user.id },
    });

    // installationId를 null로 업데이트
    await prisma.user.update({
      where: { id: user.id },
      data: { installationId: null },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // 알 수 없는 action은 무시
  return NextResponse.json({ ok: true }, { status: 200 });
}
