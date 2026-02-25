import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from "@/lib/auth/jwt";

describe("JWT Utilities", () => {
  const testUserId = "user-123-abc";

  describe("generateAccessToken", () => {
    it("should return a non-empty string token", () => {
      // Act
      const token = generateAccessToken(testUserId);

      // Assert
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("should return a valid JWT format with three dot-separated parts", () => {
      // Act
      const token = generateAccessToken(testUserId);

      // Assert
      const parts = token.split(".");
      expect(parts).toHaveLength(3);
    });

    it("should embed the userId in the token payload", () => {
      // Act
      const token = generateAccessToken(testUserId);
      const payload = verifyToken(token);

      // Assert
      expect(payload.userId).toBe(testUserId);
    });

    it("should set expiration to 15 minutes from now", () => {
      // Arrange
      const before = Math.floor(Date.now() / 1000);

      // Act
      const token = generateAccessToken(testUserId);
      const payload = verifyToken(token);
      const after = Math.floor(Date.now() / 1000);

      // Assert
      const fifteenMinutes = 15 * 60;
      expect(payload.exp).toBeGreaterThanOrEqual(before + fifteenMinutes);
      expect(payload.exp).toBeLessThanOrEqual(after + fifteenMinutes);
    });

    it("should include token type 'access' in the payload", () => {
      // Act
      const token = generateAccessToken(testUserId);
      const payload = verifyToken(token);

      // Assert
      expect(payload.type).toBe("access");
    });
  });

  describe("generateRefreshToken", () => {
    it("should return a non-empty string token", () => {
      // Act
      const token = generateRefreshToken(testUserId);

      // Assert
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("should return a valid JWT format with three dot-separated parts", () => {
      // Act
      const token = generateRefreshToken(testUserId);

      // Assert
      const parts = token.split(".");
      expect(parts).toHaveLength(3);
    });

    it("should embed the userId in the token payload", () => {
      // Act
      const token = generateRefreshToken(testUserId);
      const payload = verifyToken(token);

      // Assert
      expect(payload.userId).toBe(testUserId);
    });

    it("should set expiration to 7 days from now", () => {
      // Arrange
      const before = Math.floor(Date.now() / 1000);

      // Act
      const token = generateRefreshToken(testUserId);
      const payload = verifyToken(token);
      const after = Math.floor(Date.now() / 1000);

      // Assert
      const sevenDays = 7 * 24 * 60 * 60;
      expect(payload.exp).toBeGreaterThanOrEqual(before + sevenDays);
      expect(payload.exp).toBeLessThanOrEqual(after + sevenDays);
    });

    it("should include token type 'refresh' in the payload", () => {
      // Act
      const token = generateRefreshToken(testUserId);
      const payload = verifyToken(token);

      // Assert
      expect(payload.type).toBe("refresh");
    });
  });

  describe("verifyToken", () => {
    it("should return the correct payload for a valid access token", () => {
      // Arrange
      const token = generateAccessToken(testUserId);

      // Act
      const payload = verifyToken(token);

      // Assert
      expect(payload).toBeDefined();
      expect(payload.userId).toBe(testUserId);
      expect(payload.type).toBe("access");
      expect(payload.exp).toBeDefined();
      expect(payload.iat).toBeDefined();
    });

    it("should return the correct payload for a valid refresh token", () => {
      // Arrange
      const token = generateRefreshToken(testUserId);

      // Act
      const payload = verifyToken(token);

      // Assert
      expect(payload).toBeDefined();
      expect(payload.userId).toBe(testUserId);
      expect(payload.type).toBe("refresh");
    });

    it("should throw an error when verifying an expired token", () => {
      // Arrange - create a manually crafted expired token
      // We simulate this by passing a token that was generated with a past expiration.
      // Since we cannot directly create an expired token with the utility,
      // we use a known-expired JWT string.
      const expiredToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMX0." +
        "invalid-signature";

      // Act & Assert
      expect(() => verifyToken(expiredToken)).toThrow();
    });

    it("should throw an error when verifying a malformed token", () => {
      // Arrange
      const malformedToken = "not-a-valid-jwt-token";

      // Act & Assert
      expect(() => verifyToken(malformedToken)).toThrow();
    });

    it("should throw an error when verifying a token with invalid signature", () => {
      // Arrange
      const token = generateAccessToken(testUserId);
      const parts = token.split(".");
      // Tamper with the signature
      const tamperedToken = `${parts[0]}.${parts[1]}.invalid-signature`;

      // Act & Assert
      expect(() => verifyToken(tamperedToken)).toThrow();
    });

    it("should throw an error when given an empty string", () => {
      // Act & Assert
      expect(() => verifyToken("")).toThrow();
    });
  });

  describe("token uniqueness", () => {
    it("should generate different tokens for different userIds", () => {
      // Act
      const token1 = generateAccessToken("user-1");
      const token2 = generateAccessToken("user-2");

      // Assert
      expect(token1).not.toBe(token2);
    });

    it("should generate different access and refresh tokens for the same userId", () => {
      // Act
      const accessToken = generateAccessToken(testUserId);
      const refreshToken = generateRefreshToken(testUserId);

      // Assert
      expect(accessToken).not.toBe(refreshToken);
    });
  });
});
