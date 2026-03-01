import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/client";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_SALT_ROUNDS = 10;

function validateEmail(email: string): string | null {
  if (!email || email.trim() === "") {
    return "이메일은 필수입니다";
  }
  if (!EMAIL_REGEX.test(email)) {
    return "올바른 이메일 형식이 아닙니다";
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (!password || password.trim() === "") {
    return "비밀번호는 필수입니다";
  }
  if (password.length < 8) {
    return "비밀번호는 8자 이상이어야 합니다";
  }
  if (!/[A-Z]/.test(password)) {
    return "비밀번호에 대문자가 포함되어야 합니다";
  }
  if (!/[a-z]/.test(password)) {
    return "비밀번호에 소문자가 포함되어야 합니다";
  }
  if (!/[0-9]/.test(password)) {
    return "비밀번호에 숫자가 포함되어야 합니다";
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
  const name = typeof body.name === "string" ? body.name : undefined;

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

  // 비밀번호 검증
  if (password === undefined) {
    return NextResponse.json(
      { error: "비밀번호는 필수입니다" },
      { status: 400 }
    );
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  // 이메일 중복 확인
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });
  if (existingUser) {
    return NextResponse.json(
      { error: "이미 사용 중인 이메일입니다" },
      { status: 409 }
    );
  }

  // 비밀번호 해싱
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  // 유저 생성
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      ...(name !== undefined ? { name } : {}),
    },
  });

  // 토큰 발급
  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  // 응답 구성
  const response = NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      accessToken,
    },
    { status: 201 }
  );

  // refreshToken을 httpOnly 쿠키로 설정
  response.headers.set(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Path=/; SameSite=Lax`
  );

  return response;
}
