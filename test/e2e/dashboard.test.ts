/**
 * 대시보드 E2E 테스트 (DLD-619)
 *
 * 대시보드 페이지(/dashboard)의 핵심 시나리오를 검증하는 E2E 테스트입니다.
 * - 시나리오 1: 로그인 후 대시보드에 연결된 레포 카드 목록 표시
 * - 시나리오 2: 각 카드에 레포명, 언어, feature 수, 분석 상태, 마지막 분석 시각 표시
 * - 시나리오 3: 레포 카드 탭 → 레포 상세(개요) 이동
 * - 시나리오 4: 레포 없을 때 빈 상태 + CTA 표시
 *
 * 모든 테스트는 DLD-619 구현 완료 전까지 skip 상태로 유지됩니다.
 * skip 제거 시 바로 실행 가능한 구조로 작성되었습니다.
 *
 * 실행: npx playwright test test/e2e/dashboard.test.ts
 */

import { test, expect } from "@playwright/test";
import { createAuthCookies } from "../helpers/auth";

// ---------------------------------------------------------------------------
// 시나리오 1: 로그인 후 대시보드에 연결된 레포 카드 목록 표시
// ---------------------------------------------------------------------------

test.describe("대시보드: 연결된 레포 카드 목록 표시", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    // e2e-test-user-001은 test-org/sample-app 레포 1개를 보유 (seed.ts 참고)
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // TODO: Activate when DLD-619 is implemented
  test.skip("로그인한 사용자가 대시보드에 접근하면 연결된 레포 카드 목록이 표시된다", async ({
    page,
  }) => {
    // Arrange: e2e-test-user-001은 test-org/sample-app 레포 1개를 보유 (seed.ts 참고)

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Assert: 대시보드 헤더가 표시되어야 한다
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Assert: 연결된 레포지토리 섹션 헤더가 표시되어야 한다
    await expect(
      page.getByRole("heading", { name: "연결된 레포지토리" })
    ).toBeVisible();

    // Assert: 시드 데이터의 레포 카드(test-org/sample-app)가 표시되어야 한다
    await expect(page.getByText("test-org/sample-app")).toBeVisible();

    // Assert: 대시보드 URL을 유지해야 한다
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // TODO: Activate when DLD-619 is implemented
  test.skip("대시보드에 레포 카드가 표시될 때 레포명과 기본 브랜치 정보가 함께 표시된다", async ({
    page,
  }) => {
    // Arrange: test-org/sample-app은 defaultBranch: "main" (seed.ts 참고)

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Assert: 레포 카드에 fullName이 표시되어야 한다
    await expect(page.getByText("test-org/sample-app")).toBeVisible();

    // Assert: 레포 카드에 기본 브랜치(main)가 표시되어야 한다
    await expect(page.getByText(/main/)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 2: 각 카드에 레포명, 언어, feature 수, 분석 상태, 마지막 분석 시각 표시
// (언어, feature 수, 분석 상태, 마지막 분석 시각은 아직 미구현 UI)
// ---------------------------------------------------------------------------

test.describe("대시보드: 레포 카드 상세 정보 표시", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // TODO: Activate when DLD-619 is implemented
  // 언어 표시 UI 구현 후 활성화
  test.skip("레포 카드에 레포명과 주요 언어가 표시된다", async ({ page }) => {
    // Arrange: test-org/sample-app 레포의 언어 정보는 분석 후 노출 예정

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Assert: 레포명(test-org/sample-app)이 표시되어야 한다
    const repoCard = page.locator("[data-testid='repo-card']", {
      has: page.getByText("test-org/sample-app"),
    });
    await expect(repoCard).toBeVisible();

    // Assert: 언어 정보가 카드 내에 표시되어야 한다
    // (예: "TypeScript", "Python" 등 주요 언어명)
    await expect(
      repoCard.getByText(/TypeScript|JavaScript|Python|Java|Go|Rust/)
    ).toBeVisible();
  });

  // TODO: Activate when DLD-619 is implemented
  // feature 수 표시 UI 구현 후 활성화
  test.skip("레포 카드에 feature 수가 표시된다", async ({ page }) => {
    // Arrange: test-org/sample-app 레포의 feature 수는 분석 완료 후 집계 예정

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Assert: 레포 카드에 feature 수가 표시되어야 한다
    // (예: "3 features", "0 features" 등)
    const repoCard = page.locator("[data-testid='repo-card']", {
      has: page.getByText("test-org/sample-app"),
    });
    await expect(
      repoCard.getByText(/\d+\s*(feature|Feature|피처)/)
    ).toBeVisible();
  });

  // TODO: Activate when DLD-619 is implemented
  // 분석 상태 표시 UI 구현 후 활성화
  test.skip("레포 카드에 분석 상태(PENDING/IN_PROGRESS/COMPLETED/FAILED)가 표시된다", async ({
    page,
  }) => {
    // Arrange: e2e-test-pipeline-001의 status는 "PENDING" (seed.ts 참고)

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Assert: 레포 카드에 분석 상태 뱃지가 표시되어야 한다
    const repoCard = page.locator("[data-testid='repo-card']", {
      has: page.getByText("test-org/sample-app"),
    });
    await expect(
      repoCard.getByText(/PENDING|IN_PROGRESS|COMPLETED|FAILED|분석 중|분석 완료|대기 중|실패/)
    ).toBeVisible();
  });

  // TODO: Activate when DLD-619 is implemented
  // 마지막 분석 시각 표시 UI 구현 후 활성화
  test.skip("레포 카드에 마지막 분석 시각이 표시된다", async ({ page }) => {
    // Arrange: e2e-test-pipeline-001의 completedAt은 PENDING 상태이므로 null
    //          분석 완료 시각 또는 "아직 분석되지 않음" 등의 텍스트가 표시되어야 함

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Assert: 레포 카드에 마지막 분석 시각 또는 미분석 안내 텍스트가 표시되어야 한다
    const repoCard = page.locator("[data-testid='repo-card']", {
      has: page.getByText("test-org/sample-app"),
    });
    await expect(
      repoCard.getByText(/마지막 분석|Last analyzed|분석 전|미분석|아직 분석되지/)
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 3: 레포 카드 탭(클릭) → 레포 상세(개요) 이동
// (레포 상세 이동 router.push는 아직 미구현)
// ---------------------------------------------------------------------------

test.describe("대시보드: 레포 카드 클릭 → 레포 상세 이동", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // TODO: Activate when DLD-619 is implemented
  // 레포 상세 페이지(/repos/[id]/overview) 라우팅 구현 후 활성화
  test.skip("레포 카드를 클릭하면 해당 레포 상세(개요) 페이지로 이동한다", async ({
    page,
  }) => {
    // Arrange: test-org/sample-app의 레포 id는 "e2e-test-repo-001" (seed.ts 참고)

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Assert: 레포 카드가 표시될 때까지 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible();

    // Act: 레포 카드 클릭 (탭)
    await page.getByText("test-org/sample-app").click();

    // Assert: 레포 상세(개요) 페이지로 이동해야 한다
    // URL 패턴: /repos/e2e-test-repo-001/overview 또는 /repos/e2e-test-repo-001
    await expect(page).toHaveURL(/\/repos\/e2e-test-repo-001/);
  });

  // TODO: Activate when DLD-619 is implemented
  // 레포 상세 개요 페이지 구현 후 활성화
  test.skip("레포 상세 개요 페이지에 레포명과 개요 정보가 표시된다", async ({
    page,
  }) => {
    // Arrange: 레포 상세 페이지로 직접 이동
    // e2e-test-repo-001: test-org/sample-app (seed.ts 참고)

    // Act: 레포 상세 개요 페이지로 직접 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Assert: 레포명이 표시되어야 한다
    await expect(page.getByText("test-org/sample-app")).toBeVisible();

    // Assert: 개요 섹션이 표시되어야 한다
    await expect(
      page.getByRole("heading", { name: /개요|Overview/ })
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 4: 레포 없을 때 빈 상태 + CTA 표시
// ---------------------------------------------------------------------------

test.describe("대시보드: 레포 없을 때 빈 상태 + CTA 표시", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 레포가 없는 유저(e2e-test-user-003)의 인증 쿠키 설정
    // e2e-test-user-003은 레포 없이 시딩된 전용 유저 (seed.ts 참고)
    const cookies = createAuthCookies("e2e-test-user-003", baseUrl);
    await context.addCookies(cookies);
  });

  // TODO: Activate when DLD-619 is implemented
  // seed.ts에 e2e-test-user-003(레포 없는 유저) 추가 후 활성화
  test.skip("연결된 레포가 없는 사용자의 대시보드에 빈 상태 안내 문구가 표시된다", async ({
    page,
  }) => {
    // Arrange: e2e-test-user-003은 레포 없이 시딩된 유저
    //          seed.ts에 해당 유저 추가 필요 (레포 연결 없음)

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Assert: 빈 상태 안내 문구가 표시되어야 한다
    await expect(
      page.getByText(/연결된 레포지토리가 없습니다/)
    ).toBeVisible();
  });

  // TODO: Activate when DLD-619 is implemented
  // seed.ts에 e2e-test-user-003(레포 없는 유저) 추가 후 활성화
  test.skip("연결된 레포가 없는 사용자의 대시보드에 레포 연결 CTA 버튼이 표시된다", async ({
    page,
  }) => {
    // Arrange: e2e-test-user-003은 레포 없이 시딩된 유저

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Assert: "+ 레포 연결" CTA 버튼이 표시되어야 한다
    await expect(
      page.getByRole("button", { name: /\+ 레포 연결/ })
    ).toBeVisible();
  });

  // TODO: Activate when DLD-619 is implemented
  // seed.ts에 e2e-test-user-003(레포 없는 유저) 추가 후 활성화
  test.skip("빈 상태에서 레포 연결 CTA 버튼을 클릭하면 레포 선택 다이얼로그가 열린다", async ({
    page,
  }) => {
    // Arrange: e2e-test-user-003은 레포 없이 시딩된 유저

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Assert: 빈 상태임을 확인
    await expect(
      page.getByText(/연결된 레포지토리가 없습니다/)
    ).toBeVisible();

    // Act: "+ 레포 연결" CTA 버튼 클릭
    await page.getByRole("button", { name: /\+ 레포 연결/ }).click();

    // Assert: 레포 선택 다이얼로그가 열려야 한다
    await expect(
      page.getByRole("dialog", { name: "레포 선택" }).or(
        page.locator("[data-testid='repo-select-sheet']")
      )
    ).toBeVisible();
  });
});
