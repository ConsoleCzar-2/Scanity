'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Hash,
  Loader2,
  Percent,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatScore } from '@/lib/utils';
import type { CitationResponse } from '@/types/api';

interface CitationModalProps {
  citation: CitationResponse | null;
  onClose: () => void;
}

export function CitationModal({ citation, onClose }: CitationModalProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'page'>('text');
  const [copied, setCopied] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // Stable key identifying the currently viewed chunk
  const citationKey = citation ? `${citation.document_id}_${citation.chunk_id}` : null;

  // Only reset tab and zoom when a different citation is opened
  useEffect(() => {
    if (citationKey) {
      setActiveTab('text');
      setZoomLevel(1.0);
      setImageLoading(true);
      setImageError(false);
    }
  }, [citationKey]);

  // Handle escape key closing independently from tab state
  useEffect(() => {
    if (!citation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [citation, onClose]);

  // Strip Unicode Private Use Area characters (e.g. PowerPoint font bullets like \uf071, \uf0d8)
  const sanitizedSnippet = useMemo(() => {
    if (!citation?.snippet) return '';
    return citation.snippet
      .replace(/[\uE000-\uF8FF]/g, '')
      .replace(/^[ \t]*[\u2022\u25E6\u2023\u25AA\u25AB\u25BA\u2714\u2192]+\s*/gm, '- ')
      .trim();
  }, [citation?.snippet]);

  if (!citation) return null;

  const pageImageUrl = api.getDocumentPageImageUrl(
    citation.document_id,
    citation.page_number,
    200
  );

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(sanitizedSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard write failed
    }
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 2.5));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.5));
  const handleResetZoom = () => setZoomLevel(1.0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      {/* Backdrop click handler */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        className={`relative w-full ${
          activeTab === 'page' ? 'max-w-4xl' : 'max-w-lg'
        } max-h-[92vh] bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl p-5 z-10 flex flex-col gap-4 transition-all duration-200`}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-950/70 border border-indigo-800/80 flex items-center justify-center text-indigo-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Verified Citation Inspector</h3>
              <p className="text-[11px] text-slate-400">
                Grounding evidence from {citation.original_filename} (Page {citation.page_number})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close citation modal (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'text'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Verbatim Text</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('page')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'page'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>PDF Page View</span>
            <span className="ml-1 px-1.5 py-0.2 bg-indigo-950 text-indigo-300 border border-indigo-700/60 rounded text-[10px] font-mono">
              p. {citation.page_number}
            </span>
          </button>
        </div>

        {/* Tab 1: Verbatim Text Excerpt */}
        {activeTab === 'text' && (
          <div className="flex flex-col gap-4 animate-fadeIn">
            {/* Source Metadata Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                  <FileText className="w-3 h-3 text-slate-400" />
                  <span>Document</span>
                </div>
                <p className="text-xs font-medium text-slate-200 truncate" title={citation.original_filename}>
                  {citation.original_filename}
                </p>
              </div>

              <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                  <Hash className="w-3 h-3 text-slate-400" />
                  <span>Source Page</span>
                </div>
                <p className="text-xs font-mono font-medium text-indigo-300">
                  Page {citation.page_number}
                </p>
              </div>

              <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
                  <Percent className="w-3 h-3 text-emerald-400" />
                  <span>Cosine Match</span>
                </div>
                <p className="text-xs font-mono font-medium text-emerald-300">
                  {formatScore(citation.relevance_score)}
                </p>
              </div>
            </div>

            {/* Verbatim Excerpt Text Snippet */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Verbatim Passage Excerpt:</span>
                <button
                  type="button"
                  onClick={handleCopySnippet}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  title="Copy verbatim passage to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="p-3.5 rounded-lg bg-[#090d16] border border-slate-800/90 text-xs text-slate-300 leading-relaxed font-sans max-h-60 overflow-y-auto whitespace-pre-wrap select-text">
                &ldquo;{sanitizedSnippet}&rdquo;
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: PDF Page View */}
        {activeTab === 'page' && (
          <div className="flex flex-col gap-2.5 animate-fadeIn">
            {/* Viewport Control Bar */}
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-medium text-xs">
                <span>Page {citation.page_number}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {Math.round(zoomLevel * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 0.5}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                  title="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 2.5}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                  title="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Reset zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                <div className="w-[1px] h-3.5 bg-slate-800 mx-1" />

                <a
                  href={pageImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Open high-res page image in new browser tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Scrollable Document Canvas Viewport */}
            <div className="relative w-full h-[62vh] overflow-auto bg-[#070a12] border border-slate-800/90 rounded-lg p-6">
              {imageLoading && !imageError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#070a12]/85 z-10 text-slate-400 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                  <span>Rendering PDF page {citation.page_number}...</span>
                </div>
              )}

              {imageError ? (
                <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center text-slate-400 text-xs">
                  <p className="text-rose-400 font-medium">Failed to render page image</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mt-1">
                    The document file may not be cached locally or is currently being accessed.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setImageError(false);
                      setImageLoading(true);
                    }}
                    className="mt-3 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors cursor-pointer"
                  >
                    Retry Rendering
                  </button>
                </div>
              ) : (
                <div
                  className="transition-all duration-150 flex items-start"
                  style={{
                    width: `${Math.round(zoomLevel * 100)}%`,
                    margin: zoomLevel <= 1 ? '0 auto' : '0',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pageImageUrl}
                    alt={`Rendered page ${citation.page_number} of ${citation.original_filename}`}
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                      setImageLoading(false);
                      setImageError(true);
                    }}
                    className="w-full h-auto rounded shadow-2xl border border-slate-700 bg-white block"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audit Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
          <span>Chunk ID: {citation.chunk_id.slice(0, 16)}...</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-sans font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

