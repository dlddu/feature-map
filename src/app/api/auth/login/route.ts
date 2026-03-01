import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string | null {
  if (!email || email.trim() === "") {
    return "이메일은 필수입니다";
  }
  if (!EMAIL_REGEX.test(email)) {
    return "올바른 이메일 형식이 아닙니다";
  }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const email = typeof body.email === "string" ? body.email : undefined;
  const password = typeof body.password === "string" ? body.password : undefined;

  // 이메일 검증
  if (email === undefined) {
    return NextResponse.json(
      { error: "이메일은 필수입니다" },
      { status: 400 }
    );
  }
  const emailError = validateEmail(email);
  if (emailError) {
    return NextResponse.json({ error: emailError }, { status: 400 });
  }

  // 비밀번호 존재 여부 검증
  if (password === undefined || password === "") {
    return NextResponse.json(
      { error: "비밀번호는 필수입니다" },
      { status: 400 }
    );
  }

  // 유저 조회
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // 유저가 없거나 passwordHash가 없으면 401 (사용자 열거 방지)
  if (!user || user.passwordHash === null) {
    return NextResponse.json(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다" },
      { status: 401 }
    );
  }

  // 비밀번호 검증
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return NextResponse.json(
      { error: "이메일 또는 비밀번호가 올바르지 않습니다" },
      { status: 401 }
    );
  }

  // 토큰 발급
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // 응답 구성
  const response = NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
      },
    },
    { status: 200 }
  );

  // 쿠키 설정 (두 개의 HttpOnly 쿠키)
  response.headers.append(
    "Set-Cookie",
    `access_token=${accessToken}; HttpOnly; Path=/; SameSite=Lax`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Path=/; SameSite=Lax`
  );

  return response;
}
