/**
 * 회원가입 E2E 테스트 (DLD-611)
 *
 * 이메일+비밀번호 기반 회원가입 플로우를 검증합니다.
 * - 회원가입 성공 후 대시보드 리다이렉트
 * - 이미 등록된 이메일로 가입 시도 시 에러 메시지 표시
 * - 비밀번호 정책 미충족(8자 미만) 시 에러 메시지 표시
 *
 * TODO: DLD-611 구현 완료 후 skip 제거
 * 실행: npx playwright test test/e2e/signup.test.ts
 */

import { test, expect } from "@playwright/test";
import { clearDatabase } from "../helpers/seed";

// TODO: DLD-611 구현 완료 후 아래 test.describe.skip을 test.describe로 교체
test.describe.skip("회원가입: 이메일+비밀번호 기반 회원가입 플로우", () => {
  test.beforeEach(async () => {
    // 각 테스트 전 DB를 초기화하여 테스트 격리를 보장합니다
    await clearDatabase();
  });

  // ---------------------------------------------------------------------------
  // Happy Path: 회원가입 성공 후 대시보드 리다이렉트
  // ---------------------------------------------------------------------------

  test("유효한 이메일과 비밀번호로 회원가입하면 대시보드로 리다이렉트된다", async ({
    page,
  }) => {
    // Arrange
    await page.goto("/signup");

    // Assert: 회원가입 폼이 렌더링되어야 한다
    await expect(
      page.getByRole("heading", { name: /회원가입|Sign up|Register/i })
    ).toBeVisible();

    // Act: 유효한 이메일과 비밀번호 입력
    await page.getByLabel(/이메일|Email/i).fill("newuser@example.com");
    await page.getByLabel(/비밀번호|Password/i).first().fill("securepass123");
    await page
      .getByRole("button", { name: /회원가입|Sign up|Register/i })
      .click();

    // Assert: 대시보드로 리다이렉트되어야 한다
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // ---------------------------------------------------------------------------
  // Error Case: 이미 등록된 이메일로 가입 시도
  // ---------------------------------------------------------------------------

  test("이미 등록된 이메일로 회원가입하면 중복 이메일 에러 메시지가 표시된다", async ({
    page,
  }) => {
    // Arrange: 첫 번째 회원가입으로 이메일을 등록한다
    await page.goto("/signup");
    await page.getByLabel(/이메일|Email/i).fill("existing@example.com");
    await page.getByLabel(/비밀번호|Password/i).first().fill("securepass123");
    await page
      .getByRole("button", { name: /회원가입|Sign up|Register/i })
      .click();
    await expect(page).toHaveURL(/\/dashboard/);

    // Act: 동일한 이메일로 다시 회원가입 시도
    await page.goto("/signup");
    await page.getByLabel(/이메일|Email/i).fill("existing@example.com");
    await page.getByLabel(/비밀번호|Password/i).first().fill("anotherpass456");
    await page
      .getByRole("button", { name: /회원가입|Sign up|Register/i })
      .click();

    // Assert: 중복 이메일 에러 메시지가 표시되어야 한다
    await expect(
      page.getByText(/이미 사용 중인 이메일|이미 등록된 이메일|Email already|already in use/i)
    ).toBeVisible();

    // Assert: 회원가입 페이지에 머물러야 한다 (리다이렉트 없음)
    expect(page.url()).toContain("/signup");
  });

  // ---------------------------------------------------------------------------
  // Error Case: 비밀번호 정책 미충족 (8자 미만)
  // ---------------------------------------------------------------------------

  test("비밀번호가 8자 미만이면 비밀번호 정책 에러 메시지가 표시된다", async ({
    page,
  }) => {
    // Arrange
    await page.goto("/signup");

    // Act: 7자 비밀번호 입력 (정책 미충족)
    await page.getByLabel(/이메일|Email/i).fill("user@example.com");
    await page.getByLabel(/비밀번호|Password/i).first().fill("short7");
    await page
      .getByRole("button", { name: /회원가입|Sign up|Register/i })
      .click();

    // Assert: 비밀번호 정책 에러 메시지가 표시되어야 한다
    await expect(
      page.getByText(/8자|8 characters|비밀번호는 최소|password must be at least/i)
    ).toBeVisible();

    // Assert: 회원가입 페이지에 머물러야 한다 (리다이렉트 없음)
    expect(page.url()).toContain("/signup");
  });
});
