import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This checkout can live deep inside a home directory that has its own
  // lockfile; without an explicit root Turbopack infers that folder instead.
  turbopack: { root: process.cwd() },
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default nextConfig;
