'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';
import { formatScore } from '@/lib/utils';
import type { CitationResponse } from '@/types/api';

interface CitationChipProps {
  citation: CitationResponse;
  onClick: (citation: CitationResponse) => void;
}

export function CitationChip({ citation, onClick }: CitationChipProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(citation)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 hover:border-indigo-500/60 transition-all text-xs font-medium cursor-pointer shadow-sm group"
      title={`Click to view verbatim excerpt from "${citation.original_filename}" (Page ${citation.page_number})`}
    >
      <BookOpen className="w-3 h-3 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
      <span>Page {citation.page_number}</span>
      <span className="text-[10px] text-slate-500 font-mono group-hover:text-slate-400">
        • {formatScore(citation.relevance_score)}
      </span>
    </button>
  );
}
