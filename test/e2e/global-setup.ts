/**
 * Playwright 글로벌 셋업 (DLD-610)
 *
 * E2E 테스트 실행 전 DB를 초기화하고 시드 데이터를 삽입합니다.
 * - existing-user@example.com 유저를 포함한 기본 시드 데이터 삽입
 * - DB 접근 불가 환경(KIND cluster 등)에서는 시딩을 건너뜁니다
 */

import { seedDatabase, clearDatabase } from "../helpers/seed";

async function globalSetup() {
  try {
    await clearDatabase();
  } catch {
    // DB 테이블이 아직 없는 경우(새 DB) — 무시하고 시딩 진행
  }
  try {
    await seedDatabase();
  } catch {
    // DB 접근 불가 환경(KIND cluster 등) — 시딩 건너뜀
    console.warn("[global-setup] DB seeding skipped (database not accessible)");
  }
}

export default globalSetup;
