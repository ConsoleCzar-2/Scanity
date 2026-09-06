'use client';

import React, { useEffect, useState } from 'react';
import {
  Plus,
  MessageSquare,
  FileText,
  Activity,
  Sliders,
  X,
  Trash2,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { APP_NAME, APP_VERSION, DEFAULT_THRESHOLD, DEFAULT_TOP_K } from '@/lib/constants';
import { UserProfile } from '@/lib/auth';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
}

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onOpenAdminLogs: () => void;
  user: UserProfile | null;
  threshold: number;
  topK: number;
  onUpdateParameters?: (threshold: number, topK: number) => void;
}

export function SidebarDrawer({
  isOpen,
  onClose,
  onNewChat,
  onOpenAdminLogs,
  user,
  threshold,
  topK,
  onUpdateParameters,
}: SidebarDrawerProps) {
  const isAdmin = user?.role === 'admin';

  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('scanity_chat_sessions');
        if (saved) return JSON.parse(saved);
      } catch {
        // Ignore storage error
      }
    }
    return [
      {
        id: 'session-1',
        title: 'Initial Document Ingestion & Verification',
        createdAt: new Date().toISOString(),
      },
    ];
  });

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== sessionId);
    setSessions(updated);
    try {
      localStorage.setItem('scanity_chat_sessions', JSON.stringify(updated));
    } catch {
      // Ignore storage error
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleResetDefaults = () => {
    if (onUpdateParameters) onUpdateParameters(DEFAULT_THRESHOLD, DEFAULT_TOP_K);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="relative w-84 max-w-[85vw] h-full bg-[#11151c] border-r border-[#1c232f] flex flex-col justify-between z-10 shadow-2xl animate-slide-in-left">
        {/* Drawer Header */}
        <div className="p-4 border-b border-[#1c232f] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-sm text-white tracking-tight">{APP_NAME}</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#161c26] text-slate-400 border border-[#222b3a]">
              {APP_VERSION}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#161c26] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Button: New Chat */}
        <div className="p-3 border-b border-[#1c232f]">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Conversation</span>
          </button>
        </div>

        {/* Middle Section: Chat History */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 mb-1 font-mono">
            Recent Conversations
          </span>

          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => {
                onClose();
              }}
              className="flex items-center justify-between gap-2 px-2.5 py-2 rounded hover:bg-[#161c26] text-slate-300 hover:text-white cursor-pointer group transition-colors text-xs border border-transparent hover:border-[#222b3a]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 shrink-0" />
                <span className="truncate">{session.title}</span>
              </div>

              <button
                onClick={(e) => handleDeleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 transition-opacity p-0.5"
                title="Delete session"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-[#1c232f] bg-[#090b0e] flex flex-col gap-2.5 text-xs">
          {/* Admin-only: Modify Parameters Panel */}
          {isAdmin && (
            <div className="p-2.5 rounded bg-[#11151c] border border-[#1c232f] flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-300 font-medium text-[11px]">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Modify Parameters (Admin)</span>
                </div>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  title="Reset to system defaults"
                  className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Relevance Threshold Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">Min Relevance Gate:</span>
                  <span className="text-amber-400 font-bold">
                    {threshold.toFixed(2)} ({Math.round(threshold * 100)}%)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400 select-none">0.50</span>
                  <input
                    type="range"
                    min="0.50"
                    max="0.95"
                    step="0.01"
                    value={threshold}
                    onChange={(e) => onUpdateParameters?.(parseFloat(e.target.value), topK)}
                    className="w-full custom-slider slider-amber cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-slate-400 select-none">0.95</span>
                </div>
              </div>

              {/* Default Top-K Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">Top-K Retrieved Chunks:</span>
                  <span className="text-indigo-400 font-bold">{topK} chunks</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400 select-none">1</span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={topK}
                    onChange={(e) => onUpdateParameters?.(threshold, parseInt(e.target.value, 10))}
                    className="w-full custom-slider slider-indigo cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-slate-400 select-none">10</span>
                </div>
              </div>
            </div>
          )}

          {/* Admin-only: System Telemetry & Health Probe launcher */}
          {isAdmin && (
            <button
              onClick={() => {
                onOpenAdminLogs();
                onClose();
              }}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded text-slate-300 hover:text-white hover:bg-[#161c26] border border-[#1c232f] transition-colors cursor-pointer text-left"
            >
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>System Telemetry &amp; Health</span>
            </button>
          )}

          {/* Documentation Link for all users */}
          <a
            href="https://github.com/ConsoleCzar-2/Scanity"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-[#161c26] transition-colors text-left"
          >
            <FileText className="w-4 h-4 text-sky-400" />
            <span>Architecture &amp; Docs</span>
          </a>

          <div className="pt-2 border-t border-[#1c232f] flex items-center justify-between text-[10px] text-slate-400 px-1 font-mono">
            <span>FastAPI • pgvector • Celery</span>
            <span className="uppercase text-[9px] px-1.5 py-0.5 rounded bg-[#161c26] text-slate-300">
              {user?.role || 'Guest'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
