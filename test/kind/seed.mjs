/**
 * KIND 클러스터 전용 DB 시딩 스크립트 (DLD-610)
 *
 * init container에서 prisma-migrate 이후 실행됩니다.
 * test/helpers/seed.ts와 동일한 시드 데이터를 삽입합니다.
 *
 * bcrypt 해시는 "Password123!"를 salt round 10으로 해싱한 값입니다.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PASSWORD_HASH =
  "$2b$10$UBxv3sqtVhGBLqZojEJB5Oivpbu8k3z1xddVgYjLlIHGYRHfr5TSG";

async function seed() {
  // e2e-test-user-001: GitHub App 설치된 유저
  const user = await prisma.user.create({
    data: {
      id: "e2e-test-user-001",
      githubId: 9000001,
      login: "test-user",
      name: "E2E Test User",
      avatarUrl: "https://avatars.githubusercontent.com/u/9000001?v=4",
      accessToken: "seed-access-token-placeholder",
      refreshToken: "seed-refresh-token-placeholder",
      installationId: 12345,
    },
  });

  // 중복 이메일 테스트용 유저
  await prisma.user.create({
    data: {
      id: "e2e-existing-email-user-001",
      email: "existing-user@example.com",
      passwordHash: PASSWORD_HASH,
      name: "Existing User",
    },
  });

  // GitHub App 미설치 신규 유저
  await prisma.user.create({
    data: {
      id: "e2e-test-user-002",
      email: "fresh-user@example.com",
      passwordHash: PASSWORD_HASH,
      name: "Fresh User",
    },
  });

  // 시드 레포
  await prisma.repo.create({
    data: {
      id: "e2e-test-repo-001",
      githubRepoId: 100001,
      fullName: "test-org/sample-app",
      defaultBranch: "main",
      installationId: 12345,
      userId: user.id,
      cloneUrl: "https://github.com/test-org/sample-app.git",
    },
  });

  // 시드 파이프라인
  await prisma.pipelineRun.create({
    data: {
      id: "e2e-test-pipeline-001",
      repoId: "e2e-test-repo-001",
      userId: user.id,
      commitSha: "abc123def456abc123def456abc123def456abc1",
      status: "PENDING",
    },
  });

  console.log("[seed] Database seeded successfully");
}

seed()
  .catch((e) => {
    console.error("[seed] Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
