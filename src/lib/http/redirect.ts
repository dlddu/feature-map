/**
 * HTTP(S) GET 요청의 리다이렉트 Location 헤더를 추출합니다.
 * fetch + redirect:"manual" + cache:"no-store" 조합으로
 * Next.js fetch 캐싱을 우회하면서 리다이렉트 응답을 직접 처리합니다.
 */
export async function getRedirectLocation(
  url: string
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status >= 300 && response.status < 400) {
      return response.headers.get("location");
    }
    return null;
  } catch {
    return null;
  }
}
