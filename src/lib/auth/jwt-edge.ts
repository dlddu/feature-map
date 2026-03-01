/**
 * Edge Runtime 호환 JWT 유틸리티 (jose 기반)
 *
 * Next.js 미들웨어는 Edge Runtime에서 실행되므로
 * Node.js crypto 의존 라이브러리(jsonwebtoken)를 사용할 수 없습니다.
 * jose 라이브러리는 Web Crypto API를 사용하여 Edge Runtime에서 동작합니다.
 *
 * jsonwebtoken과 jose는 동일한 JWT 표준(HS256)을 사용하므로
 * 서로 생성한 토큰을 검증할 수 있습니다.
 */

import { jwtVerify, SignJWT } from "jose";

const JWT_SECRET =
  process.env.JWT_SECRET || "dev-secret-key-change-in-production";
const secret = new TextEncoder().encode(JWT_SECRET);

export interface EdgeTokenPayload {
  userId: string;
  type: "access" | "refresh";
  exp: number;
  iat: number;
}

export async function verifyTokenEdge(
  token: string
): Promise<EdgeTokenPayload> {
  if (!token) {
    throw new Error("Token is required");
  }
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as EdgeTokenPayload;
}

export async function generateAccessTokenEdge(
  userId: string
): Promise<string> {
  return new SignJWT({ userId, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
}
