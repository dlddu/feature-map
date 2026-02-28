/**
 * Playwright 글로벌 셋업 (DLD-610)
 *
 * E2E 테스트 실행 전 DB를 초기화하고 시드 데이터를 삽입합니다.
 * - existing-user@example.com 유저를 포함한 기본 시드 데이터 삽입
 */

import { seedDatabase, clearDatabase } from "../helpers/seed";

async function globalSetup() {
  await clearDatabase();
  await seedDatabase();
}

export default globalSetup;
