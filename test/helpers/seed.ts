/**
 * DB 시딩 헬퍼 (DLD-610)
 *
 * E2E 테스트에서 Prisma를 사용해 초기 데이터를 세팅합니다.
 * 각 테스트 전에 호출하여 결정적인(deterministic) 상태를 보장합니다.
 *
 * 사용 예:
 *   import { seedDatabase, clearDatabase, SeedResult } from '../helpers/seed';
 *
 *   test.beforeEach(async () => {
 *     await clearDatabase();
 *     result = await seedDatabase();
 *   });
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? "file:./test.db",
    },
  },
});

export interface SeedResult {
  user: {
    id: string;
    githubId: number;
    login: string;
    name: string;
  };
  repo: {
    id: string;
    githubRepoId: number;
    fullName: string;
    defaultBranch: string;
  };
  pipelineRun: {
    id: string;
    repoId: string;
    userId: string;
    commitSha: string;
    status: string;
  };
}

/**
 * 모든 테이블의 데이터를 삭제합니다.
 * 테스트 격리를 위해 각 테스트 전에 호출합니다.
 */
export async function clearDatabase(): Promise<void> {
  // 외래키 제약 순서에 맞게 삭제
  await prisma.dependency.deleteMany();
  await prisma.acceptanceTest.deleteMany();
  await prisma.feature.deleteMany();
  await prisma.strategy.deleteMany();
  await prisma.layer.deleteMany();
  await prisma.pipelineRun.deleteMany();
  await prisma.aPIKey.deleteMany();
  await prisma.lLMConfig.deleteMany();
  await prisma.repo.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * E2E 테스트용 기본 시드 데이터를 삽입합니다.
 */
export async function seedDatabase(): Promise<SeedResult> {
  const user = await prisma.user.create({
    data: {
      id: "e2e-test-user-001",
      githubId: 9000001,
      login: "test-user",
      name: "E2E Test User",
      avatarUrl: "https://avatars.githubusercontent.com/u/9000001?v=4",
      // accessToken/refreshToken은 JWT 헬퍼로 생성한 값을 별도 주입
      accessToken: "seed-access-token-placeholder",
      refreshToken: "seed-refresh-token-placeholder",
    },
  });

  // E2E 중복 이메일 테스트를 위한 이메일/비밀번호 기반 유저 시딩
  // auth.test.ts의 "이미 등록된 이메일로 회원가입 시도" 케이스에서 사용
  await prisma.user.create({
    data: {
      id: "e2e-existing-email-user-001",
      email: "existing-user@example.com",
      passwordHash: bcrypt.hashSync("Password123!", 10),
      name: "Existing User",
    },
  });

  const repo = await prisma.repo.create({
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

  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      id: "e2e-test-pipeline-001",
      repoId: repo.id,
      userId: user.id,
      commitSha: "abc123def456abc123def456abc123def456abc1",
      status: "PENDING",
    },
  });

  return {
    user: {
      id: user.id,
      githubId: user.githubId as number,
      login: user.login as string,
      name: user.name ?? "E2E Test User",
    },
    repo: {
      id: repo.id,
      githubRepoId: repo.githubRepoId,
      fullName: repo.fullName,
      defaultBranch: repo.defaultBranch,
    },
    pipelineRun: {
      id: pipelineRun.id,
      repoId: pipelineRun.repoId,
      userId: pipelineRun.userId,
      commitSha: pipelineRun.commitSha,
      status: pipelineRun.status,
    },
  };
}

/**
 * 완료된 파이프라인 상태로 업데이트합니다.
 * 파이프라인 완료 시나리오 테스트에 사용합니다.
 */
export async function completePipelineRun(
  pipelineRunId: string
): Promise<void> {
  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
}

/**
 * 시딩 헬퍼 사용 후 Prisma 연결을 해제합니다.
 * afterAll 훅에서 호출합니다.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export { prisma };
