import { NextRequest, NextResponse } from "next/server";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth/jwt";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // NODE_ENV 체크 — production에서는 404 반환 (최우선)
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "이 엔드포인트는 프로덕션 환경에서 사용할 수 없습니다" },
      { status: 404 }
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

  const userId = body.userId;

  // userId 검증
  if (typeof userId !== "string" || userId === "") {
    return NextResponse.json(
      { error: "userId는 필수 문자열 값입니다" },
      { status: 400 }
    );
  }

  // 토큰 발급
  const accessToken = generateAccessToken(userId);
  const refreshToken = generateRefreshToken(userId);

  // 응답 구성
  const response = NextResponse.json(
    { accessToken },
    { status: 200 }
  );

  // access_token, refresh_token 쿠키 모두 설정
  response.headers.append(
    "Set-Cookie",
    `access_token=${accessToken}; Path=/; SameSite=Lax`
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Path=/; SameSite=Lax`
  );

  return response;
}
