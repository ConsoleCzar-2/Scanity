export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface HealthResponse {
  status: 'ok' | 'unhealthy' | string;
  app_name: string;
  environment: string;
  database: string;
  message?: string;
  error?: string;
}

export interface DocumentResponse {
  id: string;
  original_filename: string;
  status: DocumentStatus;
  page_count: number | null;
  total_chunks: number | null;
  uploaded_at: string;
  processed_at: string | null;
  error_message?: string | null;
}

export interface DocumentUploadResponse {
  document_id: string;
  original_filename: string;
  status: DocumentStatus;
  message: string;
}

export interface DocumentStatusResponse {
  id: string;
  original_filename: string;
  status: DocumentStatus;
  page_count: number | null;
  total_chunks: number | null;
  uploaded_at: string;
  processed_at: string | null;
  error_message?: string | null;
}

export type DocumentDetailResponse = DocumentResponse;

export interface DocumentListResponse {
  total: number;
  documents: DocumentResponse[];
}

export interface CitationResponse {
  chunk_id: string;
  document_id: string;
  original_filename: string;
  page_number: number;
  snippet: string;
  relevance_score: number;
}

export interface QueryRequest {
  question: string;
  document_ids?: string[];
  top_k?: number;
  threshold?: number;
  session_id?: string;
}

export interface QueryResponse {
  query_id: string;
  question: string;
  answer: string;
  confidence: number;
  is_grounded: boolean;
  citations: CitationResponse[];
  created_at?: string;
}

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  document_filename: string;
  page_number: number;
  chunk_index: number;
  content: string;
  similarity_score: number;
}

export interface RetrievalResult {
  query_text: string;
  meets_threshold: boolean;
  threshold: number;
  top_similarity: number;
  total_retrieved: number;
  chunks: RetrievedChunk[];
}
