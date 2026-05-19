import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agent-desk/shared"],
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
