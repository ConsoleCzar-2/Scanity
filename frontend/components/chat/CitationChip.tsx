'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';
import { formatScore } from '@/lib/utils';
import type { CitationResponse } from '@/types/api';

interface CitationChipProps {
  citation: CitationResponse;
  index?: number;
  onClick: (citation: CitationResponse) => void;
}

export function CitationChip({ citation, index, onClick }: CitationChipProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(citation)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 hover:border-indigo-500/60 transition-all text-xs font-medium cursor-pointer shadow-sm group active:scale-95"
      title={`Click to inspect verbatim excerpt & PDF page from "${citation.original_filename}" (Page ${citation.page_number})`}
    >
      {index !== undefined && (
        <span className="w-4 h-4 rounded bg-indigo-950 border border-indigo-700/60 text-indigo-300 text-[10px] font-mono flex items-center justify-center font-bold group-hover:bg-indigo-900 group-hover:text-white transition-colors">
          {index}
        </span>
      )}
      <BookOpen className="w-3 h-3 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
      <span>Page {citation.page_number}</span>
      <span className="text-[10px] text-slate-500 font-mono group-hover:text-slate-400">
        • {formatScore(citation.relevance_score)}
      </span>
    </button>
  );
}
