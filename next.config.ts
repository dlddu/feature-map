import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    MOCK_GITHUB_API_URL: process.env.MOCK_GITHUB_API_URL ?? "",
  },
};

export default nextConfig;
