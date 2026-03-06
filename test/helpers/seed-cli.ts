/**
 * CLI 시드 스크립트 (CI 전용)
 *
 * Playwright globalSetup과 달리 독립 프로세스로 실행되어
 * Next.js 서버 시작 전에 DB를 시딩합니다.
 *
 * 사용: npx tsx test/helpers/seed-cli.ts
 */

import { seedDatabase, clearDatabase, disconnectDatabase } from "./seed";

async function main() {
  console.log(`[seed-cli] DATABASE_URL=${process.env.DATABASE_URL}`);
  console.log(`[seed-cli] CWD=${process.cwd()}`);

  try {
    await clearDatabase();
    console.log("[seed-cli] DB cleared");
  } catch {
    console.log("[seed-cli] DB clear skipped (empty DB)");
  }

  const result = await seedDatabase();
  console.log(
    `[seed-cli] Seeded: user=${result.user.id}, repo=${result.repo.fullName}`
  );

  await disconnectDatabase();
}

main().catch((err) => {
  console.error("[seed-cli] Fatal:", err);
  process.exit(1);
});
