'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  FileSearch,
} from 'lucide-react';
import { api } from '@/lib/api';
import { DEFAULT_TOP_K, DEFAULT_THRESHOLD } from '@/lib/constants';
import { MessageItem, type ChatMessage } from '@/components/chat/MessageItem';
import { QueryInput } from '@/components/chat/QueryInput';
import { CitationModal } from '@/components/chat/CitationModal';
import type { CitationResponse } from '@/types/api';

interface ChatContainerProps {
  selectedDocIds: Set<string>;
  totalDocCount: number;
}

export function ChatContainer({ selectedDocIds, totalDocCount }: ChatContainerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCitation, setSelectedCitation] = useState<CitationResponse | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleAskQuestion = async (questionText: string) => {
    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    // Add user message
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: questionText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // Prepare scoped document IDs if any selected
      const scopedDocIds =
        selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined;

      // Invoke backend /api/v1/query
      const queryResponse = await api.askQuestion({
        question: questionText,
        document_ids: scopedDocIds,
        top_k: DEFAULT_TOP_K,
        threshold: DEFAULT_THRESHOLD,
      });

      const fullAnswer = queryResponse.answer;
      const isFallback =
        !queryResponse.is_grounded ||
        fullAnswer.toLowerCase().includes('not found in the provided document');

      // Initialize assistant placeholder message
      const initialAssistantMsg: ChatMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        text: '',
        timestamp: new Date().toISOString(),
        isGrounded: queryResponse.is_grounded,
        confidence: queryResponse.confidence,
        citations: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, initialAssistantMsg]);

      // If fallback, display immediately without streaming
      if (isFallback) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  text: fullAnswer,
                  citations: queryResponse.citations || [],
                  isStreaming: false,
                }
              : msg
          )
        );
        setIsLoading(false);
        return;
      }

      // Progressive token-by-token streaming typewriter effect
      const tokens = fullAnswer.split(' ');
      let currentWordIndex = 0;
      let streamedText = '';

      const streamInterval = setInterval(() => {
        if (currentWordIndex < tokens.length) {
          streamedText += (currentWordIndex > 0 ? ' ' : '') + tokens[currentWordIndex];
          currentWordIndex++;

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, text: streamedText } : msg
            )
          );
        } else {
          clearInterval(streamInterval);
          // Stream completed: snap citations into place and mark streaming false
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    text: fullAnswer,
                    citations: queryResponse.citations || [],
                    isStreaming: false,
                  }
                : msg
            )
          );
          setIsLoading(false);
        }
      }, 35);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Backend query failed. Please check your connection.';

      const errorAssistantMsg: ChatMessage = {
        id: assistantMsgId,
        sender: 'assistant',
        text: `Error processing query: ${errorMsg}`,
        timestamp: new Date().toISOString(),
        isGrounded: false,
        confidence: 0,
        citations: [],
        isStreaming: false,
      };

      setMessages((prev) => [...prev, errorAssistantMsg]);
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (confirm('Clear the current conversation thread?')) {
      setMessages([]);
    }
  };

  return (
    <div className="w-full flex flex-col h-full min-h-[580px] justify-between">
      {/* Citation Popover Modal */}
      <CitationModal
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />

      {/* Chat Thread Header */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">Grounded Q&amp;A Assistant</h3>
            <span className="text-[11px] text-slate-500">
              Anti-hallucination guardrail active (threshold: {DEFAULT_THRESHOLD.toFixed(2)})
            </span>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            disabled={isLoading}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
            title="Reset conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Messages Thread Container */}
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col justify-start">
        {messages.length === 0 ? (
          /* Empty State / Feature Highlights */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400 mb-3 shadow-sm">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">
              Grounded Document Intelligence
            </h3>
            <p className="text-xs text-slate-400 max-w-md leading-relaxed mb-6">
              Ask natural-language questions about your uploaded documents. Every factual answer is
              synthesized exclusively from retrieved chunks and verified with page-level citations.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-w-xl w-full text-left">
              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-1.5 font-medium text-slate-200 text-xs mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Zero Extrapolation</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Answers confined exclusively to facts present in the text.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-1.5 font-medium text-slate-200 text-xs mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Citation Validation</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Post-hoc verification prevents phantom source citations.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className="flex items-center gap-1.5 font-medium text-slate-200 text-xs mb-1">
                  <FileSearch className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Selective Scoping</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Query across all documents or restrict to specific files.
                </p>
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              onCitationClick={(cit) => setSelectedCitation(cit)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Query Input Box */}
      <QueryInput
        onSubmit={handleAskQuestion}
        isLoading={isLoading}
        selectedDocCount={selectedDocIds.size}
        totalDocCount={totalDocCount}
      />
    </div>
  );
}
