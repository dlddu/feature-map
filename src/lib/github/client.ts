import { App } from "@octokit/app";
import { Octokit } from "@octokit/core";

const GITHUB_APP_ID = process.env.GITHUB_APP_ID || "";
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY || "";
const GITHUB_API_URL = process.env.GITHUB_API_URL || "";

let app: App | null = null;

function getApp(): App {
  if (!app) {
    const options: ConstructorParameters<typeof App>[0] = {
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_PRIVATE_KEY,
    };

    if (GITHUB_API_URL) {
      options.Octokit = Octokit.defaults({
        baseUrl: `${GITHUB_API_URL}/api/v3`,
      });
    }

    app = new App(options);
  }
  return app;
}

export async function getInstallationOctokit(installationId: number) {
  // Mock 환경: GITHUB_API_URL이 설정되면 @octokit/app의 JWT 서명을 우회하고
  // mock 서버에서 직접 토큰을 발급받아 사용
  if (GITHUB_API_URL) {
    const tokenUrl = `${GITHUB_API_URL}/api/v3/app/installations/${installationId}/access_tokens`;
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
      baseUrl: `${GITHUB_API_URL}/api/v3`,
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
