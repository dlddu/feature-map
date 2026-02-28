/**
 * 비밀번호 정책 검증 유틸리티 단위 테스트
 *
 * 검증 대상: src/lib/auth/password.ts
 * - validatePassword: 비밀번호 정책 검증 (8자 이상, 대문자+소문자+숫자 포함)
 * - hashPassword: bcrypt 해싱
 * - comparePassword: 해시 비교
 *
 * NOTE: TDD Red Phase - 구현 전 작성된 테스트이므로 현재 실패 상태가 정상입니다.
 */

import {
  validatePassword,
  hashPassword,
  comparePassword,
} from "@/lib/auth/password";

describe("Password Utilities", () => {
  // ---------------------------------------------------------------------------
  // validatePassword
  // ---------------------------------------------------------------------------

  describe("validatePassword", () => {
    describe("happy path: 유효한 비밀번호", () => {
      it("should return valid=true when password meets all policy requirements", () => {
        // Arrange
        const password = "Password1";

        // Act
        const result = validatePassword(password);

        // Assert
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should return valid=true for password with special characters", () => {
        // Arrange
        const password = "Password1!@#";

        // Act
        const result = validatePassword(password);

        // Assert
        expect(result.valid).toBe(true);
      });

      it("should return valid=true for exactly 8 character password that meets all rules", () => {
        // Arrange
        const password = "Passw0rd"; // 8자: 대문자 P, 소문자, 숫자 포함

        // Act
        const result = validatePassword(password);

        // Assert
        expect(result.valid).toBe(true);
      });
    });

    describe("edge case: 길이 제한", () => {
      it("should return valid=false when password is shorter than 8 characters", () => {
        // Arrange
        const password = "Pass1"; // 5자

        // Act
        const result = validatePassword(password);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it("should return valid=false for 7-character password even if it meets other rules", () => {
        // Arrange
        const password = "Passw0r"; // 7자, 대+소+숫자 포함

        // Act
        const result = validatePassword(password);

        // Assert
        expect(result.valid).toBe(false);
      });

      it("should include a length-related error message when password is too short", () => {
        // Arrange
        const password = "Ab1";

        // Act
        const result = validatePassword(password);

        // Assert
        expect(
          result.errors.some((e) => e.toLowerCase().includes("8"))
        ).toBe(true);
      });
    });

    describe("error case: 대문자 누락", () => {
      it("should return valid=false when password has no uppercase letter", () => {
        // Arrange
        const password = "password1"; // 소문자+숫자, 대문자 없음

        // Act
        const result = validatePassword(password);

        // Assert
        expect(result.valid).toBe(false);
      });

      it("should include an uppercase-related error message", () => {
        // Arrange
        const password = "password1";

        // Act
        const result = validatePassword(password);

        // Assert
        expect(
          result.errors.some((e) => /대문자|uppercase/i.test(e))
        ).toBe(true);
      });
    });

    describe("error case: 소문자 누락", () => {
      it("should return valid=false when password has no lowercase letter", () => {
        // Arrange
        const password = "PASSWORD1"; // 대문자+숫자, 소문자 없음

        // Act
        const result = validatePassword(password);

        // Assert
        expect(result.valid).toBe(false);
      });

      it("should include a lowercase-related error message", () => {
        // Arrange
        const password = "PASSWORD1";

        // Act
        const result = validatePassword(password);

        // Assert
        expect(
          result.errors.some((e) => /소문자|lowercase/i.test(e))
        ).toBe(true);
      });
    });

    describe("error case: 숫자 누락", () => {
      it("should return valid=false when password has no digit", () => {
        // Arrange
        const password = "PasswordABC"; // 대+소문자만, 숫자 없음

        // Act
        const result = validatePassword(password);

        // Assert
        expect(result.valid).toBe(false);
      });

      it("should include a digit-related error message", () => {
        // Arrange
        const password = "PasswordABC";

        // Act
        const result = validatePassword(password);

        // Assert
        expect(
          result.errors.some((e) => /숫자|number|digit/i.test(e))
        ).toBe(true);
      });
    });

    describe("error case: 빈 입력값", () => {
      it("should return valid=false for empty string", () => {
        // Arrange
        const password = "";

        // Act
        const result = validatePassword(password);

        // Assert
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it("should return valid=false when all rules are violated simultaneously", () => {
        // Arrange
        const password = "abc"; // 길이 미달 + 대문자 없음 + 숫자 없음

        // Act
        const result = validatePassword(password);

        // Assert
        expect(result.valid).toBe(false);
        // 복수 에러가 누적되어야 한다
        expect(result.errors.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // hashPassword
  // ---------------------------------------------------------------------------

  describe("hashPassword", () => {
    it("should return a non-empty string hash", async () => {
      // Arrange
      const password = "Password1";

      // Act
      const hash = await hashPassword(password);

      // Assert
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should return a bcrypt hash starting with $2b$", async () => {
      // Arrange
      const password = "Password1";

      // Act
      const hash = await hashPassword(password);

      // Assert
      // bcrypt 해시는 $2b$ 또는 $2a$ 접두사를 갖는다
      expect(hash).toMatch(/^\$2[ab]\$/);
    });

    it("should produce a different hash on each call for the same password", async () => {
      // Arrange
      const password = "Password1";

      // Act
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Assert
      // bcrypt 솔트가 다르므로 해시값도 달라야 한다
      expect(hash1).not.toBe(hash2);
    });

    it("should never store the original password in the hash output", async () => {
      // Arrange
      const password = "Password1";

      // Act
      const hash = await hashPassword(password);

      // Assert
      expect(hash).not.toContain(password);
    });
  });

  // ---------------------------------------------------------------------------
  // comparePassword
  // ---------------------------------------------------------------------------

  describe("comparePassword", () => {
    it("should return true when plain password matches the hash", async () => {
      // Arrange
      const password = "Password1";
      const hash = await hashPassword(password);

      // Act
      const result = await comparePassword(password, hash);

      // Assert
      expect(result).toBe(true);
    });

    it("should return false when plain password does not match the hash", async () => {
      // Arrange
      const password = "Password1";
      const wrongPassword = "WrongPass2";
      const hash = await hashPassword(password);

      // Act
      const result = await comparePassword(wrongPassword, hash);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false for an empty string against a valid hash", async () => {
      // Arrange
      const password = "Password1";
      const hash = await hashPassword(password);

      // Act
      const result = await comparePassword("", hash);

      // Assert
      expect(result).toBe(false);
    });

    it("should return false when comparing against a malformed hash", async () => {
      // Arrange
      const password = "Password1";
      const malformedHash = "not-a-real-bcrypt-hash";

      // Act & Assert
      // 잘못된 해시에 대한 비교는 false를 반환하거나 에러를 던져야 한다
      await expect(
        comparePassword(password, malformedHash)
      ).rejects.toThrow();
    });
  });
});
