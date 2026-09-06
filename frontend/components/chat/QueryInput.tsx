'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Filter } from 'lucide-react';


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
      ? `Ask about ${selectedDocCount} selected document(s)...`
      : totalDocCount > 0
      ? 'Ask a question about your documents...'
      : 'Upload a PDF on the left to start...';

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-2 pt-3 border-t border-[#1c232f]">
      <div className="relative flex items-center bg-[#161c26] border border-[#222b3a] rounded focus-within:border-indigo-500 transition-colors">
        <textarea
          ref={inputRef}
          rows={1}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={isLoading || totalDocCount === 0}
          className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-500 pl-3 pr-10 py-2.5 resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed max-h-32"
        />

        <button
          type="submit"
          disabled={!prompt.trim() || isLoading || totalDocCount === 0}
          className="absolute right-2 p-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
          title="Send query (Enter)"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Scope Indicator */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 px-0.5 font-mono">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3 h-3 text-slate-500" />
          {selectedDocCount > 0 ? (
            <span className="text-indigo-400">Scoped to {selectedDocCount} file(s)</span>
          ) : (
            <span>Scope: All indexed files</span>
          )}
        </div>

        <span>Enter ↵</span>
      </div>
    </form>
  );
}
