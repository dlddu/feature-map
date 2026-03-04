/**
 * API 진단 테스트 — CI에서 /api/github/repos 실패 원인 파악
 *
 * 이 테스트는 Next.js API 엔드포인트를 직접 호출하여
 * 서버 사이드에서 mock GitHub 서버 연동이 작동하는지 확인합니다.
 */

import { test, expect } from "@playwright/test";
import { createAccessToken } from "../helpers/auth";

test.describe("API 진단: GitHub repos 엔드포인트", () => {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  test("/api/auth/me 가 시드된 유저 정보를 반환한다", async ({ request }) => {
    const token = createAccessToken("e2e-test-user-001");
    const res = await request.get(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: `access_token=${token}` },
    });

    const body = await res.text();
    console.log(`/api/auth/me status=${res.status()} body=${body}`);

    expect(res.status(), `/api/auth/me failed: ${body}`).toBe(200);

    const data = JSON.parse(body);
    expect(
      data.user?.installationId,
      `installationId missing from user: ${body}`
    ).toBe(12345);
  });

  test("/api/github/repos 가 mock 서버에서 레포 목록을 반환한다", async ({
    request,
  }) => {
    const token = createAccessToken("e2e-test-user-001");
    const res = await request.get(`${baseUrl}/api/github/repos`, {
      headers: { Cookie: `access_token=${token}` },
    });

    const body = await res.text();
    console.log(`/api/github/repos status=${res.status()} body=${body}`);

    expect(res.status(), `/api/github/repos failed: ${body}`).toBe(200);

    const data = JSON.parse(body);
    expect(
      data.repositories?.length,
      `No repositories returned: ${body}`
    ).toBeGreaterThan(0);
    expect(data.repositories[0].owner.login).toBe("test-org");
  });
});
