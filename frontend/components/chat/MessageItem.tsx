
'use client';

import React, { useMemo } from 'react';
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

// Regex matching inline citations:
// 1. Raw UUIDs: [01a089ba-0f22-7284-822b-e260bc575f92]
// 2. Number lists: [1], [1, 2], [3]
// 3. Page numbers: [Page 6], [p. 6]
const CITATION_REGEX = /\[(?:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})|(\d+(?:\s*,\s*\d+)*)|(?:p(?:age)?\.?\s*(\d+)))\]/g;

export function MessageItem({ message, onCitationClick }: MessageItemProps) {
  const isUser = message.sender === 'user';
  const citations = useMemo(() => message.citations || [], [message.citations]);

  // Lookup map: chunk_id (lowercase) -> { citation, index: 1-based }
  const uuidMap = useMemo(() => {
    const map = new Map<string, { citation: CitationResponse; index: number }>();
    citations.forEach((c, idx) => {
      if (c.chunk_id) {
        map.set(c.chunk_id.toLowerCase(), { citation: c, index: idx + 1 });
      }
    });
    return map;
  }, [citations]);

  // Lookup map: 1-based index -> citation
  const indexMap = useMemo(() => {
    const map = new Map<number, CitationResponse>();
    citations.forEach((c, idx) => {
      map.set(idx + 1, c);
    });
    return map;
  }, [citations]);

  // Helper to render clean, clickable superscript citation pills without borders or line decorations
  const renderCitationBadge = (
    citation: CitationResponse | undefined,
    label: string | number,
    key: string,
    title: string
  ) => (
    <button
      key={key}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (citation) onCitationClick(citation);
      }}
      className="inline-flex items-center justify-center align-baseline relative -top-1.5 mx-0.5 px-1.5 h-4 min-w-[16px] rounded text-[10px] font-mono font-bold leading-none bg-indigo-950/90 text-indigo-300 hover:text-white hover:bg-indigo-600 transition-colors cursor-pointer select-none no-underline shadow-none active:scale-95"
      style={{ textDecoration: 'none', border: 'none', outline: 'none' }}
      title={title}
    >
      [{label}]
    </button>
  );

  // Parses answer text and renders clickable, styled superscript citation pills (Wikipedia/Perplexity style)
  const renderFormattedAnswer = (text: string) => {
    if (!text) return null;

    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    // Strip any stray dashes/hyphens directly bounding citations: e.g. —[1]— or -[1]-
    const regex = /(?:[—–-]\s*)?\[(?:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})|(\d+(?:\s*,\s*\d+)*)|(?:p(?:age)?\.?\s*(\d+)))\](?:\s*[—–-])?/gi;

    while ((match = regex.exec(text)) !== null) {
      // Preceding plain text
      if (match.index > lastIndex) {
        elements.push(text.slice(lastIndex, match.index));
      }

      const fullMatch = match[0];
      const uuid = match[1];
      const numList = match[2];
      const pageNum = match[3];

      if (uuid) {
        const item = uuidMap.get(uuid.toLowerCase());
        const citation = item?.citation || citations[0];
        const index = item?.index || 1;
        elements.push(
          renderCitationBadge(
            citation,
            index,
            `cit-uuid-${match.index}`,
            citation
              ? `Grounding Evidence: ${citation.original_filename} (Page ${citation.page_number}) - Click to inspect`
              : 'Source Citation'
          )
        );
      } else if (numList) {
        const nums = numList
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));
        nums.forEach((n, subIdx) => {
          const citation = indexMap.get(n) || citations[n - 1] || citations[0];
          elements.push(
            renderCitationBadge(
              citation,
              n,
              `cit-num-${match!.index}-${subIdx}`,
              citation
                ? `Grounding Evidence: ${citation.original_filename} (Page ${citation.page_number}) - Click to inspect`
                : `Citation [${n}]`
            )
          );
        });
      } else if (pageNum) {
        const p = parseInt(pageNum, 10);
        const citation = citations.find((c) => c.page_number === p) || citations[0];
        const index = citation ? citations.indexOf(citation) + 1 : 1;
        elements.push(
          renderCitationBadge(
            citation,
            index,
            `cit-page-${match.index}`,
            citation
              ? `Grounding Evidence: ${citation.original_filename} (Page ${citation.page_number}) - Click to inspect`
              : `Page ${p}`
          )
        );
      } else {
        elements.push(fullMatch);
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      elements.push(text.slice(lastIndex));
    }

    return elements;
  };

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
              {renderFormattedAnswer(message.text)}
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
              )}
            </div>
          )}

          {/* Citations Section */}
          {!isFallback && citations.length > 0 && (
            <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Source Citations ({citations.length})
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {citations.map((citation, idx) => (
                  <CitationChip
                    key={`${citation.chunk_id}-${citation.page_number}`}
                    citation={citation}
                    index={idx + 1}
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

