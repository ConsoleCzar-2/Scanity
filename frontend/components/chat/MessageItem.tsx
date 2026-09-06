
'use client';

import React from 'react';
import { User, Sparkles, ShieldCheck, Loader2 } from 'lucide-react';
import { CitationChip } from '@/components/chat/CitationChip';
import { FallbackCard } from '@/components/chat/FallbackCard';
import { formatScore, formatTimestamp } from '@/lib/utils';
import type { CitationResponse } from '@/types/api';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isGrounded?: boolean;
  confidence?: number;
  citations?: CitationResponse[];
  isStreaming?: boolean;
  isThinking?: boolean;
  thinkingStep?: string;
}

interface MessageItemProps {
  message: ChatMessage;
  onCitationClick: (citation: CitationResponse) => void;
}

export function MessageItem({ message, onCitationClick }: MessageItemProps) {
  const isUser = message.sender === 'user';

  if (isUser) {
    return (
      <div className="flex items-start justify-end gap-3 w-full my-2">
        <div className="flex flex-col items-end max-w-[85%] sm:max-w-[75%]">
          <div className="p-3.5 rounded-lg bg-indigo-600 text-white text-sm leading-relaxed shadow-sm font-sans select-text">
            {message.text}
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1 px-1">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>

        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
          <User className="w-4 h-4" />
        </div>
      </div>
    );
  }

  // Assistant response card
  const isFallback =
    message.isGrounded === false ||
    message.text.toLowerCase().includes('not found in the provided document');

  return (
    <div className="flex items-start justify-start gap-3 w-full my-3">
      {/* Bot Icon */}
      <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="flex flex-col items-start max-w-[95%] sm:max-w-[85%] flex-1">
        <div className="w-full p-4 rounded-lg bg-[#0f172a] border border-slate-800 shadow-sm flex flex-col gap-3">
          {/* Header Metadata Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
              <span>Scanity</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                AI Assistant
              </span>
            </div>

            {message.confidence !== undefined && message.isGrounded && (
              <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verified Grounded • {formatScore(message.confidence)}</span>
              </div>
            )}
          </div>

          {/* Main Content: Thinking Stepper vs Fallback vs Grounded Answer */}
          {message.isThinking ? (
            <div className="flex items-center gap-2.5 py-2.5 text-xs text-indigo-300 font-mono">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
              <span className="tracking-wide">{message.thinkingStep || 'Processing query...'}</span>
            </div>
          ) : isFallback ? (
            <FallbackCard answer={message.text} />
          ) : (
            <div className="text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-wrap select-text">
              {message.text}
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
              )}
            </div>
          )}

          {/* Citations Section */}
          {!isFallback && message.citations && message.citations.length > 0 && (
            <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Source Citations ({message.citations.length})
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {message.citations.map((citation) => (
                  <CitationChip
                    key={`${citation.chunk_id}-${citation.page_number}`}
                    citation={citation}
                    onClick={onCitationClick}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <span className="text-[10px] text-slate-500 font-mono mt-1 px-1">
          {formatTimestamp(message.timestamp)}
        </span>
      </div>
    </div>
  );
}
