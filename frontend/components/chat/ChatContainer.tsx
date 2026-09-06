'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  RotateCcw,
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
  threshold?: number;
  topK?: number;
}

export function ChatContainer({
  selectedDocIds,
  totalDocCount,
  threshold = DEFAULT_THRESHOLD,
  topK = DEFAULT_TOP_K,
}: ChatContainerProps) {
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

    // Add user message AND immediate assistant thinking placeholder
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: questionText,
      timestamp: new Date().toISOString(),
    };

    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      sender: 'assistant',
      text: '',
      timestamp: new Date().toISOString(),
      isThinking: true,
      thinkingStep: 'Generating query embedding vector...',
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);
    setIsLoading(true);

    // Progressive status updates while backend RAG pipeline runs
    const stepTimer1 = setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId && msg.isThinking
            ? { ...msg, thinkingStep: 'Scanning pgvector cosine index across document chunks...' }
            : msg
        )
      );
    }, 1200);

    const stepTimer2 = setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId && msg.isThinking
            ? { ...msg, thinkingStep: 'Synthesizing verified grounded response with Gemini 3.5 Flash Lite...' }
            : msg
        )
      );
    }, 2400);

    try {
      // Prepare scoped document IDs if any selected
      const scopedDocIds =
        selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined;

      // Invoke backend /api/v1/query with active parameters
      const queryResponse = await api.askQuestion({
        question: questionText,
        document_ids: scopedDocIds,
        top_k: topK,
        threshold: threshold,
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      const fullAnswer = queryResponse.answer;
      const isFallback =
        !queryResponse.is_grounded ||
        fullAnswer.toLowerCase().includes('not found in the provided document');

      // If fallback, display immediately without streaming
      if (isFallback) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  text: fullAnswer,
                  isThinking: false,
                  isGrounded: false,
                  confidence: 0,
                  citations: queryResponse.citations || [],
                  isStreaming: false,
                }
              : msg
          )
        );
        setIsLoading(false);
        return;
      }

      // Switch to streaming text mode
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                text: '',
                isThinking: false,
                isGrounded: queryResponse.is_grounded,
                confidence: queryResponse.confidence,
                citations: [],
                isStreaming: true,
              }
            : msg
        )
      );

      // Natural token-by-token typewriter effect
      const tokens = fullAnswer.split(' ');
      let currentWordIndex = 0;
      let streamedText = '';

      const streamInterval = setInterval(() => {
        if (currentWordIndex < tokens.length) {
          const word = tokens[currentWordIndex];
          streamedText += (currentWordIndex > 0 ? ' ' : '') + word;
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
      }, 40);
    } catch (err: unknown) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
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
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-[#1c232f] text-xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-[#161c26] border border-[#222b3a] flex items-center justify-center text-indigo-400">
            <ShieldCheck className="w-3 h-3" />
          </div>
          <span className="font-semibold text-white text-xs">Grounded Q&amp;A</span>
        </div>

        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            disabled={isLoading}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
            title="Reset conversation"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Messages Thread Container */}
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col justify-start">
        {messages.length === 0 ? (
          /* Clean Minimal Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto">
            <div className="w-9 h-9 rounded bg-[#161c26] border border-[#222b3a] flex items-center justify-center text-indigo-400 mb-2.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">
              Ask anything about your documents
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mb-4">
              Answers are strictly synthesized from indexed pages with verifiable citations.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 max-w-md">
              <button
                onClick={() => handleAskQuestion('Summarize the primary objectives and key findings.')}
                className="px-3 py-1.5 rounded bg-[#161c26] hover:bg-[#1f2737] border border-[#222b3a] text-xs text-slate-300 transition-colors text-left cursor-pointer"
              >
                &ldquo;Summarize the primary objectives&rdquo;
              </button>
              <button
                onClick={() => handleAskQuestion('What are the key numerical metrics or statistics reported?')}
                className="px-3 py-1.5 rounded bg-[#161c26] hover:bg-[#1f2737] border border-[#222b3a] text-xs text-slate-300 transition-colors text-left cursor-pointer"
              >
                &ldquo;What are the key numerical metrics?&rdquo;
              </button>
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
