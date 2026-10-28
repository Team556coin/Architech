import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": ["../../packages/db/migrations/**/*"],
  },
  transpilePackages: ["@architech/core", "@architech/measure", "@architech/ui", "@architech/ai", "@architech/imaging", "@architech/db"],
  serverExternalPackages: ["sharp", "postgres", "exifr"],
  poweredByHeader: false,
  devIndicators: false,
  allowedDevOrigins: ["10.0.2.2", "192.168.*.*", "10.*.*.*", "172.16.*.*"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
