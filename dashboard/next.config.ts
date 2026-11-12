import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["node:sqlite"],
  // A hosted demo ships a copy of the results database and of the backend's option lists (both
  // gitignored; DEPLOY.md) with the build; without this, the server bundle leaves the files out.
  outputFileTracingIncludes: {
    "/": ["./data/results.sqlite"],
    "/api/backend/[...path]": ["./data/backend-snapshot.json"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push("node:sqlite");
    }
    return config;
  },
};

export default nextConfig;
