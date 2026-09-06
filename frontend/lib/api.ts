import { API_BASE_URL, BACKEND_URL } from './constants';
import type {
  DocumentListResponse,
  DocumentStatusResponse,
  DocumentUploadResponse,
  HealthResponse,
  QueryRequest,
  QueryResponse,
} from '../types/api';

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const errorMsg =
        typeof data === 'object' && data !== null && 'detail' in data
          ? String((data as { detail: unknown }).detail)
          : `Request failed with status ${res.status}`;
      throw new ApiError(errorMsg, res.status, data);
    }

    return data as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Network error';
    throw new ApiError(message, 0);
  }
}

export const api = {
  /**
   * Pings backend health endpoint to check API server and PostgreSQL connectivity.
   */
  async checkHealth(): Promise<HealthResponse> {
    try {
      return await request<HealthResponse>(`${API_BASE_URL}/health`);
    } catch {
      // Fallback to root health endpoint if versioned endpoint is unavailable
      return await request<HealthResponse>(`${BACKEND_URL}/health`);
    }
  },

  /**
   * Uploads a PDF document to the ingestion queue.
   */
  async uploadDocument(file: File): Promise<DocumentUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return request<DocumentUploadResponse>(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      body: formData,
    });
  },

  /**
   * Polls the parsing, chunking, and embedding status of an uploaded document.
   */
  async pollDocumentStatus(documentId: string): Promise<DocumentStatusResponse> {
    return request<DocumentStatusResponse>(`${API_BASE_URL}/documents/${documentId}/status`);
  },

  /**
   * Alias for pollDocumentStatus to fetch current document status.
   */
  async getDocumentStatus(documentId: string): Promise<DocumentStatusResponse> {
    return this.pollDocumentStatus(documentId);
  },

  /**
   * Fetches a paginated list of uploaded documents.
   */
  async listDocuments(skip: number = 0, limit: number = 50): Promise<DocumentListResponse> {
    return request<DocumentListResponse>(`${API_BASE_URL}/documents?skip=${skip}&limit=${limit}`);
  },

  /**
   * Deletes a document and its cascading vector embeddings.
   */
  async deleteDocument(documentId: string): Promise<{ status: string; message: string }> {
    return request<{ status: string; message: string }>(`${API_BASE_URL}/documents/${documentId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Sends a user question to the grounded RAG generation engine.
   */
  async askQuestion(req: QueryRequest): Promise<QueryResponse> {
    return request<QueryResponse>(`${API_BASE_URL}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
    });
  },
};
