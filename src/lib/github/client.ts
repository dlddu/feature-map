import { App } from "@octokit/app";
import { Octokit } from "@octokit/core";

const GITHUB_APP_ID = process.env.GITHUB_APP_ID || "";
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY || "";
const MOCK_GITHUB_API_URL = process.env.MOCK_GITHUB_API_URL;

let app: App | null = null;

function getApp(): App {
  if (!app) {
    const options: ConstructorParameters<typeof App>[0] = {
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_PRIVATE_KEY,
    };

    if (MOCK_GITHUB_API_URL) {
      options.Octokit = Octokit.defaults({
        baseUrl: `${MOCK_GITHUB_API_URL}/api/v3`,
      });
    }

    app = new App(options);
  }
  return app;
}

export async function getInstallationOctokit(installationId: number) {
  // Mock 환경: MOCK_GITHUB_API_URL이 설정되면 @octokit/app의 JWT 서명을 우회하고
  // mock 서버에서 직접 토큰을 발급받아 사용
  if (MOCK_GITHUB_API_URL) {
    const tokenRes = await fetch(
      `${MOCK_GITHUB_API_URL}/api/v3/app/installations/${installationId}/access_tokens`,
      { method: "POST" }
    );
    const tokenData = await tokenRes.json();
    return new Octokit({
      auth: tokenData.token,
      baseUrl: `${MOCK_GITHUB_API_URL}/api/v3`,
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
