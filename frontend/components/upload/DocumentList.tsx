'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Trash2,
  RefreshCw,
  Layers,
  Calendar,
  CheckSquare,
  Square,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatTimestamp } from '@/lib/utils';
import { StatusBadge } from '@/components/upload/StatusBadge';
import type { DocumentResponse } from '@/types/api';

interface DocumentListProps {
  documents: DocumentResponse[];
  selectedDocIds: Set<string>;
  onToggleDocSelect: (docId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDocumentDeleted: (docId: string) => void;
  onDocumentUpdated: (updatedDoc: DocumentResponse) => void;
  onRefreshList: () => Promise<void>;
  isLoading?: boolean;
}

export function DocumentList({
  documents,
  selectedDocIds,
  onToggleDocSelect,
  onSelectAll,
  onClearSelection,
  onDocumentDeleted,
  onDocumentUpdated,
  onRefreshList,
  isLoading = false,
}: DocumentListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const backoffDelayRef = useRef<number>(2000);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Check if any document is currently in non-terminal state (pending or processing)
  const activeDocs = documents.filter(
    (d) => d.status === 'pending' || d.status === 'processing'
  );
  const hasActiveDocs = activeDocs.length > 0;

  // Adaptive Polling Effect
  useEffect(() => {
    if (!hasActiveDocs) {
      backoffDelayRef.current = 2000;
      return;
    }

    let isCancelled = false;

    const poll = async () => {
      try {
        await Promise.all(
          activeDocs.map(async (doc) => {
            try {
              const updated = await api.getDocumentStatus(doc.id);
              if (!isCancelled && updated.status !== doc.status) {
                onDocumentUpdated(updated);
              }
            } catch {
              // Ignore transient error
            }
          })
        );
        backoffDelayRef.current = Math.min(backoffDelayRef.current * 1.5, 12000);
      } catch {
        // Ignore batch error
      } finally {
        if (!isCancelled && hasActiveDocs) {
          pollingTimeoutRef.current = setTimeout(poll, backoffDelayRef.current);
        }
      }
    };

    pollingTimeoutRef.current = setTimeout(poll, backoffDelayRef.current);

    return () => {
      isCancelled = true;
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
      }
    };
  }, [hasActiveDocs, activeDocs, onDocumentUpdated]);

  const handleDelete = async (docId: string) => {
    try {
      setDeletingId(docId);
      await api.deleteDocument(docId);
      onDocumentDeleted(docId);
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete document.');
    } finally {
      setDeletingId(null);
    }
  };

  const allSelected =
    documents.length > 0 && selectedDocIds.size === documents.length;

  return (
    <div className="w-full flex flex-col gap-3">
      {/* List Header & Scoping Controls */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs uppercase tracking-wider text-slate-400">
            Repository Documents
          </span>
          <span className="px-2 py-0.2 rounded text-[11px] font-mono bg-slate-800 text-slate-300">
            {documents.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {documents.length > 0 && (
            <button
              onClick={allSelected ? onClearSelection : onSelectAll}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
              title={allSelected ? 'Clear all document filters' : 'Select all documents for queries'}
            >
              {allSelected ? (
                <>
                  <Square className="w-3 h-3" />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <CheckSquare className="w-3 h-3" />
                  <span>Select All</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => onRefreshList()}
            disabled={isLoading}
            className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
            title="Refresh documents list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Scoping Summary Indicator */}
      {documents.length > 0 && (
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
          <span>
            {selectedDocIds.size === 0 ? (
              <span className="text-slate-300 font-medium">Scope: All Documents (Corpus-wide)</span>
            ) : (
              <span className="text-indigo-300 font-medium">
                Scope: {selectedDocIds.size} of {documents.length} Selected Document(s)
              </span>
            )}
          </span>
          {selectedDocIds.size > 0 && (
            <button
              onClick={onClearSelection}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors underline"
            >
              Reset Scope
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {documents.length === 0 && !isLoading && (
        <div className="text-center py-6 px-4 border border-[#1c232f] rounded bg-[#161c26]">
          <FileText className="w-6 h-6 mx-auto mb-1.5 text-slate-500" />
          <p className="text-xs text-slate-400">No documents uploaded yet</p>
        </div>
      )}

      {/* Documents Item List */}
      <div className="flex flex-col gap-2 max-h-[460px] overflow-y-auto pr-1">
        {documents.map((doc) => {
          const isSelected = selectedDocIds.has(doc.id);
          const isDeleting = deletingId === doc.id;
          const isConfirmingDelete = deleteConfirmId === doc.id;

          return (
            <div
              key={doc.id}
              className={`p-2.5 rounded border transition-colors ${
                isSelected
                  ? 'bg-[#1a2130] border-indigo-500/60'
                  : 'bg-[#161c26] border-[#1c232f] hover:border-[#2a3547]'
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                {/* Selection Checkbox & File Info */}
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <button
                    onClick={() => onToggleDocSelect(doc.id)}
                    className="mt-0.5 text-slate-400 hover:text-indigo-400 transition-colors shrink-0"
                    title={isSelected ? 'Remove from query scope' : 'Include in query scope'}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs font-medium text-slate-200 truncate cursor-pointer hover:text-indigo-300 transition-colors"
                      title={doc.original_filename}
                      onClick={() => onToggleDocSelect(doc.id)}
                    >
                      {doc.original_filename}
                    </p>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500 font-mono">
                      {doc.page_count != null && doc.page_count > 0 && (
                        <span>{doc.page_count} {doc.page_count === 1 ? 'page' : 'pages'}</span>
                      )}
                      {doc.total_chunks != null && doc.total_chunks > 0 && (
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-slate-600" />
                          {doc.total_chunks} chunks
                        </span>
                      )}
                      {doc.uploaded_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-600" />
                          {formatTimestamp(doc.uploaded_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Badge & Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge
                    status={doc.status}
                    errorMessage={doc.error_message || undefined}
                  />

                  {/* Delete Action with Confirmation */}
                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-rose-900/60">
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={isDeleting}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-rose-600 text-white font-medium hover:bg-rose-500 transition-colors"
                      >
                        {isDeleting ? '...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="text-[10px] px-1 text-slate-400 hover:text-slate-200"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(doc.id)}
                      disabled={isDeleting}
                      className="text-slate-600 hover:text-rose-400 transition-colors p-1 rounded"
                      title="Delete document and chunk embeddings"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
