import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ["@auth/core", "jose"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production" ? [
            { key: "Strict-Transport-Security", value: "max-age=31536000" },
          ] : []),
        ],
      },
      ...["/dashboard/:path*", "/login", "/judge/:path*", "/athlete/:path*", "/register/:path*", "/invitations/:path*"].map(source => ({
        source,
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
        ],
      })),
    ]
  },
}

export default nextConfig
