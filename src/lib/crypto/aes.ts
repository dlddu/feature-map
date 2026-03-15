import crypto from "crypto";

// ENCRYPTION_KEY: 32 bytes = 64 hex chars
function getKeyBuffer(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
  }
  const key = Buffer.from(envKey, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex characters)");
  }
  return key;
}

/**
 * AES-256-GCM 암호화
 * Format: base64(iv[12] + authTag[16] + ciphertext)
 */
export function encrypt(plaintext: string): string {
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine: iv (12 bytes) + authTag (16 bytes) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * AES-256-GCM 복호화
 * Throws on invalid/tampered ciphertext
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error("Ciphertext is required");
  }

  let combined: Buffer;
  try {
    combined = Buffer.from(ciphertext, "base64");
  } catch {
    throw new Error("Invalid ciphertext: failed to decode base64");
  }

  // Minimum length: iv (12) + authTag (16) = 28 bytes
  if (combined.length < 28) {
    throw new Error("Invalid ciphertext: too short");
  }

  const key = getKeyBuffer();
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const encrypted = combined.subarray(28);

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (err) {
    throw new Error(
      `Decryption failed: ${err instanceof Error ? err.message : "authentication tag mismatch"}`
    );
  }
}

/**
 * API 키 마스킹
 * Format: <prefix>...<last4>
 * Example: "sk-someRandomMiddleContent7x3f" → "sk-...7x3f"
 */
export function maskApiKey(apiKey: string): string {
  const prefix = "sk-";
  const last4 = apiKey.slice(-4);
  return `${prefix}...${last4}`;
}
