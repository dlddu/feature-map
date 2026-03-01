/**
 * 로그인/로그아웃 E2E 테스트 (DLD-613)
 *
 * 이메일/비밀번호 로그인, GitHub OAuth 로그인, 로그아웃, JWT 갱신 플로우를
 * 검증하는 E2E 테스트입니다.
 * - 이메일/비밀번호 로그인 후 대시보드 리다이렉트
 * - 잘못된 자격증명 입력 시 에러 메시지 표시
 * - GitHub OAuth 로그인 플로우 (Mock OAuth 콜백)
 * - 로그아웃 후 로그인 화면 리다이렉트 및 쿠키 삭제
 * - JWT 만료 후 Refresh Token으로 자동 갱신
 *
 * 실행: npx playwright test test/e2e/login.test.ts
 *
 * ⚠️ 모든 테스트는 DLD-613 구현 완료 전까지 skip 상태로 유지합니다.
 *    - POST /api/auth/login 미구현
 *    - POST /api/auth/logout 미구현
 *    - GET /login 페이지 미구현
 *    skip 제거 후 바로 실행 가능한 구조로 작성되었습니다.
 */

import { test, expect } from "@playwright/test";
import {
  createAuthCookies,
  createExpiredAccessToken,
  createRefreshToken,
} from "../helpers/auth";

// ---------------------------------------------------------------------------
// 이메일/비밀번호 로그인
// ---------------------------------------------------------------------------

test.describe("로그인: 이메일/비밀번호 기반 로그인 플로우", () => {
  // ---------------------------------------------------------------------------
  // Happy Path: 유효한 자격증명으로 로그인 후 대시보드 리다이렉트
  // ---------------------------------------------------------------------------

  test("유효한 이메일과 비밀번호로 로그인하면 대시보드로 리다이렉트된다", async ({
    page,
  }) => {
    // Arrange: 시드 데이터에 등록된 이메일/비밀번호 유저 (seed.ts 참고)
    const email = "existing-user@example.com";
    const password = "Password123!";

    // Act: 로그인 페이지 진입 후 폼 입력
    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "로그인" }).click();

    // Assert: 대시보드로 리다이렉트되어야 한다
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // ---------------------------------------------------------------------------
  // Error Case: 잘못된 자격증명으로 로그인 시도
  // ---------------------------------------------------------------------------

  test("잘못된 이메일과 비밀번호로 로그인 시도하면 에러 메시지가 표시된다", async ({
    page,
  }) => {
    // Arrange: 존재하지 않는 계정 또는 틀린 비밀번호
    const email = "nonexistent@example.com";
    const wrongPassword = "WrongPassword!";

    // Act: 로그인 페이지 진입 후 잘못된 자격증명으로 폼 제출
    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(wrongPassword);
    await page.getByRole("button", { name: "로그인" }).click();

    // Assert: 에러 메시지가 표시되어야 한다
    await expect(
      page.getByText(/이메일 또는 비밀번호가 올바르지 않|잘못된 자격증명|로그인에 실패/)
    ).toBeVisible();

    // Assert: 로그인 페이지를 벗어나지 않아야 한다
    expect(page.url()).toContain("/login");
  });
});

// ---------------------------------------------------------------------------
// GitHub OAuth 로그인
// ---------------------------------------------------------------------------

test.describe("로그인: GitHub OAuth 로그인 플로우", () => {
  // ---------------------------------------------------------------------------
  // Happy Path: GitHub OAuth 콜백 mock으로 대시보드 리다이렉트
  // ---------------------------------------------------------------------------

  test("GitHub 로그인 버튼 클릭 후 OAuth 콜백이 완료되면 대시보드로 리다이렉트된다", async ({
    page,
  }) => {
    // Arrange: GitHub OAuth 콜백 엔드포인트를 mock하여
    //          실제 GitHub 인증 없이 인증 완료 상태를 시뮬레이션
    await page.route("/api/auth/github/callback*", async (route) => {
      // OAuth 콜백 성공 시 쿠키 설정 후 대시보드로 리다이렉트하는 응답 mock
      await route.fulfill({
        status: 302,
        headers: {
          Location: "/dashboard",
          "Set-Cookie": [
            `access_token=mock-access-token; Path=/; HttpOnly`,
            `refresh_token=mock-refresh-token; Path=/; HttpOnly`,
          ].join(", "),
        },
      });
    });

    // Act: 로그인 페이지 진입 후 GitHub 로그인 버튼 클릭
    await page.goto("/login");
    await page.getByRole("button", { name: /GitHub로 로그인|GitHub/ }).click();

    // Assert: 대시보드로 리다이렉트되어야 한다
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

// ---------------------------------------------------------------------------
// 로그아웃
// ---------------------------------------------------------------------------

test.describe("로그아웃: 인증 상태 해제 플로우", () => {
  // ---------------------------------------------------------------------------
  // Happy Path: 인증된 상태에서 로그아웃 후 로그인 페이지 리다이렉트 및 쿠키 삭제
  // ---------------------------------------------------------------------------

  test("인증된 상태에서 로그아웃하면 로그인 페이지로 리다이렉트되고 인증 쿠키가 삭제된다", async ({
    page,
    context,
  }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);

    // Act: 대시보드 진입 후 로그아웃 버튼 클릭
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /로그아웃|Logout/ }).click();

    // Assert: 로그인 페이지로 리다이렉트되어야 한다
    await expect(page).toHaveURL(/\/login/);

    // Assert: 인증 쿠키(access_token, refresh_token)가 삭제되어야 한다
    const allCookies = await context.cookies();
    const accessTokenCookie = allCookies.find(
      (c) => c.name === "access_token"
    );
    const refreshTokenCookie = allCookies.find(
      (c) => c.name === "refresh_token"
    );
    expect(accessTokenCookie).toBeUndefined();
    expect(refreshTokenCookie).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// JWT 갱신 플로우
// ---------------------------------------------------------------------------

test.describe("JWT 갱신: 만료된 Access Token과 유효한 Refresh Token으로 자동 갱신", () => {
  // ---------------------------------------------------------------------------
  // Happy Path: 만료된 Access Token + 유효한 Refresh Token으로 보호된 페이지 정상 접근
  // ---------------------------------------------------------------------------

  test("Access Token이 만료되었더라도 유효한 Refresh Token이 있으면 자동으로 갱신되어 대시보드에 접근할 수 있다", async ({
    page,
    context,
  }) => {
    // Arrange: 만료된 Access Token + 유효한 Refresh Token을 쿠키로 설정
    const userId = "e2e-test-user-001";
    const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
    const origin = new URL(baseUrl).origin;

    const expiredAccessToken = createExpiredAccessToken(userId);
    const validRefreshToken = createRefreshToken(userId);

    await context.addCookies([
      {
        name: "access_token",
        value: expiredAccessToken,
        url: origin,
        httpOnly: true,
        secure: false,
      },
      {
        name: "refresh_token",
        value: validRefreshToken,
        url: origin,
        httpOnly: true,
        secure: false,
      },
    ]);

    // Act: 보호된 경로(대시보드) 접근 시도
    await page.goto("/dashboard");

    // Assert: 로그인 페이지로 리다이렉트되지 않고 대시보드에 정상 접근
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Dashboard|대시보드/ })).toBeVisible();

    // Assert: 새로운 Access Token이 발급되어 쿠키가 갱신되어야 한다
    const allCookies = await context.cookies();
    const newAccessTokenCookie = allCookies.find(
      (c) => c.name === "access_token"
    );
    expect(newAccessTokenCookie).toBeDefined();
    // 갱신된 토큰은 만료된 토큰과 달라야 한다
    expect(newAccessTokenCookie?.value).not.toBe(expiredAccessToken);
  });
});
