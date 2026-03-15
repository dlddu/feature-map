/**
 * AES-256-GCM 암호화 유틸리티 — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/lib/crypto/aes.ts (미구현)
 *
 * 검증 항목:
 *  - encrypt / decrypt 왕복 정확성
 *  - 암호화 결과 비결정성 (동일 입력 → 다른 출력, IV 랜덤)
 *  - decrypt(encrypt(plaintext)) === plaintext
 *  - maskApiKey 형식: 접두사 보존 + "..." + 마지막 4자
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { encrypt, decrypt, maskApiKey } from "@/lib/crypto/aes";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Set ENCRYPTION_KEY for tests (32 bytes = 64 hex chars)
const TEST_ENCRYPTION_KEY =
  "0000000000000000000000000000000000000000000000000000000000000001";

describe("AES-256-GCM 암호화 유틸리티", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });
  // -------------------------------------------------------------------------
  // encrypt
  // -------------------------------------------------------------------------

  describe("encrypt", () => {
    it("평문을 암호화하면 문자열을 반환한다", () => {
      // Arrange
      const plaintext = "sk-abc123secretkey";

      // Act
      const ciphertext = encrypt(plaintext);

      // Assert
      expect(typeof ciphertext).toBe("string");
      expect(ciphertext.length).toBeGreaterThan(0);
    });

    it("암호화 결과는 평문과 다르다", () => {
      // Arrange
      const plaintext = "sk-abc123secretkey";

      // Act
      const ciphertext = encrypt(plaintext);

      // Assert
      expect(ciphertext).not.toBe(plaintext);
    });

    it("동일한 평문을 두 번 암호화하면 서로 다른 결과를 반환한다 (IV 랜덤성)", () => {
      // Arrange
      const plaintext = "sk-abc123secretkey";

      // Act
      const ciphertext1 = encrypt(plaintext);
      const ciphertext2 = encrypt(plaintext);

      // Assert
      expect(ciphertext1).not.toBe(ciphertext2);
    });

    it("빈 문자열을 암호화해도 문자열을 반환한다", () => {
      // Arrange
      const plaintext = "";

      // Act
      const ciphertext = encrypt(plaintext);

      // Assert
      expect(typeof ciphertext).toBe("string");
    });

    it("유니코드 문자열을 암호화해도 문자열을 반환한다", () => {
      // Arrange
      const plaintext = "키값-한글포함-🔑";

      // Act
      const ciphertext = encrypt(plaintext);

      // Assert
      expect(typeof ciphertext).toBe("string");
      expect(ciphertext.length).toBeGreaterThan(0);
    });

    it("긴 API 키 문자열을 암호화해도 문자열을 반환한다", () => {
      // Arrange
      const plaintext = "sk-ant-api03-" + "A".repeat(95);

      // Act
      const ciphertext = encrypt(plaintext);

      // Assert
      expect(typeof ciphertext).toBe("string");
      expect(ciphertext.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // decrypt
  // -------------------------------------------------------------------------

  describe("decrypt", () => {
    it("암호화된 값을 복호화하면 원래 평문을 반환한다 (왕복 테스트)", () => {
      // Arrange
      const plaintext = "sk-abc123secretkey";
      const ciphertext = encrypt(plaintext);

      // Act
      const result = decrypt(ciphertext);

      // Assert
      expect(result).toBe(plaintext);
    });

    it("빈 문자열을 암호화 후 복호화하면 빈 문자열을 반환한다", () => {
      // Arrange
      const plaintext = "";
      const ciphertext = encrypt(plaintext);

      // Act
      const result = decrypt(ciphertext);

      // Assert
      expect(result).toBe(plaintext);
    });

    it("유니코드 문자열을 암호화 후 복호화하면 원래 문자열을 반환한다", () => {
      // Arrange
      const plaintext = "키값-한글포함-🔑";
      const ciphertext = encrypt(plaintext);

      // Act
      const result = decrypt(ciphertext);

      // Assert
      expect(result).toBe(plaintext);
    });

    it("OpenAI API 키 형식의 문자열을 왕복하면 동일한 값을 반환한다", () => {
      // Arrange
      const plaintext = "sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdef";
      const ciphertext = encrypt(plaintext);

      // Act
      const result = decrypt(ciphertext);

      // Assert
      expect(result).toBe(plaintext);
    });

    it("Anthropic API 키 형식의 문자열을 왕복하면 동일한 값을 반환한다", () => {
      // Arrange
      const plaintext = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz_1234567890";
      const ciphertext = encrypt(plaintext);

      // Act
      const result = decrypt(ciphertext);

      // Assert
      expect(result).toBe(plaintext);
    });

    it("서로 다른 두 평문을 각각 왕복하면 각각의 원래 값을 반환한다", () => {
      // Arrange
      const plaintext1 = "sk-openai-key-001";
      const plaintext2 = "sk-anthropic-key-002";

      // Act
      const result1 = decrypt(encrypt(plaintext1));
      const result2 = decrypt(encrypt(plaintext2));

      // Assert
      expect(result1).toBe(plaintext1);
      expect(result2).toBe(plaintext2);
    });

    it("변조된 암호문을 복호화하면 예외를 던진다", () => {
      // Arrange
      const plaintext = "sk-abc123secretkey";
      const ciphertext = encrypt(plaintext);
      // 마지막 몇 글자를 변조
      const tampered = ciphertext.slice(0, -4) + "XXXX";

      // Act & Assert
      expect(() => decrypt(tampered)).toThrow();
    });

    it("완전히 유효하지 않은 문자열을 복호화하면 예외를 던진다", () => {
      // Arrange
      const invalidCiphertext = "not-a-valid-ciphertext";

      // Act & Assert
      expect(() => decrypt(invalidCiphertext)).toThrow();
    });

    it("빈 문자열을 복호화하면 예외를 던진다", () => {
      // Act & Assert
      expect(() => decrypt("")).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // maskApiKey
  // -------------------------------------------------------------------------

  describe("maskApiKey", () => {
    it("'sk-' 접두사를 보존하고 마지막 4자를 보존하며 중간을 '...'으로 마스킹한다", () => {
      // Arrange
      const apiKey = "sk-abc123def456ghi789jkl0";

      // Act
      const masked = maskApiKey(apiKey);

      // Assert
      expect(masked).toMatch(/^sk-\.\.\./);
      expect(masked.endsWith("jkl0")).toBe(true);
    });

    it("마스킹 형식이 'sk-...XXXX' 패턴을 따른다", () => {
      // Arrange
      const apiKey = "sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdef";

      // Act
      const masked = maskApiKey(apiKey);

      // Assert
      // 형식: <접두사>...<마지막4자>
      expect(masked).toMatch(/^.+\.\.\..{4}$/);
    });

    it("OpenAI 형식의 키를 마스킹하면 'sk-...' 로 시작한다", () => {
      // Arrange
      const apiKey = "sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdef";

      // Act
      const masked = maskApiKey(apiKey);

      // Assert
      expect(masked.startsWith("sk-")).toBe(true);
    });

    it("Anthropic 형식의 키를 마스킹하면 'sk-...' 로 시작한다", () => {
      // Arrange
      const apiKey = "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz_1234567890";

      // Act
      const masked = maskApiKey(apiKey);

      // Assert
      expect(masked.startsWith("sk-")).toBe(true);
    });

    it("마지막 4자가 정확히 보존된다", () => {
      // Arrange
      const apiKey = "sk-testkey7x3f";

      // Act
      const masked = maskApiKey(apiKey);

      // Assert
      expect(masked.endsWith("7x3f")).toBe(true);
    });

    it("마스킹 결과에 원래 키의 중간 부분이 포함되지 않는다", () => {
      // Arrange
      const apiKey = "sk-secretMiddlePart1234";
      const middlePart = "secretMiddlePart";

      // Act
      const masked = maskApiKey(apiKey);

      // Assert
      expect(masked).not.toContain(middlePart);
    });

    it("마스킹된 결과는 원래 키보다 짧다 (중간이 '...'으로 축약됨)", () => {
      // Arrange
      const apiKey = "sk-proj-verylongandinformativekeystring1234";

      // Act
      const masked = maskApiKey(apiKey);

      // Assert
      expect(masked.length).toBeLessThan(apiKey.length);
    });

    it("동일한 키를 두 번 마스킹하면 동일한 결과를 반환한다 (결정적)", () => {
      // Arrange
      const apiKey = "sk-abc123def456ghi789jkl0";

      // Act
      const masked1 = maskApiKey(apiKey);
      const masked2 = maskApiKey(apiKey);

      // Assert
      expect(masked1).toBe(masked2);
    });

    it("요구사항 예시 형식 'sk-...7x3f'를 만족한다", () => {
      // Arrange — 마지막 4자가 '7x3f'인 키
      const apiKey = "sk-someRandomMiddleContent7x3f";

      // Act
      const masked = maskApiKey(apiKey);

      // Assert
      expect(masked).toBe("sk-...7x3f");
    });
  });
});
