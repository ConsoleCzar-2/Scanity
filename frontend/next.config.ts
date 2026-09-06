import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";

// Load environment variables from the repository root .env
loadEnvConfig(path.resolve(process.cwd(), ".."));

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || process.env.APP_NAME || 'Scanity',
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || 'v1.0',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000',
    NEXT_PUBLIC_LLM_MODEL: process.env.NEXT_PUBLIC_LLM_MODEL || process.env.LLM_MODEL || 'gemini-3.5-flash-lite',
    NEXT_PUBLIC_LLM_MODEL_DISPLAY: process.env.NEXT_PUBLIC_LLM_MODEL_DISPLAY || 'Gemini 3.5 Flash Lite',
    NEXT_PUBLIC_EMBEDDING_MODEL: process.env.NEXT_PUBLIC_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
    NEXT_PUBLIC_VECTOR_DIMENSION: process.env.NEXT_PUBLIC_VECTOR_DIMENSION || process.env.VECTOR_DIMENSION || '768',
    NEXT_PUBLIC_CHUNK_SIZE_TOKENS: process.env.NEXT_PUBLIC_CHUNK_SIZE_TOKENS || '700',
    NEXT_PUBLIC_CHUNK_OVERLAP_TOKENS: process.env.NEXT_PUBLIC_CHUNK_OVERLAP_TOKENS || '100',
    NEXT_PUBLIC_MAX_FILE_SIZE_MB: process.env.NEXT_PUBLIC_MAX_FILE_SIZE_MB || '25',
    NEXT_PUBLIC_POLL_INTERVAL_MS: process.env.NEXT_PUBLIC_POLL_INTERVAL_MS || '2000',
    NEXT_PUBLIC_DEFAULT_TOP_K: process.env.NEXT_PUBLIC_DEFAULT_TOP_K || process.env.DEFAULT_TOP_K || '5',
    NEXT_PUBLIC_RELEVANCE_THRESHOLD: process.env.NEXT_PUBLIC_RELEVANCE_THRESHOLD || process.env.RELEVANCE_THRESHOLD || '0.70',
  },
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
