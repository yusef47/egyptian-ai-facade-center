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
