import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    return [
      {
        source: "/api/py/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
      {
        source: "/api/health",
        destination: `${backendUrl}/health`,
      },
    ];
  },
};

export default nextConfig;
