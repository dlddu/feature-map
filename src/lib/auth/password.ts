import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 10;

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 비밀번호 정책 검증
 * - 8자 이상
 * - 대문자 포함
 * - 소문자 포함
 * - 숫자 포함
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("비밀번호는 8자 이상이어야 합니다.");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("비밀번호는 대문자(uppercase)를 포함해야 합니다.");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("비밀번호는 소문자(lowercase)를 포함해야 합니다.");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("비밀번호는 숫자(digit)를 포함해야 합니다.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * bcrypt로 비밀번호 해싱
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * 평문 비밀번호와 bcrypt 해시 비교
 * 잘못된 해시 형식의 경우 에러를 던진다.
 */
export async function comparePassword(
  plainPassword: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}
