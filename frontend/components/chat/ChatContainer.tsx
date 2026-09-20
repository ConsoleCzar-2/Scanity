'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import {
  getStoredMessages,
  saveStoredMessages,
  generateSessionTitle,
} from '@/lib/chatStorage';
import { consumeSSEStream } from '@/lib/sse';
import type { CitationResponse } from '@/types/api';


interface ChatContainerProps {
  sessionId: string;
  selectedDocIds: Set<string>;
  totalDocCount: number;
  threshold?: number;
  topK?: number;
  onSessionTitleUpdate?: (sessionId: string, newTitle: string) => void;
}

export function ChatContainer({
  sessionId,
  selectedDocIds,
  totalDocCount,
  threshold = DEFAULT_THRESHOLD,
  topK = DEFAULT_TOP_K,
  onSessionTitleUpdate,
}: ChatContainerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return getStoredMessages(sessionId);
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCitation, setSelectedCitation] = useState<CitationResponse | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleCloseCitation = useCallback(() => {
    setSelectedCitation(null);
  }, []);

  // Sync state whenever active sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    const stored = getStoredMessages(sessionId);
    if (stored.length > 0) {
      // Already initialized in useState
      return;
    }

    // If local storage is empty, check backend database for existing queries in this session
    let active = true;
    api
      .getQueryHistory(sessionId)
      .then((history) => {
        if (!active || !history || history.length === 0) {
          setMessages([]);
          return;
        }
        const reconstructed: ChatMessage[] = [];
        history.forEach((q) => {
          reconstructed.push({
            id: `user-${q.query_id}`,
            sender: 'user',
            text: q.question,
            timestamp: q.created_at || new Date().toISOString(),
          });
          reconstructed.push({
            id: `asst-${q.query_id}`,
            sender: 'assistant',
            text: q.answer,
            timestamp: q.created_at || new Date().toISOString(),
            isGrounded: q.is_grounded,
            confidence: q.confidence,
            citations: q.citations || [],
            isStreaming: false,
          });
        });
        setMessages(reconstructed);
        saveStoredMessages(sessionId, reconstructed);
      })
      .catch(() => {
        // Fallback to empty message thread
        if (active) setMessages([]);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Save messages whenever they transition to a settled, non-streaming state
  useEffect(() => {
    if (!sessionId || isLoading) return;
    const settled = messages.filter((m) => !m.isThinking && !m.isStreaming);
    if (settled.length > 0) {
      saveStoredMessages(sessionId, settled);
    }
  }, [messages, sessionId, isLoading]);

  const handleAskQuestion = async (questionText: string) => {
    // If opening prompt of the session, auto-title the session
    if (messages.length === 0) {
      const newTitle = generateSessionTitle(questionText);
      onSessionTitleUpdate?.(sessionId, newTitle);
    }

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

    try {
      // Prepare scoped document IDs if any selected
      const scopedDocIds =
        selectedDocIds.size > 0 ? Array.from(selectedDocIds) : undefined;

      const response = await api.askQuestionStream({
        question: questionText,
        document_ids: scopedDocIds,
        top_k: topK,
        threshold: threshold,
        session_id: sessionId,
      });

      if (!response.body) {
        throw new Error('Streaming response body is unavailable or not supported.');
      }

      const reader = response.body.getReader();
      let accumulatedText = '';
      let receivedCitations: CitationResponse[] = [];
      let receivedConfidence = 0.85;
      let receivedIsGrounded = true;

      await consumeSSEStream(reader, {
        onStatus: (data) => {
          let stepMsg = data.message;
          if (!stepMsg) {
            if (data.step === 'embedding') stepMsg = 'Generating query embedding vector...';
            else if (data.step === 'retrieving') stepMsg = 'Scanning pgvector cosine index across document chunks...';
            else if (data.step === 'generating') stepMsg = 'Synthesizing verified grounded response with Gemini 3.5 Flash Lite...';
            else if (data.step === 'validating_citations') stepMsg = 'Extracting and verifying source citations...';
          }
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId && msg.isThinking
                ? { ...msg, thinkingStep: stepMsg }
                : msg
            )
          );
        },

        onToken: (data) => {
          accumulatedText += data.delta;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    isThinking: false,
                    isStreaming: true,
                    text: accumulatedText,
                  }
                : msg
            )
          );
        },

        onGateRejected: (data) => {
          accumulatedText = data.fallback_answer;
          receivedIsGrounded = false;
          receivedConfidence = 0.0;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    isThinking: false,
                    isStreaming: false,
                    isGrounded: false,
                    confidence: 0,
                    text: data.fallback_answer,
                    citations: [],
                  }
                : msg
            )
          );
        },

        onCitations: (data) => {
          receivedCitations = data.citations || [];
          receivedConfidence = data.confidence;
          receivedIsGrounded = data.is_grounded;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    citations: receivedCitations,
                    confidence: receivedConfidence,
                    isGrounded: receivedIsGrounded,
                  }
                : msg
            )
          );
        },

        onDone: (data) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    isThinking: false,
                    isStreaming: false,
                    text: accumulatedText || 'Not found in the provided document(s).',
                    citations: receivedCitations,
                    confidence: data.confidence !== undefined ? data.confidence : receivedConfidence,
                    isGrounded: data.is_grounded !== undefined ? data.is_grounded : receivedIsGrounded,
                  }
                : msg
            )
          );
          setIsLoading(false);
        },

        onError: (data) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    isThinking: false,
                    isStreaming: false,
                    text: `Error during answer generation: ${data.message}`,
                    isGrounded: false,
                    confidence: 0,
                  }
                : msg
            )
          );
          setIsLoading(false);
        },
      });
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

      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantMsgId ? errorAssistantMsg : msg))
      );
      setIsLoading(false);
    }
  };


  const handleClearChat = () => {
    if (confirm('Clear the current conversation thread?')) {
      setMessages([]);
      if (sessionId) {
        saveStoredMessages(sessionId, []);
      }
    }
  };

  return (
    <div className="w-full flex flex-col h-full min-h-[580px] justify-between">
      {/* Citation Popover Modal */}
      <CitationModal
        citation={selectedCitation}
        onClose={handleCloseCitation}
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
