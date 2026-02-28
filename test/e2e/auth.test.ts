/**
 * 회원가입 E2E 테스트 (DLD-611)
 *
 * 이메일/비밀번호 기반 회원가입 플로우를 검증하는 E2E 테스트입니다.
 * - 정상 회원가입 후 대시보드 리다이렉트
 * - 이미 등록된 이메일로 가입 시도 시 에러 메시지 표시
 * - 비밀번호 정책 미충족(8자 미만) 시 에러 메시지 표시
 *
 * TODO: DLD-611 구현 완료 후 skip 제거
 * 실행: npx playwright test test/e2e/auth.test.ts
 */

import { test, expect } from "@playwright/test";

// TODO: DLD-611 구현 완료 후 아래 test.describe.skip을 test.describe로 교체
test.describe.skip("회원가입: 이메일/비밀번호 기반 회원가입 플로우", () => {
  // ---------------------------------------------------------------------------
  // Happy Path: 정상 회원가입 후 대시보드 리다이렉트
  // ---------------------------------------------------------------------------

  test("유효한 이메일과 비밀번호로 회원가입하면 대시보드로 리다이렉트된다", async ({
    page,
  }) => {
    // Arrange: 유니크한 테스트용 이메일 생성 (테스트 간 충돌 방지)
    const uniqueEmail = `test-${Date.now()}@example.com`;
    const password = "Password123!";

    // Act: 회원가입 페이지 진입 후 폼 입력
    await page.goto("/signup");
    await page.getByLabel("이메일").fill(uniqueEmail);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "회원가입" }).click();

    // Assert: 대시보드로 리다이렉트되어야 한다
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // ---------------------------------------------------------------------------
  // Error Case: 이미 등록된 이메일로 가입 시도
  // ---------------------------------------------------------------------------

  test("이미 등록된 이메일로 회원가입 시도하면 에러 메시지가 표시된다", async ({
    page,
  }) => {
    // Arrange: 이미 등록된 이메일 (사전에 가입된 계정)
    const existingEmail = "existing-user@example.com";
    const password = "Password123!";

    // Act: 회원가입 페이지 진입 후 중복 이메일로 폼 제출
    await page.goto("/signup");
    await page.getByLabel("이메일").fill(existingEmail);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "회원가입" }).click();

    // Assert: 이미 사용 중인 이메일 에러 메시지가 표시되어야 한다
    await expect(
      page.getByText(/이미 사용 중인 이메일|이미 등록된 이메일/)
    ).toBeVisible();

    // Assert: 회원가입 페이지를 벗어나지 않아야 한다
    expect(page.url()).toContain("/signup");
  });

  // ---------------------------------------------------------------------------
  // Error Case: 비밀번호 정책 미충족 (8자 미만)
  // ---------------------------------------------------------------------------

  test("8자 미만 비밀번호로 회원가입 시도하면 에러 메시지가 표시된다", async ({
    page,
  }) => {
    // Arrange: 정책 미충족 비밀번호 (7자)
    const email = `test-policy-${Date.now()}@example.com`;
    const shortPassword = "Pass1!";

    // Act: 회원가입 페이지 진입 후 짧은 비밀번호로 폼 제출
    await page.goto("/signup");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(shortPassword);
    await page.getByRole("button", { name: "회원가입" }).click();

    // Assert: 비밀번호 정책 에러 메시지가 표시되어야 한다
    await expect(
      page.getByText(/비밀번호는 8자 이상|8자 이상의 비밀번호/)
    ).toBeVisible();

    // Assert: 회원가입 페이지를 벗어나지 않아야 한다
    expect(page.url()).toContain("/signup");
  });
});
