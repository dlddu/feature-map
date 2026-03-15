/**
 * LLM 설정 E2E 테스트 (DLD-617)
 *
 * 설정 페이지 LLM 탭에서의 API Key 관리와 기능별 모델 설정을
 * 검증하는 E2E 테스트입니다.
 * - API Key 등록 후 "등록됨" 상태 뱃지 및 마스킹 키 표시
 * - 등록된 API Key 변경 후 마스킹 키 갱신 확인
 * - 기능별 모델 변경 후 "저장됨" 토스트 표시
 *
 * 실행: npx playwright test test/e2e/settings-llm.test.ts
 *
 * LLM 설정 페이지(/settings/llm) 구현 완료 (DLD-618) — 모든 테스트 활성화됨.
 */

import { test, expect } from "@playwright/test";
import { createAuthCookies } from "../helpers/auth";

// ---------------------------------------------------------------------------
// 설정 > LLM 탭: API Key 등록
// ---------------------------------------------------------------------------

test.describe("설정 > LLM 탭: API Key 등록 및 상태 표시", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // ---------------------------------------------------------------------------
  // Happy Path: API Key 등록 → "등록됨" 뱃지 + 마스킹 키 표시
  // ---------------------------------------------------------------------------

  test("OpenAI API Key를 등록하면 APIKeyCard에 '등록됨' 뱃지와 마스킹된 키가 표시된다", async ({
    page,
  }) => {
    // Act: LLM 설정 탭으로 이동
    await page.goto("/settings/llm");

    // Assert: LLM 탭이 활성화된 설정 페이지가 표시되어야 한다
    await expect(page.getByRole("tab", { name: "LLM" })).toBeVisible();

    // Act: OpenAI ProviderRow의 "등록" 버튼 클릭
    const openAIRow = page.locator("[data-testid='provider-row-openai']").or(
      page.getByText("OpenAI").locator("..")
    );
    await openAIRow.getByRole("button", { name: /등록|추가/ }).click();

    // Assert: API Key 입력 바텀시트가 열려야 한다
    await expect(
      page.getByRole("dialog").or(page.locator("[data-testid='api-key-bottom-sheet']"))
    ).toBeVisible();

    // Act: 더미 API Key 입력 (실제 키 절대 사용 금지)
    const sheet = page.getByRole("dialog").or(
      page.locator("[data-testid='api-key-bottom-sheet']")
    );
    await sheet.getByLabel(/API Key|키/).fill("sk-test-dummykey1234");

    // Act: 저장 버튼 클릭
    await sheet.getByRole("button", { name: /저장|확인|Save/ }).click();

    // Assert: 바텀시트가 닫혀야 한다
    await expect(
      page.getByRole("dialog").or(page.locator("[data-testid='api-key-bottom-sheet']"))
    ).not.toBeVisible();

    // Assert: OpenAI ProviderRow에 "등록됨" 상태 뱃지가 표시되어야 한다
    await expect(
      openAIRow.getByText(/등록됨|등록 완료|Active/)
    ).toBeVisible();

    // Assert: 마스킹된 키(sk-...로 시작하는 형태)가 표시되어야 한다
    await expect(
      openAIRow.getByText(/sk-\.\.\.[a-z0-9]+/i)
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 설정 > LLM 탭: API Key 변경
// ---------------------------------------------------------------------------

test.describe("설정 > LLM 탭: 등록된 API Key 변경", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // ---------------------------------------------------------------------------
  // Happy Path: API Key 변경 → 마스킹 키 갱신
  // ---------------------------------------------------------------------------

  test("이미 등록된 OpenAI API Key를 변경하면 마스킹된 키가 갱신된다", async ({
    page,
  }) => {
    // Act: LLM 설정 탭으로 이동
    await page.goto("/settings/llm");

    // Assert: OpenAI ProviderRow에 기존 마스킹 키(sk-...7x3f)가 표시되어야 한다
    const openAIRow = page.locator("[data-testid='provider-row-openai']").or(
      page.getByText("OpenAI").locator("..")
    );
    await expect(openAIRow.getByText("sk-...7x3f")).toBeVisible();

    // Assert: "변경" 버튼이 표시되어야 한다 (등록됨 상태이므로 "등록" 대신 "변경")
    await expect(
      openAIRow.getByRole("button", { name: /변경|수정|Update/ })
    ).toBeVisible();

    // Act: "변경" 버튼 클릭
    await openAIRow.getByRole("button", { name: /변경|수정|Update/ }).click();

    // Assert: API Key 입력 바텀시트가 열려야 한다
    const sheet = page.getByRole("dialog").or(
      page.locator("[data-testid='api-key-bottom-sheet']")
    );
    await expect(sheet).toBeVisible();

    // Act: 새 더미 API Key 입력
    await sheet.getByLabel(/API Key|키/).fill("sk-test-newdummykey5678");

    // Act: 저장 버튼 클릭
    await sheet.getByRole("button", { name: /저장|확인|Save/ }).click();

    // Assert: 바텀시트가 닫혀야 한다
    await expect(sheet).not.toBeVisible();

    // Assert: 마스킹 키가 갱신된 값(sk-...9z2k)으로 변경되어야 한다
    await expect(openAIRow.getByText("sk-...9z2k")).toBeVisible();

    // Assert: 기존 마스킹 키(sk-...7x3f)는 더 이상 표시되지 않아야 한다
    await expect(openAIRow.getByText("sk-...7x3f")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 설정 > LLM 탭: 기능별 모델 변경
// ---------------------------------------------------------------------------

test.describe("설정 > LLM 탭: 기능별 모델 변경 및 저장 토스트", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test.beforeEach(async ({ context }) => {
    // Arrange: 시드 유저(e2e-test-user-001)의 인증 쿠키 설정
    const cookies = createAuthCookies("e2e-test-user-001", baseUrl);
    await context.addCookies(cookies);
  });

  // ---------------------------------------------------------------------------
  // Happy Path: F1 기능 모델 변경 → "저장됨" 토스트 표시
  // ---------------------------------------------------------------------------

  test("ModelMappingCard에서 F1(layer extraction) 모델을 변경하면 '저장됨' 토스트가 표시된다", async ({
    page,
  }) => {
    // Act: LLM 설정 탭으로 이동
    await page.goto("/settings/llm");

    // Assert: ModelMappingCard가 표시되어야 한다
    await expect(
      page.locator("[data-testid='model-mapping-card']").or(
        page.getByText(/기능별 모델|Model Mapping/)
      )
    ).toBeVisible();

    // Act: F1(layer extraction) 기능의 ModelSelect를 변경
    // 모바일 네이티브 select이므로 selectOption() 사용
    const f1Select = page.locator("[data-testid='model-select-f1']").or(
      page.locator("select[name='f1'], select[aria-label*='f1'], select[aria-label*='layer extraction']")
    );
    await f1Select.selectOption({ label: /claude-3-5-sonnet|Claude 3\.5 Sonnet/ });

    // Assert: "저장됨" 토스트가 표시되어야 한다 (즉시 저장 + 토스트)
    // 토스트는 자동 소멸하므로 충분한 timeout 안에 visible 확인
    await expect(
      page.getByText(/저장됨|저장 완료|Saved/)
    ).toBeVisible({ timeout: 5000 });

    // Assert: 토스트가 자동으로 사라져야 한다 (일반적으로 2~3초 후 소멸)
    await expect(
      page.getByText(/저장됨|저장 완료|Saved/)
    ).not.toBeVisible({ timeout: 10000 });
  });
});
