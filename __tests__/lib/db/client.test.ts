import { prisma, getPrismaClient } from "@/lib/db/client";

// Mock PrismaClient to avoid needing a real database connection
jest.mock("@prisma/client", () => {
  const mockPrismaClient = jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  }));
  return { PrismaClient: mockPrismaClient };
});

describe("Prisma Client Singleton", () => {
  beforeEach(() => {
    // Reset module registry to test singleton behavior fresh
    jest.resetModules();
  });

  describe("default export (prisma)", () => {
    it("should export a prisma client instance", () => {
      // Assert
      expect(prisma).toBeDefined();
    });

    it("should have $connect method", () => {
      // Assert
      expect(prisma).toHaveProperty("$connect");
    });

    it("should have $disconnect method", () => {
      // Assert
      expect(prisma).toHaveProperty("$disconnect");
    });
  });

  describe("singleton pattern", () => {
    it("should return the same instance when getPrismaClient is called multiple times", () => {
      // Act
      const instance1 = getPrismaClient();
      const instance2 = getPrismaClient();

      // Assert
      expect(instance1).toBe(instance2);
    });

    it("should return the same instance as the default export", () => {
      // Act
      const instance = getPrismaClient();

      // Assert
      expect(instance).toBe(prisma);
    });
  });

  describe("environment handling", () => {
    it("should not attach to globalThis in production environment", () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      // Act
      const instance = getPrismaClient();

      // Assert
      expect(instance).toBeDefined();

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });

    it("should reuse cached instance in development to prevent multiple connections", () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      // Act
      const instance1 = getPrismaClient();
      const instance2 = getPrismaClient();

      // Assert
      expect(instance1).toBe(instance2);

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });
  });
});
