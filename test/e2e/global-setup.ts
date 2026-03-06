/**
 * Playwright 글로벌 셋업 (DLD-610)
 *
 * E2E 테스트 실행 전 DB를 초기화하고 시드 데이터를 삽입합니다.
 * - existing-user@example.com 유저를 포함한 기본 시드 데이터 삽입
 * - DB 접근 불가 환경(KIND cluster 등)에서는 시딩을 건너뜁니다
 */

import { seedDatabase, clearDatabase } from "../helpers/seed";

async function globalSetup() {
  console.log(`[global-setup] DATABASE_URL=${process.env.DATABASE_URL}`);
  console.log(`[global-setup] CWD=${process.cwd()}`);
  try {
    await clearDatabase();
    console.log("[global-setup] DB cleared");
  } catch (err) {
    console.warn("[global-setup] DB clear failed:", err);
  }
  try {
    const result = await seedDatabase();
    console.log(
      `[global-setup] DB seeded — user=${result.user.id}, installationId present`
    );
  } catch (err) {
    // DB 접근 불가 환경(KIND cluster 등) — 시딩 건너뜀
    console.warn("[global-setup] DB seeding failed:", err);
  }
}

export default globalSetup;
