/**
 * Playwright 글로벌 티어다운 (DLD-610)
 *
 * E2E 테스트 완료 후 Prisma DB 연결을 해제합니다.
 */

import { disconnectDatabase } from "../helpers/seed";

async function globalTeardown() {
  await disconnectDatabase();
}

export default globalTeardown;
