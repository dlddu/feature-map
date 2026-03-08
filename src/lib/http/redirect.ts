import http from "node:http";
import https from "node:https";

/**
 * HTTP(S) GET 요청의 리다이렉트 Location 헤더를 추출합니다.
 * Node.js http/https 모듈을 직접 사용하여 Next.js fetch 패칭 영향을 받지 않습니다.
 */
export function getRedirectLocation(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
        resolve(res.headers.location ?? null);
      } else {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
  });
}
