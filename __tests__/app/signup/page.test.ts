/**
 * 회원가입 페이지 로직 단위 테스트
 *
 * 검증 대상: src/app/signup/page.tsx 에서 추출될 순수 함수 / 상태 로직
 * - src/app/signup/formState.ts (또는 page.tsx에서 export된 헬퍼)
 *   · buildRegisterPayload: 폼 입력값 → API 요청 페이로드 변환
 *   · parseRegisterError: API 응답 → 인라인 에러 메시지 변환
 *   · isLoadingState, isSuccessState: 상태 판별 유틸
 *
 * 참고:
 * - jest.config.ts의 testEnvironment가 "node"이므로 DOM 관련 테스트는 Playwright E2E에서 수행한다.
 * - 여기서는 Next.js 서버 컴포넌트/클라이언트 훅 없이 테스트 가능한 순수 로직만 다룬다.
 * - UI 렌더링 검증(label "이메일", 스피너, red-400 색상 등)은 test/e2e/auth.test.ts에서 수행한다.
 *
 * NOTE: TDD Red Phase - 구현 전 작성된 테스트이므로 현재 실패 상태가 정상입니다.
 */

import {
  buildRegisterPayload,
  parseRegisterError,
  type SignupFormState,
} from "@/app/signup/formState";

describe("회원가입 폼 상태 로직", () => {
  // -------------------------------------------------------------------------
  // buildRegisterPayload
  // -------------------------------------------------------------------------

  describe("buildRegisterPayload", () => {
    it("should return an object with email and password from form inputs", () => {
      // Arrange
      const email = "user@example.com";
      const password = "Password1";

      // Act
      const payload = buildRegisterPayload(email, password);

      // Assert
      expect(payload).toEqual({ email, password });
    });

    it("should trim leading and trailing whitespace from email", () => {
      // Arrange
      const rawEmail = "  user@example.com  ";

      // Act
      const payload = buildRegisterPayload(rawEmail, "Password1");

      // Assert
      expect(payload.email).toBe("user@example.com");
    });

    it("should not modify the password value", () => {
      // Arrange
      const password = "  Password1  "; // 비밀번호 공백은 의도적일 수 있음

      // Act
      const payload = buildRegisterPayload("user@example.com", password);

      // Assert
      expect(payload.password).toBe(password);
    });
  });

  // -------------------------------------------------------------------------
  // parseRegisterError
  // -------------------------------------------------------------------------

  describe("parseRegisterError", () => {
    describe("409 Conflict: 이메일 중복", () => {
      it("should return an emailError when API responds with 409", () => {
        // Arrange
        const apiResponse = {
          status: 409,
          body: { error: "이미 사용 중인 이메일입니다." },
        };

        // Act
        const result = parseRegisterError(apiResponse);

        // Assert
        expect(result.emailError).toBeTruthy();
        expect(result.passwordError).toBeFalsy();
      });

      it("should use the server error message as the emailError text", () => {
        // Arrange
        const errorMessage = "이미 사용 중인 이메일입니다.";
        const apiResponse = {
          status: 409,
          body: { error: errorMessage },
        };

        // Act
        const result = parseRegisterError(apiResponse);

        // Assert
        expect(result.emailError).toBe(errorMessage);
      });
    });

    describe("422 Unprocessable Entity: 비밀번호 정책 위반", () => {
      it("should return a passwordError when API responds with 422", () => {
        // Arrange
        const apiResponse = {
          status: 422,
          body: { error: "비밀번호는 8자 이상이어야 합니다." },
        };

        // Act
        const result = parseRegisterError(apiResponse);

        // Assert
        expect(result.passwordError).toBeTruthy();
        expect(result.emailError).toBeFalsy();
      });

      it("should use the server error message as the passwordError text", () => {
        // Arrange
        const errorMessage = "비밀번호는 8자 이상이어야 합니다.";
        const apiResponse = {
          status: 422,
          body: { error: errorMessage },
        };

        // Act
        const result = parseRegisterError(apiResponse);

        // Assert
        expect(result.passwordError).toBe(errorMessage);
      });
    });

    describe("400 Bad Request: 잘못된 요청", () => {
      it("should return a generalError when API responds with 400", () => {
        // Arrange
        const apiResponse = {
          status: 400,
          body: { error: "이메일 형식이 올바르지 않습니다." },
        };

        // Act
        const result = parseRegisterError(apiResponse);

        // Assert
        expect(result.generalError).toBeTruthy();
      });
    });

    describe("500 Internal Server Error", () => {
      it("should return a generalError when API responds with 500", () => {
        // Arrange
        const apiResponse = {
          status: 500,
          body: { error: "서버 오류가 발생했습니다." },
        };

        // Act
        const result = parseRegisterError(apiResponse);

        // Assert
        expect(result.generalError).toBeTruthy();
      });

      it("should return a fallback generalError message when body is empty", () => {
        // Arrange
        const apiResponse = {
          status: 500,
          body: {},
        };

        // Act
        const result = parseRegisterError(apiResponse);

        // Assert
        expect(typeof result.generalError).toBe("string");
        expect(result.generalError!.length).toBeGreaterThan(0);
      });
    });

    describe("네트워크 오류 (status 0)", () => {
      it("should return a generalError when network request fails", () => {
        // Arrange
        const networkErrorResponse = {
          status: 0,
          body: {},
        };

        // Act
        const result = parseRegisterError(networkErrorResponse);

        // Assert
        expect(result.generalError).toBeTruthy();
      });
    });
  });

  // -------------------------------------------------------------------------
  // SignupFormState 초기값 및 상태 전이
  // -------------------------------------------------------------------------

  describe("SignupFormState 타입 구조", () => {
    it("should allow idle state with no errors", () => {
      // Arrange
      const idleState: SignupFormState = {
        status: "idle",
        emailError: null,
        passwordError: null,
        generalError: null,
      };

      // Assert
      expect(idleState.status).toBe("idle");
      expect(idleState.emailError).toBeNull();
      expect(idleState.passwordError).toBeNull();
      expect(idleState.generalError).toBeNull();
    });

    it("should allow loading state", () => {
      // Arrange
      const loadingState: SignupFormState = {
        status: "loading",
        emailError: null,
        passwordError: null,
        generalError: null,
      };

      // Assert
      expect(loadingState.status).toBe("loading");
    });

    it("should allow error state with an emailError", () => {
      // Arrange
      const errorState: SignupFormState = {
        status: "error",
        emailError: "이미 사용 중인 이메일입니다.",
        passwordError: null,
        generalError: null,
      };

      // Assert
      expect(errorState.status).toBe("error");
      expect(errorState.emailError).toBeTruthy();
    });

    it("should allow error state with a passwordError", () => {
      // Arrange
      const errorState: SignupFormState = {
        status: "error",
        emailError: null,
        passwordError: "비밀번호는 8자 이상이어야 합니다.",
        generalError: null,
      };

      // Assert
      expect(errorState.status).toBe("error");
      expect(errorState.passwordError).toBeTruthy();
    });

    it("should allow success state", () => {
      // Arrange
      const successState: SignupFormState = {
        status: "success",
        emailError: null,
        passwordError: null,
        generalError: null,
      };

      // Assert
      expect(successState.status).toBe("success");
    });
  });
});
