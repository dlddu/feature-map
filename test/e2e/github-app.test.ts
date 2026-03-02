/**
 * GitHub App 연결 및 레포 등록 E2E 테스트 (DLD-615)
 *
 * GitHub App 설치 상태 확인, 레포 연결 플로우, 접근 가능한 레포 목록 표시를
 * 검증하는 E2E 테스트입니다.
 * - 설정 > GitHub 탭에서 App 설치 완료/미완료 상태 표시
 * - 대시보드에서 "+" 버튼으로 레포 연결 후 카드로 표시
 * - GitHub App으로 접근 가능한 레포 목록 표시
 *
 * 실행: npx playwright test test/e2e/github-app.test.ts
 *
 * TODO: Activate when DLD-615 is implemented
 */

import { test, expect } from "@playwright/test";
import { createAuthCookies } from "../helpers/auth";

// ---------------------------------------------------------------------------
// 설정 > GitHub 탭: App 설치 상태 확인
// ---------------------------------------------------------------------------

// TODO: Activate when DLD-615 is implemented
test.describe.skip("설정 > GitHub 탭: GitHub App 설치 상태 표시", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // ---------------------------------------------------------------------------
  // Happy Path: GitHub App이 설치된 상태에서 설치 완료 상태 표시
  // ---------------------------------------------------------------------------

  test("GitHub App이 설치된 상태에서 설정 GitHub 탭에 설치 완료 상태가 표시된다", async ({
    page,
  }) => {
    // Arrange: 시드 데이터의 e2e-test-user-001은 installationId: 12345로
    //          이미 GitHub App이 설치된 상태 (seed.ts 참고)

    // Act: 설정 페이지의 GitHub 탭으로 이동
    await page.goto("/settings/github");

    // Assert: GitHub App 설치 완료 상태가 표시되어야 한다
    await expect(
      page.getByText(/연결됨|설치됨|Connected|Installed/)
    ).toBeVisible();

    // Assert: 연결된 조직명(test-org)이 표시되어야 한다
    await expect(page.getByText(/test-org/)).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Edge Case: GitHub App이 설치되지 않은 상태에서 설치 안내 표시
  // ---------------------------------------------------------------------------

  test("GitHub App이 설치되지 않은 신규 유저의 설정 GitHub 탭에 설치 안내가 표시된다", async ({
    page,
    context,
  }) => {
    // Arrange: GitHub App이 미설치된 유저로 인증 쿠키 재설정
    //          (installationId가 없는 신규 유저 시뮬레이션)
    await context.clearCookies();

    // GitHub App 설치 여부 API를 mock하여 미설치 상태 시뮬레이션
    await page.route("/api/github/installation", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ installed: false, installationId: null }),
      });
    });

    const freshUserCookies = createAuthCookies("e2e-test-user-002", baseUrl);
    await context.addCookies(freshUserCookies);

    // Act: 설정 페이지의 GitHub 탭으로 이동
    await page.goto("/settings/github");

    // Assert: GitHub App 미설치 안내 문구가 표시되어야 한다
    await expect(
      page.getByText(/GitHub App을 설치하세요|앱 설치|Install GitHub App/)
    ).toBeVisible();

    // Assert: GitHub App 설치 버튼이 표시되어야 한다
    await expect(
      page.getByRole("button", { name: /설치|Install/ })
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 대시보드: "+ 레포 연결" → 레포 선택 → 레포 카드 표시
// ---------------------------------------------------------------------------

// TODO: Activate when DLD-615 is implemented
test.describe.skip('대시보드: "+ 레포 연결" 플로우로 레포 카드 표시', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // ---------------------------------------------------------------------------
  // Happy Path: "+" 버튼 → 레포 선택 → 대시보드에 레포 카드 등록
  // ---------------------------------------------------------------------------

  test('대시보드에서 "+ 레포 연결" 버튼 클릭 후 레포를 선택하면 대시보드에 레포 카드가 표시된다', async ({
    page,
  }) => {
    // Arrange: Mock GitHub API가 레포 목록(test-org/sample-app, test-org/backend-service)을
    //          반환하도록 설정되어 있음 (mock-server port 3101 또는 MOCK_GITHUB_URL)
    //          - test-org/sample-app은 이미 등록된 상태 (seed.ts 참고)
    //          - test-org/backend-service는 미등록 상태 (신규 연결 시나리오)

    // 레포 등록 API를 mock하여 실제 DB 저장 없이 성공 응답 시뮬레이션
    await page.route("/api/repos", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "e2e-test-repo-002",
            githubRepoId: 100002,
            fullName: "test-org/backend-service",
            defaultBranch: "main",
            installationId: 12345,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Act: 대시보드 진입
    await page.goto("/dashboard");

    // Act: "+ 레포 연결" 버튼(AddRepoButton) 클릭
    await page.getByRole("button", { name: /\+ 레포 연결|\+ 레포|레포 연결/ }).click();

    // Assert: 레포 선택 바텀시트 또는 모달이 열려야 한다
    await expect(
      page.getByRole("dialog").or(page.locator("[data-testid='repo-select-sheet']"))
    ).toBeVisible();

    // Act: 미등록 레포(test-org/backend-service) 선택
    await page.getByText("test-org/backend-service").click();

    // Act: 연결 확인 버튼 클릭
    await page.getByRole("button", { name: /연결|확인|Connect/ }).click();

    // Assert: 대시보드에 새로 연결된 레포 카드가 표시되어야 한다
    await expect(page.getByText("test-org/backend-service")).toBeVisible();

    // Assert: 대시보드 페이지를 벗어나지 않아야 한다
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // ---------------------------------------------------------------------------
  // Edge Case: 이미 등록된 레포는 선택 목록에서 표시되지 않거나 비활성화됨
  // ---------------------------------------------------------------------------

  test('레포 선택 바텀시트에서 이미 등록된 레포(test-org/sample-app)는 재등록할 수 없다', async ({
    page,
  }) => {
    // Arrange: test-org/sample-app은 시드 데이터에 이미 등록된 상태 (seed.ts 참고)

    // Act: 대시보드 진입 후 "+ 레포 연결" 버튼 클릭
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /\+ 레포 연결|\+ 레포|레포 연결/ }).click();

    // Assert: 레포 선택 UI가 표시되어야 한다
    await expect(
      page.getByRole("dialog").or(page.locator("[data-testid='repo-select-sheet']"))
    ).toBeVisible();

    // Assert: 이미 등록된 레포(test-org/sample-app)는 비활성화되거나
    //         "이미 연결됨" 표시가 있어야 한다
    const alreadyConnectedRepo = page.getByText("test-org/sample-app");
    await expect(alreadyConnectedRepo).toBeVisible();

    const repoItem = page.locator("[data-testid='repo-item']", {
      has: page.getByText("test-org/sample-app"),
    });
    const isDisabled = await repoItem
      .getAttribute("aria-disabled")
      .catch(() => null);
    const hasConnectedLabel = await page
      .getByText(/이미 연결됨|Already connected/)
      .isVisible()
      .catch(() => false);

    expect(isDisabled === "true" || hasConnectedLabel).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 설정 > GitHub 탭 또는 레포 선택: 접근 가능한 레포 목록 표시
// ---------------------------------------------------------------------------

// TODO: Activate when DLD-615 is implemented
test.describe.skip("GitHub App 접근 가능한 레포 목록 표시", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // ---------------------------------------------------------------------------
  // Happy Path: Mock GitHub 서버가 반환하는 레포 2개가 목록에 표시됨
  // ---------------------------------------------------------------------------

  test("GitHub App으로 접근 가능한 레포 목록이 설정 GitHub 탭에 표시된다", async ({
    page,
  }) => {
    // Arrange: Mock GitHub 서버(port 3101)의 GET /api/v3/installation/repositories는
    //          test-org/sample-app과 test-org/backend-service 2개를 반환 (repos.json 참고)

    // Act: 설정 페이지의 GitHub 탭으로 이동
    await page.goto("/settings/github");

    // Assert: 접근 가능한 레포 목록 섹션이 표시되어야 한다
    await expect(
      page.getByText(/접근 가능한 레포|연결된 레포|Repositories/)
    ).toBeVisible();

    // Assert: test-org/sample-app 레포가 목록에 표시되어야 한다
    await expect(page.getByText("test-org/sample-app")).toBeVisible();

    // Assert: test-org/backend-service 레포가 목록에 표시되어야 한다
    await expect(page.getByText("test-org/backend-service")).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Edge Case: 레포 목록 API 호출 실패 시 에러 상태 표시
  // ---------------------------------------------------------------------------

  test("레포 목록 조회 중 오류가 발생하면 에러 메시지가 표시된다", async ({
    page,
  }) => {
    // Arrange: 레포 목록 API를 mock하여 오류 응답 시뮬레이션
    await page.route("/api/github/repos", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    // Act: 설정 페이지의 GitHub 탭으로 이동
    await page.goto("/settings/github");

    // Assert: 에러 메시지 또는 재시도 안내가 표시되어야 한다
    await expect(
      page.getByText(/오류|에러|실패|Error|Failed|다시 시도/)
    ).toBeVisible();
  });
});
