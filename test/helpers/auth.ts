/**
 * JWT 토큰 발급 헬퍼 (DLD-610)
 *
 * E2E 테스트에서 인증된 상태를 시뮬레이션하기 위해
 * 유효한 JWT Access/Refresh 토큰을 발급합니다.
 *
 * src/lib/auth/jwt.ts의 동일한 로직을 사용하므로
 * 애플리케이션이 검증하는 토큰과 100% 호환됩니다.
 *
 * 사용 예:
 *   import { createTestTokens, createAuthCookieHeader } from '../helpers/auth';
 *
 *   const { accessToken, refreshToken } = createTestTokens('e2e-test-user-001');
 *   const cookieHeader = createAuthCookieHeader('e2e-test-user-001');
 */

import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET ?? "dev-secret-key-change-in-production";

export interface TestTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/**
 * 테스트용 Access Token을 발급합니다 (15분 유효).
 */
export function createAccessToken(userId: string): string {
  return jwt.sign({ userId, type: "access" }, JWT_SECRET, {
    expiresIn: "15m",
  });
}

/**
 * 테스트용 Refresh Token을 발급합니다 (7일 유효).
 */
export function createRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: "refresh" }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

/**
 * 테스트용 Access/Refresh Token 쌍을 발급합니다.
 */
export function createTestTokens(userId: string): TestTokens {
  return {
    accessToken: createAccessToken(userId),
    refreshToken: createRefreshToken(userId),
    userId,
  };
}

/**
 * 기본 E2E 테스트 유저(e2e-test-user-001)의 토큰 쌍을 반환합니다.
 * seed.ts의 seedDatabase()가 생성한 유저 ID와 일치합니다.
 */
export function createDefaultTestTokens(): TestTokens {
  return createTestTokens("e2e-test-user-001");
}

/**
 * Playwright의 page.setExtraHTTPHeaders에 전달할
 * Authorization 헤더를 구성합니다.
 *
 * 사용 예:
 *   await page.setExtraHTTPHeaders(createAuthorizationHeader(userId));
 */
export function createAuthorizationHeader(
  userId: string
): Record<string, string> {
  const { accessToken } = createTestTokens(userId);
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Playwright의 context.addCookies에 전달할
 * 인증 쿠키 배열을 구성합니다.
 *
 * Next.js 앱이 쿠키 기반 인증을 사용할 경우 활용합니다.
 *
 * 사용 예:
 *   await context.addCookies(createAuthCookies(userId, 'http://localhost:3000'));
 */
export function createAuthCookies(
  userId: string,
  baseUrl: string
): Array<{
  name: string;
  value: string;
  url: string;
  httpOnly: boolean;
  secure: boolean;
}> {
  const { accessToken, refreshToken } = createTestTokens(userId);
  const url = new URL(baseUrl).origin;

  return [
    {
      name: "access_token",
      value: accessToken,
      url,
      httpOnly: true,
      secure: false,
    },
    {
      name: "refresh_token",
      value: refreshToken,
      url,
      httpOnly: true,
      secure: false,
    },
  ];
}

/**
 * 이미 만료된 Access Token을 생성합니다.
 * 토큰 갱신(refresh) 플로우 테스트에 사용합니다.
 */
export function createExpiredAccessToken(userId: string): string {
  return jwt.sign(
    {
      userId,
      type: "access",
      // iat와 exp를 과거로 설정
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) - 1,
    },
    JWT_SECRET
  );
}
