import { App } from "@octokit/app";

const GITHUB_APP_ID = process.env.GITHUB_APP_ID || "";
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY || "";

let app: App | null = null;

function getApp(): App {
  if (!app) {
    app = new App({
      appId: GITHUB_APP_ID,
      privateKey: GITHUB_PRIVATE_KEY,
    });
  }
  return app;
}

export async function getInstallationOctokit(installationId: number) {
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
