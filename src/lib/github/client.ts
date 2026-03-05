import { App } from "@octokit/app";
import { Octokit } from "@octokit/core";

// Next.js 번들러가 process.env.X를 빌드 타임에 인라인하는 것을 방지하기 위해
// 간접 참조를 사용합니다. 이렇게 하면 런타임에 실제 환경변수를 읽습니다.
const env = process.env;

function getGithubApiUrl(): string | undefined {
  return env["GITHUB_API_URL"];
}

let app: App | null = null;

function getApp(): App {
  if (!app) {
    const appId = env["GITHUB_APP_ID"] || "";
    const privateKey = env["GITHUB_PRIVATE_KEY"] || "";
    const githubApiUrl = getGithubApiUrl();

    const options: ConstructorParameters<typeof App>[0] = {
      appId,
      privateKey,
    };

    if (githubApiUrl) {
      options.Octokit = Octokit.defaults({
        baseUrl: `${githubApiUrl}/api/v3`,
      });
    }

    app = new App(options);
  }
  return app;
}

export async function getInstallationOctokit(installationId: number) {
  const githubApiUrl = getGithubApiUrl();

  // Mock 환경: GITHUB_API_URL이 설정되면 @octokit/app의 JWT 서명을 우회하고
  // mock 서버에서 직접 토큰을 발급받아 사용
  if (githubApiUrl) {
    const tokenUrl = `${githubApiUrl}/api/v3/app/installations/${installationId}/access_tokens`;
    const tokenRes = await fetch(tokenUrl, { method: "POST" });
    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "(read failed)");
      throw new Error(
        `Token fetch failed: ${tokenRes.status} ${tokenRes.statusText} from ${tokenUrl} — ${body}`
      );
    }
    const tokenData = await tokenRes.json();
    return new Octokit({
      auth: tokenData.token,
      baseUrl: `${githubApiUrl}/api/v3`,
    });
  }

  const githubApp = getApp();
  return githubApp.getInstallationOctokit(installationId);
}

export async function getRepository(
  installationId: number,
  owner: string,
  repo: string
) {
  const octokit = await getInstallationOctokit(installationId);
  const { data } = await octokit.request("GET /repos/{owner}/{repo}", {
    owner,
    repo,
  });
  return data;
}
