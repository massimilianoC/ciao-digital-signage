import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mongoose"],
  // Allow large file uploads (videos up to 100 MB) through middleware and API routes
  middlewareClientMaxBodySize: 100 * 1024 * 1024,
  experimental: {
    serverBodySizeLimit: "100mb",
  },
};

export default nextConfig;
