export const APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME || 'Scanity';

export const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION || 'v1.0';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export const BACKEND_PORT = (() => {
  try {
    const url = new URL(BACKEND_URL);
    return url.port || (url.protocol === 'https:' ? '443' : '80');
  } catch {
    return '8000';
  }
})();

export const LLM_MODEL =
  process.env.NEXT_PUBLIC_LLM_MODEL || 'gemini-3.5-flash-lite';

export const LLM_MODEL_DISPLAY =
  process.env.NEXT_PUBLIC_LLM_MODEL_DISPLAY ||
  (LLM_MODEL === 'gemini-3.5-flash-lite' ? 'Gemini 3.5 Flash Lite' : LLM_MODEL);

export const EMBEDDING_MODEL =
  process.env.NEXT_PUBLIC_EMBEDDING_MODEL || 'gemini-embedding-001';

export const VECTOR_DIMENSION =
  Number(process.env.NEXT_PUBLIC_VECTOR_DIMENSION) || 768;

export const CHUNK_SIZE_TOKENS =
  Number(process.env.NEXT_PUBLIC_CHUNK_SIZE_TOKENS) || 700;

export const CHUNK_OVERLAP_TOKENS =
  Number(process.env.NEXT_PUBLIC_CHUNK_OVERLAP_TOKENS) || 100;

export const MAX_FILE_SIZE_MB =
  Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE_MB) || 25;

export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const POLLING_INTERVAL_MS =
  Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || 2000;

export const DEFAULT_TOP_K =
  Number(process.env.NEXT_PUBLIC_DEFAULT_TOP_K) || 5;

export const DEFAULT_THRESHOLD =
  Number(process.env.NEXT_PUBLIC_RELEVANCE_THRESHOLD) || 0.70;

export const ALLOWED_MIME_TYPES = ['application/pdf'];
