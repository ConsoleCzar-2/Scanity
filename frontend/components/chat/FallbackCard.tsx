'use client';

import React from 'react';
import { ShieldAlert, AlertCircle } from 'lucide-react';
import { DEFAULT_THRESHOLD } from '@/lib/constants';

interface FallbackCardProps {
  answer: string;
}

export function FallbackCard({ answer }: FallbackCardProps) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg bg-amber-950/20 border border-amber-800/40 text-left">
      <div className="flex items-center gap-2 text-amber-300 font-medium text-xs">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span>Grounded Answer Fallback (Zero Extrapolation)</span>
      </div>

      <p className="text-sm text-slate-200 font-medium">
        {answer || 'Not found in the provided document(s).'}
      </p>

      <div className="flex items-start gap-1.5 pt-2 border-t border-amber-900/30 text-[11px] text-slate-400 leading-relaxed">
        <AlertCircle className="w-3.5 h-3.5 text-amber-500/80 shrink-0 mt-0.5" />
        <p>
          The retrieved candidate chunks scored below the relevance threshold (
          {DEFAULT_THRESHOLD.toFixed(2)} cosine similarity) or lacked verified citations. To prevent
          hallucination, Scanity honestly refrains from guessing facts absent from your documents.
        </p>
      </div>
    </div>
  );
}
