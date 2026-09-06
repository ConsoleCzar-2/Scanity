'use client';

import React, { useEffect } from 'react';
import { BookOpen, FileText, Hash, Percent, X } from 'lucide-react';
import { formatScore } from '@/lib/utils';
import type { CitationResponse } from '@/types/api';

interface CitationModalProps {
  citation: CitationResponse | null;
  onClose: () => void;
}

export function CitationModal({ citation, onClose }: CitationModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (citation) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [citation, onClose]);

  if (!citation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      {/* Backdrop click handler */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-lg bg-[#0f172a] border border-slate-700 rounded-lg shadow-2xl p-5 z-10 flex flex-col gap-4">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-indigo-950/60 border border-indigo-800/80 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Verified Citation Excerpt</h3>
              <p className="text-[11px] text-slate-400">
                Extracted verbatim from pgvector chunk candidate set
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close citation modal (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source Metadata Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
              <FileText className="w-3 h-3 text-slate-400" />
              <span>Document</span>
            </div>
            <p className="text-xs font-medium text-slate-200 truncate" title={citation.original_filename}>
              {citation.original_filename}
            </p>
          </div>

          <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
              <Hash className="w-3 h-3 text-slate-400" />
              <span>Page Number</span>
            </div>
            <p className="text-xs font-mono font-medium text-indigo-300">
              Page {citation.page_number}
            </p>
          </div>

          <div className="p-2 rounded bg-slate-900/80 border border-slate-800 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
              <Percent className="w-3 h-3 text-emerald-400" />
              <span>Cosine Match</span>
            </div>
            <p className="text-xs font-mono font-medium text-emerald-300">
              {formatScore(citation.relevance_score)}
            </p>
          </div>
        </div>

        {/* Verbatim Excerpt Text Snippet */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-400">Verbatim Passage:</span>
          <div className="p-3.5 rounded bg-[#090d16] border border-slate-800/90 text-xs text-slate-300 leading-relaxed font-sans max-h-56 overflow-y-auto whitespace-pre-wrap select-text">
            &ldquo;{citation.snippet}&rdquo;
          </div>
        </div>

        {/* Audit Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
          <span>Chunk ID: {citation.chunk_id.slice(0, 16)}...</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-sans transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
