'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import {
  FaGithub
} from 'react-icons/fa';
import {
  SiGooglegemini,
} from 'react-icons/si';
import {
  APP_NAME,
  APP_VERSION,
  LLM_MODEL_DISPLAY,
  EMBEDDING_MODEL,
  VECTOR_DIMENSION,
  DEFAULT_THRESHOLD,
  CHUNK_SIZE_TOKENS,
  CHUNK_OVERLAP_TOKENS,
  MAX_FILE_SIZE_MB,
} from '@/lib/constants';
import { getCurrentUser } from '@/lib/auth';
import { StackedCards } from '@/components/landing/StackedCards';
import type { HealthResponse } from '@/types/api';

interface LandingPageProps {
  health?: HealthResponse | null;
  healthLoading?: boolean;
}

export function LandingPage({
  health,
  healthLoading,
}: LandingPageProps) {
  const router = useRouter();
  const [scrollY, setScrollY] = useState(0);
  const [isLoggedIn] = useState<boolean>(() =>
    typeof window !== 'undefined' ? Boolean(getCurrentUser()) : false
  );

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLaunch = () => {
    if (isLoggedIn) {
      router.push('/chat');
    } else {
      router.push('/login');
    }
  };

  // Scroll dynamics: Hero section sinks and fades away into background as user scrolls down
  const heroOpacity = Math.max(0, 1 - scrollY / 280);
  const heroScale = Math.max(0.92, 1 - scrollY / 1400);
  const heroTranslateY = Math.min(scrollY * 0.28, 70);

  return (
    <div className="min-h-screen bg-[#090b0e] text-slate-100 flex flex-col justify-between overflow-x-hidden selection:bg-indigo-600 selection:text-white">
      {/* Edge-to-Edge Topbar */}
      <header className="sticky top-0 z-50 w-full border-b border-[#1c232f] bg-[#090b0e]/90 backdrop-blur-md h-14 flex items-center">
        <div className="w-full px-4 sm:px-8 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 group cursor-pointer"
          >
            <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-white">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-base text-white tracking-tight">{APP_NAME}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#161c26] text-slate-400 border border-[#1c232f]">
              {APP_VERSION}
            </span>

            {health && (
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#11151c] border border-[#1c232f] text-[10px] font-mono text-slate-400">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${healthLoading
                      ? 'bg-amber-400 animate-ping'
                      : health.status === 'ok'
                        ? 'bg-emerald-400'
                        : 'bg-rose-500'
                    }`}
                />
                <span className="capitalize">{healthLoading ? 'Polling...' : (health.status ? 'Running' : 'Server Down')}</span>
              </div>
            )}
          </Link>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/ConsoleCzar-2/Scanity"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <FaGithub className="w-4 h-4" />
              <span>GitHub</span>
            </a>

            <button
              onClick={handleLaunch}
              className="px-3.5 py-1.5 rounded bg-white hover:bg-slate-200 text-slate-950 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>{isLoggedIn ? 'Enter Workspace' : 'Sign In'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-8 pt-16 pb-20 flex flex-col gap-16 sm:gap-24 relative">
        {/* Hero Section with Smooth Fade & Scale Out into Background */}
        <div
          style={{
            opacity: heroOpacity,
            transform: `scale(${heroScale}) translateY(-${heroTranslateY}px)`,
            willChange: 'transform, opacity',
          }}
          className="flex flex-col gap-4 max-w-3xl transition-transform duration-75 ease-out"
        >
          <div className="inline-flex items-center py-1 text-slate-400  font-mono w-fit">
            <span className="w-1.5 h-1.5" />
            <span>AI-Powered Document Q&A System</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
            Zero hallucination.<br />
            <span className="text-slate-400">Strictly verified answers.</span>
          </h1>

          <p className="text-sm sm:text-base text-slate-400 max-w-xl leading-relaxed">
            Enterprise document ingestion and grounded question answering powered by PostgreSQL pgvector,
            Celery worker queues, and Google Gemini with post-hoc citation validation.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-3">
            <button
              onClick={handleLaunch}
              className="px-5 py-2.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-indigo-950/40"
            >
              <span>{isLoggedIn ? 'Launch Workspace' : 'Get Started with Workspace'}</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>

            <Link
              href="/login"
              className="px-4 py-2.5 rounded bg-[#11151c] hover:bg-[#161c26] border border-[#1c232f] hover:border-[#2b3648] text-slate-300 font-medium text-xs transition-colors"
            >
              Demo Credentials
            </Link>
          </div>
        </div>

        {/* 4 Core Features Stacked on Scroll (skiper16 implementation) */}
        <StackedCards />

        {/* Upgraded Active System Telemetry Grid (replacing raw monospace table) */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1c232f]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                System Runtime Specifications
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
                Active Parameters
              </span>
            </div>
            <span className="text-xs font-mono text-slate-400">Environment Synchronized</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded bg-[#11151c] border border-[#1c232f] flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">Generation Engine</span>
                <SiGooglegemini className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white truncate">{LLM_MODEL_DISPLAY}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">Temp 0.0 • Structured JSON</div>
              </div>
            </div>

            <div className="p-3.5 rounded bg-[#11151c] border border-[#1c232f] flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">Dense Embeddings</span>
                <SiGooglegemini className="w-4 h-4 text-sky-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white truncate">{EMBEDDING_MODEL}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{VECTOR_DIMENSION}-Dimensional Vectors</div>
              </div>
            </div>

            <div className="p-3.5 rounded bg-[#11151c] border border-[#1c232f] flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">Chunk Slicing</span>
                <Layers className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  {CHUNK_SIZE_TOKENS} / {CHUNK_OVERLAP_TOKENS}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">Tokens • Recursive Overlap</div>
              </div>
            </div>

            <div className="p-3.5 rounded bg-[#11151c] border border-[#1c232f] flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">Relevance &amp; Ingestion</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  &gt;= {(DEFAULT_THRESHOLD * 100).toFixed(0)}% Similarity
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">Max {MAX_FILE_SIZE_MB}MB (PDF application/pdf)</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Refined Enterprise Footer */}
      <footer className="w-full border-t border-[#1c232f] py-6 bg-[#090b0e]">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-mono">

          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">{APP_NAME}</span>
            <span>•</span>
            <span>AI Document Q&amp;A Architecture</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/ConsoleCzar-2/Scanity"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
            >
              <span>Made with ❤️ by Abhirup Saha</span>
            </a>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/ConsoleCzar-2/Scanity"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
            >
              <FaGithub className="w-3.5 h-3.5" />
              <span>Source Repository</span>
            </a>
            <span>•</span>
            <span>RAG • VectorDB • LLM</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
