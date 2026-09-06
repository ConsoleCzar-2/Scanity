'use client';

import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import type { DocumentStatus } from '@/types/api';

interface StatusBadgeProps {
  status: DocumentStatus;
  errorMessage?: string | null;
  className?: string;
}

export function StatusBadge({ status, errorMessage, className = '' }: StatusBadgeProps) {
  switch (status) {
    case 'pending':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/40 text-amber-300 border border-amber-800/60 ${className}`}
          title="Queued in Redis message broker awaiting worker"
        >
          <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
          <span>Pending</span>
        </span>
      );

    case 'processing':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-950/40 text-indigo-300 border border-indigo-800/60 ${className}`}
          title="Parsing PDF pages, chunking text, and computing 768-dim embeddings"
        >
          <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
          <span>Processing</span>
        </span>
      );

    case 'ready':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/40 text-emerald-300 border border-emerald-800/60 ${className}`}
          title="Indexed in PostgreSQL with pgvector HNSW index"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>Ready</span>
        </span>
      );

    case 'failed':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-950/40 text-rose-300 border border-rose-800/60 ${className}`}
          title={errorMessage || 'Ingestion failed'}
        >
          <AlertCircle className="w-3 h-3 text-rose-400" />
          <span>Failed</span>
        </span>
      );

    default:
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700 ${className}`}
        >
          {status}
        </span>
      );
  }
}
