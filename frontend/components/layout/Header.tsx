'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Sparkles,
  Cpu,
  Database,
  Layers,
  RefreshCw,
  AlertCircle,
  User,
  Activity,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import {
  APP_NAME,
  APP_VERSION,
  BACKEND_PORT,
  LLM_MODEL_DISPLAY,
  VECTOR_DIMENSION,
} from '@/lib/constants';
import type { HealthResponse } from '@/types/api';

interface HeaderProps {
  onToggleDrawer: () => void;
  onOpenAdminLogs: () => void;
  health: HealthResponse | null;
  healthLoading: boolean;
  healthError: string | null;
  onRefreshHealth: () => Promise<void>;
}

export function Header({
  onToggleDrawer,
  onOpenAdminLogs,
  health,
  healthLoading,
  healthError,
  onRefreshHealth,
}: HeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#090d16]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Left: Drawer Hamburger & Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleDrawer}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Open navigation drawer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-white tracking-tight">{APP_NAME}</span>
                <span className="text-[10px] uppercase font-mono font-semibold px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                  {APP_VERSION}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Model & Vector Badges */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>{LLM_MODEL_DISPLAY}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
            <Database className="w-3.5 h-3.5 text-sky-400" />
            <span>pgvector ({VECTOR_DIMENSION}-dim)</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Celery + Redis</span>
          </div>
        </div>

        {/* Right: Live Health Probe & User Menu */}
        <div className="flex items-center gap-3">
          {/* Health Indicator Badge */}
          {healthLoading && !health ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs text-slate-400">
              <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
              <span className="hidden sm:inline">Connecting...</span>
            </div>
          ) : health?.status === 'ok' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium hidden sm:inline">Connected (Port {BACKEND_PORT})</span>
              <button
                onClick={() => onRefreshHealth()}
                title="Refresh connection status"
                className="text-emerald-400 hover:text-emerald-200 transition-colors ml-1"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300"
              title={healthError || 'Backend unreachable'}
            >
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Disconnected</span>
              <button
                onClick={() => onRefreshHealth()}
                className="underline hover:text-white transition-colors ml-1"
              >
                Retry
              </button>
            </div>
          )}

          {/* User Account Avatar & Dropdown Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 p-1.5 rounded-md hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700 cursor-pointer"
              title="User profile & settings"
            >
              <div className="w-7 h-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-indigo-400">
                <User className="w-4 h-4" />
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-60 bg-[#0f172a] border border-slate-800 rounded-lg shadow-xl py-1 z-50 text-xs flex flex-col">
                <div className="px-3 py-2 border-b border-slate-800/80">
                  <p className="font-semibold text-slate-200">Enterprise Engineer</p>
                  <p className="text-[11px] text-slate-500 font-mono truncate">engineer@scanity.internal</p>
                  <span className="inline-block mt-1 text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                    Administrator
                  </span>
                </div>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenAdminLogs();
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors text-left"
                >
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>System Telemetry &amp; Logs</span>
                </button>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onRefreshHealth();
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors text-left"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                  <span>Check Backend Health</span>
                </button>

                <div className="border-t border-slate-800/80 mt-1 pt-1">
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      alert('Signed out of local workspace session.');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-400 hover:bg-slate-800/80 transition-colors text-left"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
