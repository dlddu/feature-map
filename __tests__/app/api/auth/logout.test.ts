/**
 * POST /api/auth/logout — Unit Tests (TDD Red Phase)
 *
 * 테스트 대상: src/app/api/auth/logout/route.ts
 *
 * Mock 전략:
 *  - 로그아웃은 DB/토큰 의존성 없이 쿠키 삭제만 수행하므로 별도 mock 불필요
 *  - 쿠키 삭제는 Set-Cookie 헤더에 maxAge=0 설정 여부로 검증
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/auth/logout/route";

// ---------------------------------------------------------------------------
// 유틸: NextRequest 생성 헬퍼
// ---------------------------------------------------------------------------

function makeRequest(cookieHeader?: string): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  return new NextRequest("http://localhost:3000/api/auth/logout", {
    method: "POST",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  // -------------------------------------------------------------------------
  // Happy Path
  // -------------------------------------------------------------------------

  describe("성공 케이스 (happy path)", () => {
    it("200 상태 코드를 반환한다", async () => {
      // Arrange
      const request = makeRequest(
        "access_token=sometoken; refresh_token=somerefreshtoken"
      );

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("쿠키 없이 요청해도 200을 반환한다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
    });

    it("Set-Cookie 헤더에 access_token 삭제 지시가 포함된다 (Max-Age=0)", async () => {
      // Arrange
      const request = makeRequest(
        "access_token=sometoken; refresh_token=somerefreshtoken"
      );

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain("access_token=");
      expect(setCookie?.toLowerCase()).toMatch(/max-age=0/);
    });

    it("Set-Cookie 헤더에 refresh_token 삭제 지시가 포함된다 (Max-Age=0)", async () => {
      // Arrange
      const request = makeRequest(
        "access_token=sometoken; refresh_token=somerefreshtoken"
      );

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain("refresh_token=");
      expect(setCookie?.toLowerCase()).toMatch(/max-age=0/);
    });

    it("삭제 쿠키에 Path=/ 속성이 설정된다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).toContain("Path=/");
    });

    it("삭제 쿠키에 HttpOnly 속성이 설정된다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie?.toLowerCase()).toContain("httponly");
    });

    it("응답 body에 성공 메시지 또는 빈 body를 반환한다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await POST(request);

      // Assert — 200이고 body 파싱이 가능하거나 비어 있어야 함
      expect(response.status).toBe(200);
      // body가 JSON이면 error 필드가 없어야 함
      const text = await response.text();
      if (text) {
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          // 비어 있는 응답도 허용
        }
        if (body !== undefined) {
          expect(body).not.toHaveProperty("error");
        }
      }
    });

    it("응답 Content-Type이 application/json이다", async () => {
      // Arrange
      const request = makeRequest();

      // Act
      const response = await POST(request);

      // Assert
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("application/json");
    });
  });

  // -------------------------------------------------------------------------
  // 엣지 케이스
  // -------------------------------------------------------------------------

  describe("엣지 케이스", () => {
    it("access_token 쿠키만 있을 때도 두 쿠키 모두 삭제 헤더를 설정한다", async () => {
      // Arrange
      const request = makeRequest("access_token=sometoken");

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).toContain("access_token=");
      expect(setCookie).toContain("refresh_token=");
    });

    it("refresh_token 쿠키만 있을 때도 두 쿠키 모두 삭제 헤더를 설정한다", async () => {
      // Arrange
      const request = makeRequest("refresh_token=somerefreshtoken");

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert
      expect(setCookie).toContain("access_token=");
      expect(setCookie).toContain("refresh_token=");
    });

    it("로그아웃 후 쿠키 값이 빈 문자열이거나 무효 값이어야 한다", async () => {
      // Arrange
      const request = makeRequest("access_token=validtoken");

      // Act
      const response = await POST(request);
      const setCookie = response.headers.get("set-cookie");

      // Assert — access_token= 이후 값이 실제 토큰을 포함하지 않아야 함
      // Max-Age=0 또는 Expires를 과거로 설정하여 삭제
      expect(setCookie?.toLowerCase()).toMatch(/max-age=0|expires=.+thu, 01 jan 1970/);
    });
  });
});
