/**
 * 회원가입 폼 상태 로직
 * - buildRegisterPayload: 폼 입력값 → API 요청 페이로드 변환
 * - parseRegisterError: API 응답 → 인라인 에러 메시지 변환
 * - SignupFormState: 폼 상태 타입
 */

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export type SignupFormStatus = "idle" | "loading" | "error" | "success";

export interface SignupFormState {
  status: SignupFormStatus;
  emailError: string | null;
  passwordError: string | null;
  generalError: string | null;
}

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface ApiErrorResponse {
  status: number;
  body: { error?: string };
}

export interface ParsedRegisterError {
  emailError?: string;
  passwordError?: string;
  generalError?: string;
}

// ---------------------------------------------------------------------------
// 함수 구현
// ---------------------------------------------------------------------------

/**
 * 폼 입력값을 API 요청 페이로드로 변환
 * - 이메일 앞뒤 공백 제거
 * - 비밀번호는 그대로 유지 (공백이 의도적일 수 있음)
 */
export function buildRegisterPayload(
  email: string,
  password: string
): RegisterPayload {
  return {
    email: email.trim(),
    password,
  };
}

/**
 * API 응답을 인라인 에러 메시지로 변환
 * - 409: 이메일 중복 → emailError
 * - 422: 비밀번호 정책 위반 → passwordError
 * - 400, 500, 0(네트워크 오류): → generalError
 */
export function parseRegisterError(
  response: ApiErrorResponse
): ParsedRegisterError {
  const { status, body } = response;

  if (status === 409) {
    return {
      emailError: body.error || "이미 사용 중인 이메일입니다.",
    };
  }

  if (status === 422) {
    return {
      passwordError: body.error || "비밀번호가 정책을 위반합니다.",
    };
  }

  // 400, 500, 0(네트워크 오류) 등 그 외 모든 경우
  return {
    generalError: body.error || "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
  };
}
