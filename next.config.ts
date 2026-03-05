import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    GITHUB_API_URL: process.env.GITHUB_API_URL ?? "",
  },
};

export default nextConfig;
