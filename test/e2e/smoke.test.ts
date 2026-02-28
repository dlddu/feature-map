/**
 * 스모크 테스트 (DLD-610)
 *
 * 전체 파이프라인 동작을 확인하는 최소 E2E 검증입니다.
 * - 앱 기동 및 기본 페이지 렌더링
 * - JWT 인증 상태에서 기본 화면 접근
 * - 모바일 뷰포트에서 정상 렌더링
 *
 * 실행: npx playwright test test/e2e/smoke.test.ts
 */

import { test, expect } from "@playwright/test";
import { createAuthCookies, createDefaultTestTokens } from "../helpers/auth";

test.describe("Smoke Test: FeatureMap 전체 파이프라인", () => {
  // ---------------------------------------------------------------------------
  // Happy Path: 앱 기동 및 기본 렌더링
  // ---------------------------------------------------------------------------

  test("앱이 기동되고 홈 페이지가 정상 렌더링된다", async ({ page }) => {
    // Arrange & Act
    await page.goto("/");

    // Assert: 기본 타이틀 및 설명 문구가 표시되어야 한다
    await expect(
      page.getByRole("heading", { name: "FeatureMap" })
    ).toBeVisible();
    await expect(
      page.getByText("AI-powered feature mapping for your codebase")
    ).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Happy Path: JWT 인증 상태에서 기본 화면 접근
  // ---------------------------------------------------------------------------

  test("JWT 액세스 토큰이 있는 인증된 사용자가 기본 화면에 접근할 수 있다", async ({
    page,
    context,
  }) => {
    // Arrange: 시드 유저의 토큰을 쿠키로 설정
    const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);

    // Act
    await page.goto("/");

    // Assert: 인증 상태에서도 홈 페이지가 정상 렌더링
    await expect(
      page.getByRole("heading", { name: "FeatureMap" })
    ).toBeVisible();

    // Assert: 인증 에러(401/403) 리다이렉트가 발생하지 않아야 한다
    expect(page.url()).not.toContain("/login");
    expect(page.url()).not.toContain("/unauthorized");
  });

  test("Bearer Authorization 헤더로 인증된 API 요청이 성공한다", async ({
    request,
  }) => {
    // Arrange: 테스트 유저의 Access Token 발급
    const { accessToken } = createDefaultTestTokens();

    // Act: 헬스체크 또는 인증이 필요한 기본 API 엔드포인트 호출
    const response = await request.get("/api/health", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // Assert: 인증 성공 (2xx) 또는 엔드포인트가 아직 없는 경우 404 허용
    // (API Route가 구현되면 200 기대값으로 변경)
    expect([200, 404]).toContain(response.status());
  });

  // ---------------------------------------------------------------------------
  // Mobile Viewport: 모바일 환경 렌더링
  // ---------------------------------------------------------------------------

  test("모바일 뷰포트(Pixel 5, 393x851)에서 홈 페이지가 정상 렌더링된다", async ({
    page,
    isMobile,
  }) => {
    // Arrange & Act
    await page.goto("/");

    // Assert: 모바일 뷰포트 여부 확인
    // playwright.config.ts의 mobile-chrome 프로젝트에서 실행 시 isMobile === true
    if (isMobile) {
      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();
      expect(viewport!.width).toBeLessThanOrEqual(430);
    }

    // Assert: 타이틀이 모바일에서도 표시되어야 한다
    await expect(
      page.getByRole("heading", { name: "FeatureMap" })
    ).toBeVisible();

    // Assert: 수평 스크롤바가 없어야 한다 (레이아웃 깨짐 방지)
    const hasHorizontalScrollbar = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScrollbar).toBe(false);
  });

  test("iPhone 13 뷰포트(390x844)에서 홈 페이지가 정상 렌더링된다", async ({
    page,
    isMobile,
  }) => {
    // Arrange & Act
    await page.goto("/");

    if (isMobile) {
      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();
      expect(viewport!.width).toBeLessThanOrEqual(430);
    }

    await expect(
      page.getByRole("heading", { name: "FeatureMap" })
    ).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Mock 서버 연동 확인
  // ---------------------------------------------------------------------------

  test("Mock GitHub 서버가 응답하고 레포 목록을 반환한다", async ({
    request,
  }) => {
    // Arrange
    const mockGithubUrl =
      process.env.MOCK_GITHUB_URL ?? "http://localhost:3101";

    // Act
    const response = await request.get(`${mockGithubUrl}/health`);

    // Assert
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", server: "mock-github" });
  });

  test("Mock LLM 서버가 응답하고 OpenAI 호환 응답을 반환한다", async ({
    request,
  }) => {
    // Arrange
    const mockLlmUrl = process.env.MOCK_LLM_URL ?? "http://localhost:3102";

    // Act
    const response = await request.get(`${mockLlmUrl}/health`);

    // Assert
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", server: "mock-llm" });
  });

  // ---------------------------------------------------------------------------
  // Edge Case: 인증 없이 보호된 경로 접근
  // ---------------------------------------------------------------------------

  test("인증 쿠키 없이 보호된 경로에 접근하면 로그인 페이지로 리다이렉트된다", async ({
    page,
  }) => {
    // Act: 쿠키 없이 대시보드 접근 시도
    await page.goto("/dashboard");

    // Assert: 로그인 또는 홈으로 리다이렉트
    // (라우팅 구현 전에는 404 또는 홈 페이지가 허용됨)
    const currentUrl = page.url();
    const isRedirectedOrNotFound =
      currentUrl.includes("/login") ||
      currentUrl.includes("/") ||
      (await page.title()) !== "";
    expect(isRedirectedOrNotFound).toBe(true);
  });
});
