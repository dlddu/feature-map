/**
 * 레포 상세 개요 패널 및 파이프라인 실행 E2E 테스트 (DLD-621)
 *
 * 레포 상세 페이지(/repos/[id]/overview)의 핵심 시나리오를 검증하는 E2E 테스트입니다.
 * - 시나리오 1: 레포 상세 진입 시 개요 패널에서 파이프라인 단계(F1~F5) 상태 표시
 * - 시나리오 2: "전체 실행" → F1부터 순차 실행, SSE로 단계별 상태 실시간 업데이트
 * - 시나리오 3: 개별 "▶" → 해당 단계만 실행 (선행 미완료 시 경고)
 * - 시나리오 4: "중단" → 현재 실행 중인 단계 중단
 * - 시나리오 5: QuickStats 카드 탭 → 해당 섹션 탭 전환
 * - 시나리오 6: SectionTabs로 개요/계층/전략/Features 패널 전환
 *
 * 실행: npx playwright test test/e2e/repo-detail.test.ts
 */

import { test, expect } from "@playwright/test";
import { createAuthCookies } from "../helpers/auth";

// ---------------------------------------------------------------------------
// 시나리오 1: 레포 상세 진입 시 개요 패널 — 파이프라인 단계(F1~F5) 상태 표시
// ---------------------------------------------------------------------------

test.describe("레포 상세 개요 패널: 파이프라인 단계(F1~F5) 상태 표시", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    // e2e-test-user-001은 test-org/sample-app 레포(e2e-test-repo-001) 보유 (seed.ts 참고)
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // skip: PipelineCard(F1~F5 단계 표시) 컴포넌트 미구현 — 구현 후 활성화 필요 (DLD-621)
  test.skip("레포 상세 개요 패널 진입 시 F1~F5 파이프라인 단계 목록이 표시된다", async ({
    page,
  }) => {
    // Arrange: e2e-test-repo-001의 파이프라인 상태는 PENDING (seed.ts 참고)
    // PipelineCard는 F1(레이어 추출)~F5(인수 테스트 생성) 5단계를 표시

    // Act: 레포 상세 개요 페이지로 직접 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 로딩 완료 대기 (레포 데이터 fetch 완료 후 PipelineCard 렌더링)
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Assert: PipelineCard 컨테이너가 표시되어야 한다
    await expect(
      page
        .locator("[data-testid='pipeline-card']")
        .or(page.getByText(/파이프라인|Pipeline/))
    ).toBeVisible();

    // Assert: F1 단계가 표시되어야 한다 (레이어 추출)
    await expect(
      page
        .locator("[data-testid='pipeline-step-f1']")
        .or(page.getByText(/F1|레이어 추출|Layer Extraction/))
    ).toBeVisible();

    // Assert: F2 단계가 표시되어야 한다 (전략 분석)
    await expect(
      page
        .locator("[data-testid='pipeline-step-f2']")
        .or(page.getByText(/F2|전략 분석|Strategy Analysis/))
    ).toBeVisible();

    // Assert: F3 단계가 표시되어야 한다 (Feature 추출)
    await expect(
      page
        .locator("[data-testid='pipeline-step-f3']")
        .or(page.getByText(/F3|Feature 추출|Feature Extraction/))
    ).toBeVisible();

    // Assert: F4 단계가 표시되어야 한다 (Feature 분류)
    await expect(
      page
        .locator("[data-testid='pipeline-step-f4']")
        .or(page.getByText(/F4|Feature 분류|Feature Classification/))
    ).toBeVisible();

    // Assert: F5 단계가 표시되어야 한다 (인수 테스트 생성)
    await expect(
      page
        .locator("[data-testid='pipeline-step-f5']")
        .or(page.getByText(/F5|인수 테스트|Acceptance Test/))
    ).toBeVisible();

    // Assert: e2e-test-pipeline-001의 PENDING 상태가 각 단계에 반영되어야 한다
    // (예: 대기 중, PENDING, 회색 아이콘 등)
    await expect(
      page.getByText(/대기 중|PENDING/).first()
    ).toBeVisible();
  });

  // skip: PipelineCard 단계별 상태 뱃지 미구현 (DLD-621)
  test.skip("각 파이프라인 단계(F1~F5)에 현재 상태 뱃지가 표시된다", async ({
    page,
  }) => {
    // Arrange: e2e-test-pipeline-001의 status: PENDING (seed.ts 참고)
    // 모든 단계가 PENDING 상태임을 전제

    // Act: 레포 상세 개요 페이지로 직접 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 데이터 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Assert: F1 단계에 상태 뱃지가 표시되어야 한다
    // (PENDING: 대기 중 / RUNNING: 실행 중 / COMPLETED: 완료 / FAILED: 실패)
    const f1Step = page
      .locator("[data-testid='pipeline-step-f1']")
      .or(page.locator("[data-testid='pipeline-card']").getByText(/F1/).locator(".."));
    await expect(
      f1Step.getByText(/대기 중|PENDING|실행 중|RUNNING|완료|COMPLETED|실패|FAILED/)
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 2: "전체 실행" → F1부터 순차 실행, SSE로 단계별 상태 실시간 업데이트
// ---------------------------------------------------------------------------

test.describe('레포 상세 개요 패널: "전체 실행" → 순차 실행 및 SSE 상태 업데이트', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // skip: "전체 실행" 버튼 및 파이프라인 실행 API(/api/repos/[id]/pipeline) 미구현 (DLD-621)
  test.skip('"전체 실행" 버튼을 클릭하면 F1 단계부터 실행이 시작된다', async ({
    page,
  }) => {
    // Arrange: 파이프라인 실행 API를 mock하여 실행 시작 응답 시뮬레이션
    await page.route("/api/repos/e2e-test-repo-001/pipeline/run", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            pipelineRunId: "e2e-test-pipeline-002",
            status: "RUNNING",
            currentStep: "F1",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Act: 레포 상세 개요 페이지로 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Act: "전체 실행" 버튼 클릭
    await page
      .getByRole("button", { name: /전체 실행|전체 분석|Run All/ })
      .click();

    // Assert: F1 단계 상태가 "실행 중" 또는 RUNNING으로 변경되어야 한다
    await expect(
      page
        .locator("[data-testid='pipeline-step-f1']")
        .or(page.getByText(/F1/).locator(".."))
        .getByText(/실행 중|RUNNING|진행 중/)
    ).toBeVisible({ timeout: 10000 });

    // Assert: "중단" 버튼이 표시되어야 한다 (실행 중 상태)
    await expect(
      page.getByRole("button", { name: /중단|Stop|취소/ })
    ).toBeVisible();
  });

  // skip: SSE 엔드포인트(/api/repos/[id]/pipeline/stream) 미구현 (DLD-621)
  test.skip("SSE로 파이프라인 단계별 상태 변경이 실시간으로 반영된다", async ({
    page,
  }) => {
    // Arrange: 파이프라인 실행 API mock — RUNNING 상태 반환
    await page.route("/api/repos/e2e-test-repo-001/pipeline/run", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            pipelineRunId: "e2e-test-pipeline-002",
            status: "RUNNING",
            currentStep: "F1",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Arrange: SSE 스트림 mock — F1 완료 → F2 시작 이벤트 시뮬레이션
    // SSE는 DOM 기반 상태 변화(StatusBadge)로 검증
    // 실제 SSE 엔드포인트 구현 시 이 mock을 제거하고 서버 응답으로 대체
    await page.route("/api/repos/e2e-test-repo-001/pipeline/stream*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: [
          'data: {"step":"F1","status":"RUNNING"}\n\n',
          'data: {"step":"F1","status":"COMPLETED"}\n\n',
          'data: {"step":"F2","status":"RUNNING"}\n\n',
        ].join(""),
      });
    });

    // Act: 레포 상세 개요 페이지로 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Act: "전체 실행" 버튼 클릭
    await page
      .getByRole("button", { name: /전체 실행|전체 분석|Run All/ })
      .click();

    // Assert: F1 단계가 "완료" 상태로 업데이트되어야 한다 (SSE 이벤트 반영)
    await expect(
      page
        .locator("[data-testid='pipeline-step-f1']")
        .or(page.getByText(/F1/).locator(".."))
        .getByText(/완료|COMPLETED/)
    ).toBeVisible({ timeout: 15000 });

    // Assert: F2 단계가 "실행 중" 상태로 업데이트되어야 한다 (SSE 이벤트 반영)
    await expect(
      page
        .locator("[data-testid='pipeline-step-f2']")
        .or(page.getByText(/F2/).locator(".."))
        .getByText(/실행 중|RUNNING/)
    ).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// 시나리오 3: 개별 "▶" → 해당 단계만 실행 (선행 미완료 시 경고)
// ---------------------------------------------------------------------------

test.describe('레포 상세 개요 패널: 개별 "▶" 버튼으로 단계 실행', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // skip: 개별 단계 실행 버튼("▶") 미구현 (DLD-621)
  test.skip('F1 단계의 "▶" 버튼을 클릭하면 F1 단계만 실행된다', async ({
    page,
  }) => {
    // Arrange: 개별 단계 실행 API mock — F1 단계 실행 성공 응답
    await page.route("/api/repos/e2e-test-repo-001/pipeline/run", async (route) => {
      if (route.request().method() === "POST") {
        const body = await route.request().postDataJSON();
        if (body?.step === "F1") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              pipelineRunId: "e2e-test-pipeline-002",
              status: "RUNNING",
              currentStep: "F1",
            }),
          });
        } else {
          await route.continue();
        }
      } else {
        await route.continue();
      }
    });

    // Act: 레포 상세 개요 페이지로 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Act: F1 단계의 "▶" 실행 버튼 클릭
    const f1Step = page
      .locator("[data-testid='pipeline-step-f1']")
      .or(page.getByText(/F1/).locator(".."));
    await f1Step.getByRole("button", { name: /▶|실행|Run/ }).click();

    // Assert: F1 단계 상태가 "실행 중"으로 변경되어야 한다
    await expect(
      f1Step.getByText(/실행 중|RUNNING/)
    ).toBeVisible({ timeout: 10000 });

    // Assert: F2~F5 단계는 여전히 "대기 중" 상태여야 한다 (개별 실행이므로)
    const f2Step = page
      .locator("[data-testid='pipeline-step-f2']")
      .or(page.getByText(/F2/).locator(".."));
    await expect(
      f2Step.getByText(/대기 중|PENDING/)
    ).toBeVisible();
  });

  // skip: 선행 단계 미완료 시 경고 메시지 미구현 (DLD-621)
  test.skip("선행 단계(F1)가 완료되지 않은 상태에서 F2의 "▶" 버튼을 클릭하면 경고가 표시된다", async ({
    page,
  }) => {
    // Arrange: F1이 PENDING 상태일 때 F2 단계 실행 시도
    // 선행 단계 미완료 경고: 토스트, 인라인 메시지, 또는 다이얼로그 형태로 표시 예상

    // Act: 레포 상세 개요 페이지로 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Act: F2 단계의 "▶" 실행 버튼 클릭 (F1이 완료되지 않은 상태)
    const f2Step = page
      .locator("[data-testid='pipeline-step-f2']")
      .or(page.getByText(/F2/).locator(".."));
    await f2Step.getByRole("button", { name: /▶|실행|Run/ }).click();

    // Assert: 선행 단계 미완료 경고 메시지가 표시되어야 한다
    await expect(
      page.getByText(/선행 단계|이전 단계|F1.*완료|먼저 실행|순서대로/)
        .or(page.getByRole("alertdialog"))
        .or(page.locator("[data-testid='prerequisite-warning']"))
    ).toBeVisible({ timeout: 5000 });

    // Assert: F2 단계 상태가 변경되지 않아야 한다 (PENDING 유지)
    await expect(
      f2Step.getByText(/대기 중|PENDING/)
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 4: "중단" → 현재 실행 중인 단계 중단
// ---------------------------------------------------------------------------

test.describe('레포 상세 개요 패널: "중단" 버튼으로 파이프라인 실행 중단', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // skip: "중단" 버튼 및 파이프라인 중단 API 미구현 (DLD-621)
  test.skip('"중단" 버튼을 클릭하면 현재 실행 중인 파이프라인이 중단된다', async ({
    page,
  }) => {
    // Arrange: 파이프라인 실행 API mock — RUNNING 상태로 시작
    await page.route("/api/repos/e2e-test-repo-001/pipeline/run", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            pipelineRunId: "e2e-test-pipeline-002",
            status: "RUNNING",
            currentStep: "F1",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Arrange: 파이프라인 중단 API mock — 중단 성공 응답
    await page.route("/api/repos/e2e-test-repo-001/pipeline/stop", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            pipelineRunId: "e2e-test-pipeline-002",
            status: "FAILED",
            stoppedAt: new Date().toISOString(),
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Act: 레포 상세 개요 페이지로 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Act: "전체 실행" 버튼 클릭하여 파이프라인 시작
    await page
      .getByRole("button", { name: /전체 실행|전체 분석|Run All/ })
      .click();

    // Wait: 실행 중 상태 확인
    await expect(
      page.getByRole("button", { name: /중단|Stop|취소/ })
    ).toBeVisible({ timeout: 10000 });

    // Act: "중단" 버튼 클릭
    await page.getByRole("button", { name: /중단|Stop|취소/ }).click();

    // Assert: 파이프라인이 중단되었다는 상태 표시가 나타나야 한다
    // (예: "중단됨", "실패", "FAILED" 뱃지)
    await expect(
      page.getByText(/중단|중지|실패|FAILED|Stopped/)
    ).toBeVisible({ timeout: 10000 });

    // Assert: "중단" 버튼이 사라지고 "전체 실행" 버튼이 다시 표시되어야 한다
    await expect(
      page.getByRole("button", { name: /전체 실행|전체 분석|Run All/ })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /중단|Stop|취소/ })
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 5: QuickStats 카드 탭 → 해당 섹션 탭 전환
// ---------------------------------------------------------------------------

test.describe("레포 상세 개요 패널: QuickStats 카드 탭 → 섹션 탭 전환", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // skip: QuickStatsGrid 컴포넌트 미구현 (DLD-621)
  test.skip("QuickStats의 Feature 수 카드를 탭하면 Features 섹션 탭으로 전환된다", async ({
    page,
  }) => {
    // Arrange: e2e-test-repo-001은 featureCount 정보를 포함 (seed.ts 참고)
    // QuickStats 카드: Feature 수, 계층 수, 전략 수 등 요약 정보 표시

    // Act: 레포 상세 개요 페이지로 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Assert: QuickStats 그리드가 표시되어야 한다
    await expect(
      page
        .locator("[data-testid='quick-stats-grid']")
        .or(page.getByText(/Features|계층|전략/).first().locator("..").locator(".."))
    ).toBeVisible();

    // Act: Feature 수 QuickStats 카드 탭
    await page
      .locator("[data-testid='quick-stats-card-features']")
      .or(page.getByRole("button", { name: /Feature|피처/ }))
      .click();

    // Assert: Features 섹션 탭이 활성화되어야 한다
    await expect(
      page
        .getByRole("tab", { name: /Features|피처/ })
        .or(page.locator("[data-testid='section-tab-features'][aria-selected='true']"))
    ).toBeVisible();

    // Assert: Features 패널 콘텐츠가 표시되어야 한다
    await expect(
      page
        .locator("[data-testid='features-panel']")
        .or(page.getByText(/Features|피처/).locator("..").locator("[role='tabpanel']"))
    ).toBeVisible();
  });

  // skip: QuickStatsGrid 컴포넌트 미구현 (DLD-621)
  test.skip("QuickStats의 계층 수 카드를 탭하면 계층 섹션 탭으로 전환된다", async ({
    page,
  }) => {
    // Act: 레포 상세 개요 페이지로 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Act: 계층 수 QuickStats 카드 탭
    await page
      .locator("[data-testid='quick-stats-card-layers']")
      .or(page.getByRole("button", { name: /계층|Layer/ }))
      .click();

    // Assert: 계층 섹션 탭이 활성화되어야 한다
    await expect(
      page
        .getByRole("tab", { name: /계층|Layer/ })
        .or(page.locator("[data-testid='section-tab-layers'][aria-selected='true']"))
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 시나리오 6: SectionTabs로 개요/계층/전략/Features 패널 전환
// ---------------------------------------------------------------------------

test.describe("레포 상세: SectionTabs로 개요/계층/전략/Features 패널 전환", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // skip: SectionTabs 컴포넌트 미구현 (DLD-621)
  test.skip("SectionTabs에서 '계층' 탭을 클릭하면 계층 패널로 전환된다", async ({
    page,
  }) => {
    // Arrange: SectionTabs는 개요/계층/전략/Features 4개 탭으로 구성 예정

    // Act: 레포 상세 개요 페이지로 이동 (기본: 개요 탭 활성)
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Assert: SectionTabs가 표시되어야 한다
    await expect(
      page
        .locator("[data-testid='section-tabs']")
        .or(page.getByRole("tablist"))
    ).toBeVisible();

    // Assert: 기본적으로 "개요" 탭이 활성화되어야 한다
    await expect(
      page
        .getByRole("tab", { name: /개요|Overview/ })
        .or(page.locator("[data-testid='section-tab-overview'][aria-selected='true']"))
    ).toBeVisible();

    // Act: "계층" 탭 클릭
    await page
      .getByRole("tab", { name: /계층|Layer/ })
      .or(page.locator("[data-testid='section-tab-layers']"))
      .click();

    // Assert: 계층 탭이 활성화(aria-selected=true)되어야 한다
    await expect(
      page.getByRole("tab", { name: /계층|Layer/ })
    ).toHaveAttribute("aria-selected", "true");

    // Assert: 계층 패널 콘텐츠가 표시되어야 한다
    await expect(
      page
        .locator("[data-testid='layers-panel']")
        .or(page.locator("[role='tabpanel']"))
    ).toBeVisible();

    // Assert: 개요 패널 콘텐츠가 숨겨져야 한다
    await expect(
      page.locator("[data-testid='overview-panel']")
    ).not.toBeVisible();
  });

  // skip: SectionTabs 컴포넌트 미구현 (DLD-621)
  test.skip("SectionTabs에서 '전략' 탭을 클릭하면 전략 패널로 전환된다", async ({
    page,
  }) => {
    // Act: 레포 상세 개요 페이지로 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Act: "전략" 탭 클릭
    await page
      .getByRole("tab", { name: /전략|Strategy/ })
      .or(page.locator("[data-testid='section-tab-strategy']"))
      .click();

    // Assert: 전략 탭이 활성화되어야 한다
    await expect(
      page.getByRole("tab", { name: /전략|Strategy/ })
    ).toHaveAttribute("aria-selected", "true");

    // Assert: 전략 패널 콘텐츠가 표시되어야 한다
    await expect(
      page
        .locator("[data-testid='strategy-panel']")
        .or(page.locator("[role='tabpanel']"))
    ).toBeVisible();
  });

  // skip: SectionTabs 컴포넌트 미구현 (DLD-621)
  test.skip("SectionTabs에서 'Features' 탭을 클릭하면 Features 패널로 전환된다", async ({
    page,
  }) => {
    // Act: 레포 상세 개요 페이지로 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Act: "Features" 탭 클릭
    await page
      .getByRole("tab", { name: /Features|피처/ })
      .or(page.locator("[data-testid='section-tab-features']"))
      .click();

    // Assert: Features 탭이 활성화되어야 한다
    await expect(
      page.getByRole("tab", { name: /Features|피처/ })
    ).toHaveAttribute("aria-selected", "true");

    // Assert: Features 패널 콘텐츠가 표시되어야 한다
    await expect(
      page
        .locator("[data-testid='features-panel']")
        .or(page.locator("[role='tabpanel']"))
    ).toBeVisible();
  });

  // skip: SectionTabs 컴포넌트 미구현 (DLD-621)
  test.skip("SectionTabs에서 '개요' 탭을 클릭하면 개요 패널로 돌아온다", async ({
    page,
  }) => {
    // Act: 레포 상세 개요 페이지로 이동
    await page.goto("/repos/e2e-test-repo-001/overview");

    // Wait: 페이지 로딩 완료 대기
    await expect(page.getByText("test-org/sample-app")).toBeVisible({
      timeout: 30000,
    });

    // Act: "계층" 탭으로 이동 후 다시 "개요" 탭 클릭
    await page
      .getByRole("tab", { name: /계층|Layer/ })
      .or(page.locator("[data-testid='section-tab-layers']"))
      .click();

    await page
      .getByRole("tab", { name: /개요|Overview/ })
      .or(page.locator("[data-testid='section-tab-overview']"))
      .click();

    // Assert: 개요 탭이 활성화되어야 한다
    await expect(
      page.getByRole("tab", { name: /개요|Overview/ })
    ).toHaveAttribute("aria-selected", "true");

    // Assert: 개요 패널 (PipelineCard, QuickStatsGrid 포함) 이 표시되어야 한다
    await expect(
      page
        .locator("[data-testid='overview-panel']")
        .or(page.locator("[data-testid='pipeline-card']"))
    ).toBeVisible();
  });
});
