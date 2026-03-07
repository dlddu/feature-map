import { App } from "@octokit/app";
import { Octokit } from "@octokit/core";

let app: App | null = null;

function getApp(): App {
  if (!app) {
    const options: ConstructorParameters<typeof App>[0] = {
      appId: process.env.GITHUB_APP_ID || "",
      privateKey: process.env.GITHUB_PRIVATE_KEY || "",
      log: {
        debug: (msg: string) => console.log("[octokit:debug]", msg),
        info: (msg: string) => console.log("[octokit:info]", msg),
        warn: (msg: string) => console.warn("[octokit:warn]", msg),
        error: (msg: string) => console.error("[octokit:error]", msg),
      },
    };

    const apiUrl = process.env.GITHUB_API_URL;
    if (apiUrl) {
      options.Octokit = Octokit.defaults({
        baseUrl: `${apiUrl}/api/v3`,
      });
    }

    app = new App(options);
  }
  return app;
}

export async function getInstallationOctokit(installationId: number) {
  // Mock 환경: GITHUB_API_URL이 설정되면 @octokit/app의 JWT 서명을 우회하고
  // mock 서버에서 직접 토큰을 발급받아 사용
  const apiUrl = process.env.GITHUB_API_URL;
  console.log("[github/client] apiUrl:", apiUrl);
  if (apiUrl) {
    console.log(
      `[github/client] mock mode — fetching token from ${apiUrl}/api/v3/app/installations/${installationId}/access_tokens`
    );
    const tokenRes = await fetch(
      `${apiUrl}/api/v3/app/installations/${installationId}/access_tokens`,
      { method: "POST" }
    );
    const tokenData = await tokenRes.json();
    console.log("[github/client] mock token response:", JSON.stringify(tokenData));
    return new Octokit({
      auth: tokenData.token,
      baseUrl: `${apiUrl}/api/v3`,
      log: {
        debug: (msg: string) => console.log("[octokit:debug]", msg),
        info: (msg: string) => console.log("[octokit:info]", msg),
        warn: (msg: string) => console.warn("[octokit:warn]", msg),
        error: (msg: string) => console.error("[octokit:error]", msg),
      },
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
