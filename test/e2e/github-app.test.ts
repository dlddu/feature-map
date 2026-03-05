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
 */

import { test, expect, Page } from "@playwright/test";
import { createAuthCookies } from "../helpers/auth";

// ---------------------------------------------------------------------------
// 디버그 유틸: API 응답을 캡처하고 test attachment로 첨부
// ---------------------------------------------------------------------------

interface ApiLog {
  method: string;
  url: string;
  status: number;
  body: string;
}

interface ConsoleLog {
  type: string;
  text: string;
}

function setupApiCapture(page: Page) {
  const apiLogs: ApiLog[] = [];
  const consoleLogs: ConsoleLog[] = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/")) {
      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "(body read failed)";
      }
      apiLogs.push({
        method: response.request().method(),
        url,
        status: response.status(),
        body: body.substring(0, 1000),
      });
    }
  });

  page.on("console", (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on("requestfailed", (request) => {
    consoleLogs.push({
      type: "REQUEST_FAILED",
      text: `${request.method()} ${request.url()} → ${request.failure()?.errorText ?? "unknown"}`,
    });
  });

  return { apiLogs, consoleLogs };
}

async function attachDebugInfo(
  testInfo: ReturnType<typeof test.info>,
  label: string,
  apiLogs: ApiLog[],
  consoleLogs: ConsoleLog[],
  page: Page,
) {
  // API 호출 로그 첨부
  const apiSummary = apiLogs.length === 0
    ? "(no /api/ calls captured)"
    : apiLogs.map((l) =>
        `${l.method} ${l.status} ${l.url}\n  Body: ${l.body}`
      ).join("\n\n");

  await testInfo.attach(`${label} - API Logs`, {
    body: apiSummary,
    contentType: "text/plain",
  });

  // 콘솔 로그 (에러/경고만 필터)
  const errorLogs = consoleLogs.filter(
    (l) => l.type === "error" || l.type === "warning" || l.type === "REQUEST_FAILED"
  );
  if (errorLogs.length > 0) {
    await testInfo.attach(`${label} - Console Errors`, {
      body: errorLogs.map((l) => `[${l.type}] ${l.text}`).join("\n"),
      contentType: "text/plain",
    });
  }

  // 페이지 <main> 텍스트
  const mainText = await page.locator("main").textContent().catch(() => "(main not found)");
  await testInfo.attach(`${label} - Page Text`, {
    body: mainText ?? "(empty)",
    contentType: "text/plain",
  });

  // 스크린샷 (test attachment로 첨부 → HTML report에서 바로 확인 가능)
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${label} - Screenshot`, {
    body: screenshot,
    contentType: "image/png",
  });
}

// ---------------------------------------------------------------------------
// 설정 > GitHub 탭: App 설치 상태 확인
// ---------------------------------------------------------------------------

test.describe("설정 > GitHub 탭: GitHub App 설치 상태 표시", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // ---------------------------------------------------------------------------
  // 구간 1-A: /api/auth/me → installationId 확인 → "연결됨" 표시
  // 구간 1-B: /api/github/repos → orgName 추출 → "test-org" 표시
  // ---------------------------------------------------------------------------

  test("GitHub App이 설치된 상태에서 설정 GitHub 탭에 설치 완료 상태가 표시된다", async ({
    page,
  }) => {
    const { apiLogs, consoleLogs } = setupApiCapture(page);

    // Act: 설정 페이지의 GitHub 탭으로 이동
    await page.goto("/settings/github");

    // 구간 1-A: /api/auth/me 응답 대기
    await page.waitForTimeout(2000);

    const authMeLog = apiLogs.find((l) => l.url.includes("/api/auth/me"));
    await test.info().attach("구간1-A: /api/auth/me 응답", {
      body: authMeLog
        ? `${authMeLog.status} ${authMeLog.url}\nBody: ${authMeLog.body}`
        : "(호출 없음 - /api/auth/me가 호출되지 않았습니다)",
      contentType: "text/plain",
    });

    // 구간 1-A 검증: "연결됨" 텍스트
    const connectedVisible = await page
      .getByText(/연결됨|설치됨|Connected|Installed/)
      .isVisible()
      .catch(() => false);

    await test.info().attach("구간1-A: '연결됨' 표시 여부", {
      body: `isVisible: ${connectedVisible}\n\n현재 <main> 텍스트:\n${await page.locator("main").textContent().catch(() => "(main not found)")}`,
      contentType: "text/plain",
    });

    // 구간 1-B: /api/github/repos 응답 대기
    await page.waitForTimeout(2000);

    const reposLog = apiLogs.find((l) => l.url.includes("/api/github/repos"));
    await test.info().attach("구간1-B: /api/github/repos 응답", {
      body: reposLog
        ? `${reposLog.status} ${reposLog.url}\nBody: ${reposLog.body}`
        : "(호출 없음 - /api/github/repos가 호출되지 않았습니다. installationId가 null일 수 있음)",
      contentType: "text/plain",
    });

    // 전체 디버그 정보 첨부
    await attachDebugInfo(test.info(), "구간1-최종", apiLogs, consoleLogs, page);

    // Assert
    await expect(
      page.getByText(/연결됨|설치됨|Connected|Installed/)
    ).toBeVisible();

    await expect(page.getByText(/test-org/)).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Edge Case: GitHub App이 설치되지 않은 상태에서 설치 안내 표시
  // ---------------------------------------------------------------------------

  test("GitHub App이 설치되지 않은 신규 유저의 설정 GitHub 탭에 설치 안내가 표시된다", async ({
    page,
    context,
  }) => {
    await context.clearCookies();

    await page.route("/api/github/installation", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ installed: false, installationId: null }),
      });
    });

    const freshUserCookies = createAuthCookies("e2e-test-user-002", baseUrl);
    await context.addCookies(freshUserCookies);

    await page.goto("/settings/github");

    await expect(
      page.getByText(/GitHub App을 설치하세요|앱 설치|Install GitHub App/)
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: /설치|Install/ })
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 대시보드: "+ 레포 연결" → 레포 선택 → 레포 카드 표시
// ---------------------------------------------------------------------------

test.describe('대시보드: "+ 레포 연결" 플로우로 레포 카드 표시', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // ---------------------------------------------------------------------------
  // 구간 2-A: 대시보드 초기 로드 (API: /api/auth/me, /api/repos)
  // 구간 2-B: 다이얼로그 열기 + /api/github/repos 호출
  // 구간 2-C: 레포 선택 + 연결 완료
  // ---------------------------------------------------------------------------

  test('대시보드에서 "+ 레포 연결" 버튼 클릭 후 레포를 선택하면 대시보드에 레포 카드가 표시된다', async ({
    page,
  }) => {
    const { apiLogs, consoleLogs } = setupApiCapture(page);

    // POST /api/repos mock
    await page.route("/api/repos", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            repo: {
              id: "e2e-test-repo-002",
              githubRepoId: 100002,
              fullName: "test-org/backend-service",
              defaultBranch: "main",
              installationId: 12345,
              cloneUrl: null,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // 구간 2-A: 대시보드 초기 로드
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    await test.info().attach("구간2-A: 대시보드 초기 API 호출", {
      body: apiLogs.map((l) => `${l.method} ${l.status} ${l.url}\n  Body: ${l.body}`).join("\n\n") || "(no API calls)",
      contentType: "text/plain",
    });

    const initScreenshot = await page.screenshot({ fullPage: true });
    await test.info().attach("구간2-A: 대시보드 초기 화면", {
      body: initScreenshot,
      contentType: "image/png",
    });

    // 구간 2-B: 다이얼로그 열기
    await page.getByRole("button", { name: /\+ 레포 연결|\+ 레포|레포 연결/ }).click();

    await expect(
      page.getByRole("dialog").or(page.locator("[data-testid='repo-select-sheet']"))
    ).toBeVisible();

    // /api/github/repos 응답 대기
    await page.waitForTimeout(2000);

    const ghReposLog = apiLogs.find((l) => l.url.includes("/api/github/repos"));
    await test.info().attach("구간2-B: /api/github/repos 응답", {
      body: ghReposLog
        ? `${ghReposLog.status} ${ghReposLog.url}\nBody: ${ghReposLog.body}`
        : "(호출 없음 - 다이얼로그에서 /api/github/repos가 호출되지 않았습니다)",
      contentType: "text/plain",
    });

    const dialogText = await page.locator("[role='dialog']").textContent().catch(() => "(dialog not found)");
    await test.info().attach("구간2-B: 다이얼로그 텍스트", {
      body: dialogText ?? "(empty)",
      contentType: "text/plain",
    });

    const dialogScreenshot = await page.screenshot({ fullPage: true });
    await test.info().attach("구간2-B: 다이얼로그 스크린샷", {
      body: dialogScreenshot,
      contentType: "image/png",
    });

    // 구간 2-C: 레포 선택 + 연결
    await page.getByText("test-org/backend-service").click();
    await page.getByRole("button", { name: /연결|확인|Connect/ }).click();

    await expect(page.getByText("test-org/backend-service")).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard/);

    // 최종 디버그
    await attachDebugInfo(test.info(), "구간2-C-최종", apiLogs, consoleLogs, page);
  });

  // ---------------------------------------------------------------------------
  // Edge Case: 이미 등록된 레포는 선택 목록에서 표시되지 않거나 비활성화됨
  // ---------------------------------------------------------------------------

  test('레포 선택 바텀시트에서 이미 등록된 레포(test-org/sample-app)는 재등록할 수 없다', async ({
    page,
  }) => {
    const { apiLogs, consoleLogs } = setupApiCapture(page);

    await page.goto("/dashboard");
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: /\+ 레포 연결|\+ 레포|레포 연결/ }).click();

    await expect(
      page.getByRole("dialog").or(page.locator("[data-testid='repo-select-sheet']"))
    ).toBeVisible();

    // /api/github/repos 응답 대기
    await page.waitForTimeout(2000);

    // 디버그: 다이얼로그 상태 첨부
    const dialogText = await page.locator("[role='dialog']").textContent().catch(() => "(dialog not found)");
    await test.info().attach("구간2-Edge: 다이얼로그 텍스트", {
      body: dialogText ?? "(empty)",
      contentType: "text/plain",
    });

    await attachDebugInfo(test.info(), "구간2-Edge", apiLogs, consoleLogs, page);

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

    await test.info().attach("구간2-Edge: 비활성화 상태", {
      body: `aria-disabled: ${isDisabled}\nhasConnectedLabel: ${hasConnectedLabel}`,
      contentType: "text/plain",
    });

    expect(isDisabled === "true" || hasConnectedLabel).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 설정 > GitHub 탭 또는 레포 선택: 접근 가능한 레포 목록 표시
// ---------------------------------------------------------------------------

test.describe("GitHub App 접근 가능한 레포 목록 표시", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // ---------------------------------------------------------------------------
  // 구간 3-A: /api/auth/me → installationId 확인
  // 구간 3-B: /api/github/repos → 레포 2개(sample-app, backend-service) 표시
  // ---------------------------------------------------------------------------

  test("GitHub App으로 접근 가능한 레포 목록이 설정 GitHub 탭에 표시된다", async ({
    page,
  }) => {
    const { apiLogs, consoleLogs } = setupApiCapture(page);

    await page.goto("/settings/github");

    // 구간 3-A: /api/auth/me
    await page.waitForTimeout(2000);

    const authMeLog = apiLogs.find((l) => l.url.includes("/api/auth/me"));
    await test.info().attach("구간3-A: /api/auth/me 응답", {
      body: authMeLog
        ? `${authMeLog.status} ${authMeLog.url}\nBody: ${authMeLog.body}`
        : "(호출 없음)",
      contentType: "text/plain",
    });

    // 구간 3-B: /api/github/repos
    await page.waitForTimeout(2000);

    const reposLog = apiLogs.find((l) => l.url.includes("/api/github/repos"));
    await test.info().attach("구간3-B: /api/github/repos 응답", {
      body: reposLog
        ? `${reposLog.status} ${reposLog.url}\nBody: ${reposLog.body}`
        : "(호출 없음 - installationId가 null이거나 /api/auth/me 실패)",
      contentType: "text/plain",
    });

    // 전체 디버그 첨부
    await attachDebugInfo(test.info(), "구간3-최종", apiLogs, consoleLogs, page);

    await expect(
      page.getByText(/접근 가능한 레포|연결된 레포|Repositories/)
    ).toBeVisible();

    await expect(page.getByText("test-org/sample-app")).toBeVisible();
    await expect(page.getByText("test-org/backend-service")).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Edge Case: 레포 목록 API 호출 실패 시 에러 상태 표시
  // ---------------------------------------------------------------------------

  test("레포 목록 조회 중 오류가 발생하면 에러 메시지가 표시된다", async ({
    page,
  }) => {
    await page.route("/api/github/repos", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    await page.goto("/settings/github");

    await expect(
      page.getByText(/오류|에러|실패|Error|Failed|다시 시도/)
    ).toBeVisible();
  });
});
