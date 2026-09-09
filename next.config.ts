import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(import.meta.dirname),
  webpack(config, { isServer }) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@tools": path.join(import.meta.dirname, "tools"),
    };
    // TypeScript writes ".js" specifiers for ".ts" files in ESM mode; map
    // them so Next's webpack resolves the explicit-extension relative imports
    // used by the serverless API routes.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
