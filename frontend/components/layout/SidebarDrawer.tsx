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
} from 'lucide-react';
import { APP_NAME, APP_VERSION } from '@/lib/constants';

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
}

export function SidebarDrawer({
  isOpen,
  onClose,
  onNewChat,
  onOpenAdminLogs,
}: SidebarDrawerProps) {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div className="relative w-80 max-w-[85vw] h-full bg-[#0b0f17] border-r border-slate-800 flex flex-col justify-between z-10 shadow-2xl animate-slide-in-left">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-indigo-600 flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-white tracking-tight">{APP_NAME}</span>
              <span className="ml-1.5 text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                {APP_VERSION}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Button: New Chat */}
        <div className="p-3 border-b border-slate-800/80">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Conversation</span>
          </button>
        </div>

        {/* Middle Section: Chat History */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 mb-1">
            Recent Conversations
          </span>

          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => {
                onClose();
              }}
              className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-slate-900/80 text-slate-300 hover:text-white cursor-pointer group transition-colors text-xs border border-transparent hover:border-slate-800"
            >
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 shrink-0" />
                <span className="truncate">{session.title}</span>
              </div>

              <button
                onClick={(e) => handleDeleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-opacity p-0.5"
                title="Delete session"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Drawer Footer: Quick Navigation Links */}
        <div className="p-3 border-t border-slate-800 bg-[#090d16] flex flex-col gap-1 text-xs">
          <button
            onClick={() => {
              onOpenAdminLogs();
              onClose();
            }}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 transition-colors"
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>System Telemetry &amp; Logs</span>
          </button>

          <button
            onClick={onClose}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 transition-colors"
          >
            <FileText className="w-4 h-4 text-sky-400" />
            <span>Knowledge Base Documents</span>
          </button>

          <div className="pt-2 mt-1 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 px-1">
            <span>FastAPI • pgvector • Celery</span>
            <Sliders className="w-3 h-3 text-slate-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
