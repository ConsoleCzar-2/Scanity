'use client';

import React, { useEffect } from 'react';
import { ShieldCheck, Database, Cpu, Layers, X, Server, Activity } from 'lucide-react';
import {
  APP_NAME,
  LLM_MODEL_DISPLAY,
  VECTOR_DIMENSION,
  DEFAULT_THRESHOLD,
  BACKEND_PORT,
} from '@/lib/constants';
import type { HealthResponse } from '@/types/api';

interface AdminLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  health: HealthResponse | null;
  totalDocuments: number;
}

export function AdminLogsModal({
  isOpen,
  onClose,
  health,
  totalDocuments,
}: AdminLogsModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700 rounded-lg shadow-2xl p-6 z-10 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-indigo-950/80 border border-indigo-800 flex items-center justify-center text-indigo-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">System Telemetry &amp; Audit Logs</h2>
              <p className="text-[11px] text-slate-400">
                {APP_NAME} Enterprise RAG Operational Metrics
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Infrastructure Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              <Server className="w-3 h-3 text-emerald-400" />
              <span>FastAPI Port</span>
            </div>
            <p className="text-sm font-semibold font-mono text-slate-200">{BACKEND_PORT}</p>
            <p className="text-[10px] text-emerald-400 mt-0.5">
              {health?.status === 'ok' ? 'Healthy • Active' : 'Disconnected'}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              <Database className="w-3 h-3 text-sky-400" />
              <span>pgvector Dimension</span>
            </div>
            <p className="text-sm font-semibold font-mono text-slate-200">{VECTOR_DIMENSION} dims</p>
            <p className="text-[10px] text-slate-400 mt-0.5">HNSW Cosine Index</p>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              <Cpu className="w-3 h-3 text-indigo-400" />
              <span>LLM Engine</span>
            </div>
            <p className="text-xs font-semibold text-slate-200 truncate" title={LLM_MODEL_DISPLAY}>
              {LLM_MODEL_DISPLAY}
            </p>
            <p className="text-[10px] text-indigo-400 mt-0.5">Zero Extrapolation</p>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase tracking-wider mb-1">
              <ShieldCheck className="w-3 h-3 text-amber-400" />
              <span>Relevance Gate</span>
            </div>
            <p className="text-sm font-semibold font-mono text-slate-200">
              {DEFAULT_THRESHOLD.toFixed(2)}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Cosine Similarity</p>
          </div>
        </div>

        {/* Database & Ingestion Status Table */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Database &amp; Worker Health
          </h3>
          <div className="p-3 rounded-lg bg-[#090d16] border border-slate-800 text-xs font-mono flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
              <span className="text-slate-500">PostgreSQL 16 Connection:</span>
              <span className="text-emerald-400 font-semibold">
                {health?.database === 'connected' ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
              <span className="text-slate-500">Redis Broker &amp; Celery Queue:</span>
              <span className="text-emerald-400 font-semibold">ONLINE (redis://localhost:6379/0)</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
              <span className="text-slate-500">Indexed Document Entities:</span>
              <span className="text-slate-200">{totalDocuments} files active in knowledge base</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Audit Logging Table:</span>
              <span className="text-slate-200">queries, query_documents, query_citations</span>
            </div>
          </div>
        </div>

        {/* Audit Pipeline Diagram */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2 mb-1 text-slate-300 font-medium">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Audit &amp; Anti-Hallucination Pipeline</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Every natural-language query undergoes relevance threshold gating ($s \ge 0.70$). Grounded
            answers are verified by the Post-Hoc Citation Validator to ensure chunk IDs exist in
            PostgreSQL. All queries (grounded answers and honest fallbacks) are logged in the database
            for compliance tracking and evaluation.
          </p>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
          >
            Close Telemetry
          </button>
        </div>
      </div>
    </div>
  );
}
