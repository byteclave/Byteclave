import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["pg"],
  transpilePackages: ["@workspace/config", "@workspace/domain", "@workspace/db"],
  allowedDevOrigins: [
    "*.replit.dev",
    "*.riker.replit.dev",
    "*.replit.app",
    "*.repl.co",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
