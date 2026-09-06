'use client';

import { useEffect, useState } from 'react';
import {
  Sparkles,
  ShieldCheck,
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  Database,
  Cpu,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { HealthResponse } from '@/types/api';
import {
  APP_NAME,
  APP_VERSION,
  BACKEND_PORT,
  LLM_MODEL_DISPLAY,
  VECTOR_DIMENSION,
  CHUNK_SIZE_TOKENS,
  MAX_FILE_SIZE_MB,
  DEFAULT_THRESHOLD,
} from '@/lib/constants';

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setHealthLoading(true);
    try {
      const data = await api.checkHealth();
      setHealth(data);
      setHealthError(null);
    } catch (err: unknown) {
      setHealth(null);
      const msg = err instanceof Error ? err.message : 'Backend unreachable';
      setHealthError(msg);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function loadInitialHealth() {
      try {
        const data = await api.checkHealth();
        if (isMounted) {
          setHealth(data);
          setHealthError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setHealth(null);
          const msg = err instanceof Error ? err.message : 'Backend unreachable';
          setHealthError(msg);
        }
      } finally {
        if (isMounted) {
          setHealthLoading(false);
        }
      }
    }

    loadInitialHealth();
    const interval = setInterval(loadInitialHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#090d16]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">{APP_NAME}</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  RAG {APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Enterprise AI-Powered Document Q&amp;A
              </p>
            </div>
          </div>

          {/* Model & Infrastructure Badges */}
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>{LLM_MODEL_DISPLAY}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span>pgvector ({VECTOR_DIMENSION}-dim HNSW)</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Celery + Redis</span>
            </div>
          </div>

          {/* Live Backend Health Probe Badge */}
          <div className="flex items-center gap-2">
            {healthLoading && !health ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span className="hidden sm:inline">Connecting to Backend...</span>
              </div>
            ) : health?.status === 'ok' ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-medium">Backend Connected (Port {BACKEND_PORT})</span>
                <button
                  onClick={handleRefresh}
                  title="Refresh status"
                  className="text-emerald-400 hover:text-emerald-200 transition-colors ml-1"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300"
                title={healthError || 'Backend unreachable'}
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Backend Disconnected</span>
                <button
                  onClick={handleRefresh}
                  className="underline hover:text-white transition-colors ml-1"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Document Ingestion & Management (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="glass-panel rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <h2 className="font-semibold text-slate-100 text-base">
                    Document Knowledge Base
                  </h2>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Upload enterprise PDFs to asynchronously parse, chunk (~{CHUNK_SIZE_TOKENS} tokens), and index with
                pgvector embeddings for grounded retrieval.
              </p>

              {/* Upload Dropzone Preview Card */}
              <div className="border-2 border-dashed border-slate-700/80 hover:border-indigo-500/50 bg-slate-900/40 rounded-xl p-6 text-center transition-all cursor-pointer group">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-200 mb-1">
                  Drag &amp; drop PDF files here
                </p>
                <p className="text-xs text-slate-400 mb-3">
                  Supports multi-page PDFs up to {MAX_FILE_SIZE_MB}MB
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-indigo-600/20 text-indigo-300 text-xs font-medium border border-indigo-500/30">
                  <span>Initialized &amp; Ready for Step 9</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </div>

            {/* Document List Container */}
            <div className="glass-panel rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                  <span>Indexed Documents</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-mono">
                    0
                  </span>
                </h3>
              </div>

              <div className="text-center py-8 px-4 border border-slate-800/60 rounded-xl bg-slate-900/20">
                <FileText className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-xs text-slate-400 mb-1">No documents uploaded yet</p>
                <p className="text-[11px] text-slate-500">
                  Drag and drop a PDF in Step 9 to start building your verified knowledge base.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Grounded Q&A Assistant (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="glass-panel rounded-2xl p-5 shadow-xl flex flex-col min-h-[580px]">
              {/* Chat Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-100 text-sm">
                      Grounded Q&amp;A Assistant
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Anti-hallucination guardrail active (threshold: {DEFAULT_THRESHOLD.toFixed(2)})
                    </p>
                  </div>
                </div>

                {/* Scoping Selector Mockup */}
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                  <button className="px-2.5 py-1 rounded-md bg-indigo-600 text-white font-medium text-xs">
                    All Documents
                  </button>
                  <button className="px-2.5 py-1 rounded-md text-slate-400 hover:text-slate-200 text-xs">
                    Scoped
                  </button>
                </div>
              </div>

              {/* Chat Thread Messages Area */}
              <div className="flex-1 py-6 flex flex-col justify-center items-center text-center px-4">
                <div className="max-w-md">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-indigo-400" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-200 mb-2">
                    Grounded Document Intelligence
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6">
                    Ask natural-language questions about your uploaded documents. Every factual claim
                    is synthesized from retrieved chunks and accompanied by page-level citation chips.
                  </p>

                  {/* Feature Pillars Preview */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-slate-200 mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Zero Extrapolation</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Answers strictly confined to verified document text.
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-slate-200 mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Citation Validation</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Post-hoc verification prevents phantom source citations.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Prompt Input Bar (Scaffolded for Step 9) */}
              <div className="pt-4 border-t border-slate-800">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    disabled
                    placeholder="Ask a question about your documents... (Active in Step 9)"
                    className="w-full bg-slate-900/80 border border-slate-700/70 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-300 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors disabled:cursor-not-allowed"
                  />
                  <button
                    disabled
                    className="absolute right-2 p-2 rounded-lg bg-indigo-600/50 text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500 px-1">
                  <span>FastAPI + pgvector ({VECTOR_DIMENSION}-dim) + {LLM_MODEL_DISPLAY}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-4 mt-auto bg-[#090d16]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>{APP_NAME} — Enterprise AI-Powered Document Q&amp;A</span>
          <span>Next.js 15 App Router • TypeScript • Tailwind CSS</span>
        </div>
      </footer>
    </div>
  );
}
