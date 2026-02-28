/**
 * Playwright 글로벌 셋업 (DLD-610)
 *
 * E2E 테스트 실행 전 DB를 초기화하고 시드 데이터를 삽입합니다.
 * - existing-user@example.com 유저를 포함한 기본 시드 데이터 삽입
 * - DB 접근 불가 환경(KIND cluster 등)에서는 시딩을 건너뜁니다
 */

import { seedDatabase, clearDatabase } from "../helpers/seed";

async function globalSetup() {
  console.log("[global-setup] Starting...");
  console.log(
    `[global-setup] DATABASE_URL=${process.env.DATABASE_URL ?? "(not set)"}`
  );
  console.log(`[global-setup] CWD=${process.cwd()}`);

  try {
    await clearDatabase();
    console.log("[global-setup] DB cleared successfully");
  } catch (err) {
    console.warn("[global-setup] clearDatabase failed:", String(err));
    // DB 테이블이 아직 없는 경우(새 DB) — 무시하고 시딩 진행
  }
  try {
    const result = await seedDatabase();
    console.log(
      `[global-setup] DB seeding completed: user=${result.user.id}, repo=${result.repo.id}`
    );
  } catch (err) {
    // DB 접근 불가 환경(KIND cluster 등) — 시딩 건너뜀
    console.warn("[global-setup] DB seeding skipped (database not accessible)");
    console.warn(`[global-setup] Seed error detail: ${String(err)}`);
    console.warn(
      "[global-setup] WARNING: 'existing-user@example.com' 시드 데이터가 없으므로 중복 이메일 테스트가 실패할 수 있습니다"
    );
  }
}

export default globalSetup;
