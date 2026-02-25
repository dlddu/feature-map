/**
 * Mock GitHub API 서버 (DLD-610)
 *
 * 지원 엔드포인트:
 * - GET /health
 * - GET /api/v3/installation/repositories - 레포 목록
 * - GET /api/v3/repos/:owner/:repo/git/trees/:sha - 파일 트리
 * - GET /api/v3/repos/:owner/:repo/git/blobs/:sha - 파일 내용
 * - GET /api/v3/repos/:owner/:repo/commits - 커밋 목록
 * - POST /api/v3/app/installations/:installationId/access_tokens - 설치 토큰
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../../fixtures/github");

const PORT = parseInt(process.env.PORT ?? "3101", 10);

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

const repos = loadFixture("repos.json");
const tree = loadFixture("tree.json");
const fileContents = loadFixture("file-contents.json");

function send(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "X-GitHub-Request-Id": `mock-${Date.now()}`,
  });
  res.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Health check
  if (req.method === "GET" && pathname === "/health") {
    return send(res, 200, { status: "ok", server: "mock-github" });
  }

  // Installation access token (GitHub App 인증용)
  if (
    req.method === "POST" &&
    pathname.match(/^\/api\/v3\/app\/installations\/\d+\/access_tokens$/)
  ) {
    return send(res, 201, {
      token: "mock-installation-token-v1",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      permissions: { contents: "read", metadata: "read" },
    });
  }

  // 레포 목록
  if (
    req.method === "GET" &&
    pathname === "/api/v3/installation/repositories"
  ) {
    return send(res, 200, {
      total_count: repos.length,
      repositories: repos,
    });
  }

  // 특정 레포 정보
  const repoMatch = pathname.match(/^\/api\/v3\/repos\/([^/]+)\/([^/]+)$/);
  if (req.method === "GET" && repoMatch) {
    const fullName = `${repoMatch[1]}/${repoMatch[2]}`;
    const repo = repos.find((r) => r.full_name === fullName);
    if (!repo) return send(res, 404, { message: "Not Found" });
    return send(res, 200, repo);
  }

  // 파일 트리
  const treeMatch = pathname.match(
    /^\/api\/v3\/repos\/([^/]+)\/([^/]+)\/git\/trees\/(.+)$/
  );
  if (req.method === "GET" && treeMatch) {
    const recursive = url.searchParams.get("recursive") === "1";
    const response = recursive
      ? tree
      : { ...tree, tree: tree.tree.filter((n) => !n.path.includes("/")) };
    return send(res, 200, response);
  }

  // 파일 내용 (blob)
  const blobMatch = pathname.match(
    /^\/api\/v3\/repos\/([^/]+)\/([^/]+)\/git\/blobs\/(.+)$/
  );
  if (req.method === "GET" && blobMatch) {
    const sha = blobMatch[3];
    const blob = fileContents[sha];
    if (!blob) {
      // sha를 모르는 파일은 빈 내용으로 반환
      return send(res, 200, {
        content: Buffer.from("// mock file content").toString("base64"),
        encoding: "base64",
        sha,
        size: 20,
        url: req.url,
        node_id: `B_mock_${sha}`,
      });
    }
    return send(res, 200, blob);
  }

  // 커밋 목록
  const commitsMatch = pathname.match(
    /^\/api\/v3\/repos\/([^/]+)\/([^/]+)\/commits$/
  );
  if (req.method === "GET" && commitsMatch) {
    return send(res, 200, [
      {
        sha: "abc123def456abc123def456abc123def456abc1",
        commit: {
          message: "Initial commit",
          author: {
            name: "Test Author",
            email: "test@example.com",
            date: "2025-01-01T00:00:00Z",
          },
        },
      },
    ]);
  }

  // 404 fallback
  send(res, 404, { message: `Not Found: ${pathname}` });
});

server.listen(PORT, () => {
  console.log(`Mock GitHub server listening on port ${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
