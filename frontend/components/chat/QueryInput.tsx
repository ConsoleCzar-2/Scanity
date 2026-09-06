'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Filter } from 'lucide-react';
import { DEFAULT_THRESHOLD } from '@/lib/constants';

interface QueryInputProps {
  onSubmit: (question: string) => void;
  isLoading: boolean;
  selectedDocCount: number;
  totalDocCount: number;
}

export function QueryInput({
  onSubmit,
  isLoading,
  selectedDocCount,
  totalDocCount,
}: QueryInputProps) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit(prompt.trim());
    setPrompt('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const placeholderText =
    selectedDocCount > 0
      ? `Ask a question scoped to ${selectedDocCount} selected document(s)...`
      : totalDocCount > 0
      ? 'Ask a question across all documents in knowledge base...'
      : 'Upload a document on the left to start asking questions...';

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-2 pt-3 border-t border-slate-800">
      <div className="relative flex items-center bg-[#090d16] border border-slate-700/80 rounded-lg focus-within:border-indigo-500 transition-colors shadow-sm">
        <textarea
          ref={inputRef}
          rows={1}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={isLoading || totalDocCount === 0}
          className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 pl-3.5 pr-12 py-3 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed max-h-32"
        />

        <button
          type="submit"
          disabled={!prompt.trim() || isLoading || totalDocCount === 0}
          className="absolute right-2.5 p-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:hover:bg-indigo-600 transition-all cursor-pointer disabled:cursor-not-allowed shadow-sm"
          title="Send query (Enter)"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Scope & Guardrail Indicators Bar */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 font-mono">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3 h-3 text-slate-400" />
          <span>
            {selectedDocCount > 0 ? (
              <span className="text-indigo-400 font-medium">
                Scope: {selectedDocCount} Selected
              </span>
            ) : (
              <span>Scope: All Indexed Documents</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span>Threshold: {DEFAULT_THRESHOLD.toFixed(2)}</span>
          <span className="hidden sm:inline">• Enter to send</span>
        </div>
      </div>
    </form>
  );
}
