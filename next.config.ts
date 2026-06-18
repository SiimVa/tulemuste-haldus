import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["@auth/core", "jose"],
}

export default nextConfig
