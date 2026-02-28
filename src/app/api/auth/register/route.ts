import { NextResponse } from "next/server";
import prisma from "@/lib/db/client";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request): Promise<NextResponse> {
  // 1. 요청 바디 파싱
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "요청 바디를 파싱할 수 없습니다." },
      { status: 400 }
    );
  }

  const { email, password } = body as { email?: string; password?: string };

  // 2. 필수 필드 검사
  if (!email || typeof email !== "string") {
    return NextResponse.json(
      { error: "이메일은 필수 항목입니다." },
      { status: 400 }
    );
  }

  if (!password || typeof password !== "string") {
    return NextResponse.json(
      { error: "비밀번호는 필수 항목입니다." },
      { status: 400 }
    );
  }

  // 3. 이메일 형식 검사
  if (!EMAIL_REGEX.test(email.trim())) {
    return NextResponse.json(
      { error: "이메일 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  // 4. 비밀번호 정책 검증
  const validation = validatePassword(password);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.errors[0] },
      { status: 422 }
    );
  }

  try {
    // 5. 이메일 중복 검사
    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "이미 사용 중인 이메일입니다." },
        { status: 409 }
      );
    }

    // 6. 비밀번호 해싱
    const passwordHash = await hashPassword(password);

    // 7. 사용자 생성
    const user = await prisma.user.create({
      data: {
        email: email.trim(),
        passwordHash,
      },
    });

    // 8. JWT 토큰 발급
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // 9. 응답 반환 (accessToken JSON + refreshToken HttpOnly 쿠키)
    const response = NextResponse.json(
      { accessToken },
      { status: 201 }
    );

    response.headers.set(
      "set-cookie",
      `refresh_token=${refreshToken}; HttpOnly; Path=/; SameSite=Strict`
    );

    return response;
  } catch (error) {
    console.error("[POST /api/auth/register] Unexpected error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
