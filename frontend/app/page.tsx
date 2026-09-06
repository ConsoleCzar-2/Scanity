'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { SidebarDrawer } from '@/components/layout/SidebarDrawer';
import { AdminLogsModal } from '@/components/admin/AdminLogsModal';
import { UploadDropzone } from '@/components/upload/UploadDropzone';
import { DocumentList } from '@/components/upload/DocumentList';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { APP_NAME } from '@/lib/constants';
import type {
  HealthResponse,
  DocumentResponse,
} from '@/types/api';

export default function Home() {
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [adminLogsOpen, setAdminLogsOpen] = useState<boolean>(false);
  const [chatResetKey, setChatResetKey] = useState<number>(0);

  // Backend Health State
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Document Management State
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  // Health check handler
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const data = await api.checkHealth();
      setHealth(data);
      setHealthError(null);
    } catch (err: unknown) {
      setHealth(null);
      const msg = err instanceof Error ? err.message : 'Backend unreachable';
      setHealthError(msg);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // Fetch document catalog from backend
  const fetchDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    try {
      const res = await api.listDocuments(0, 100);
      setDocuments(res.documents || []);
    } catch {
      // Backend might be offline; handled gracefully
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  // Initial mount: load health and document catalog
  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [healthData, docData] = await Promise.allSettled([
          api.checkHealth(),
          api.listDocuments(0, 100),
        ]);

        if (isMounted) {
          if (healthData.status === 'fulfilled') {
            setHealth(healthData.value);
            setHealthError(null);
          } else {
            setHealth(null);
            setHealthError('Backend unreachable');
          }
          setHealthLoading(false);

          if (docData.status === 'fulfilled') {
            setDocuments(docData.value.documents || []);
          }
          setDocumentsLoading(false);
        }
      } catch {
        if (isMounted) {
          setHealthLoading(false);
          setDocumentsLoading(false);
        }
      }
    }

    loadInitialData();

    // Re-check health every 30s
    const healthInterval = setInterval(fetchHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(healthInterval);
    };
  }, [fetchHealth]);

  // Document handlers
  const handleUploadSuccess = (newDoc: DocumentResponse) => {
    setDocuments((prev) => {
      // Prepend or update
      const exists = prev.some((d) => d.id === newDoc.id);
      if (exists) {
        return prev.map((d) => (d.id === newDoc.id ? newDoc : d));
      }
      return [newDoc, ...prev];
    });
  };

  const handleDocumentUpdated = (updatedDoc: DocumentResponse) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === updatedDoc.id ? { ...d, ...updatedDoc } : d))
    );
  };

  const handleDocumentDeleted = (deletedId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== deletedId));
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      next.delete(deletedId);
      return next;
    });
  };

  const handleToggleDocSelect = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleSelectAllDocs = () => {
    setSelectedDocIds(new Set(documents.map((d) => d.id)));
  };

  const handleClearSelection = () => {
    setSelectedDocIds(new Set());
  };

  const handleNewChat = () => {
    setChatResetKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#090d16] text-slate-100">
      {/* Navigation Drawer */}
      <SidebarDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNewChat={handleNewChat}
        onOpenAdminLogs={() => setAdminLogsOpen(true)}
      />

      {/* Admin & Audit Logs Modal */}
      <AdminLogsModal
        isOpen={adminLogsOpen}
        onClose={() => setAdminLogsOpen(false)}
        health={health}
        totalDocuments={documents.length}
      />

      {/* Top Header Bar */}
      <Header
        onToggleDrawer={() => setDrawerOpen(true)}
        onOpenAdminLogs={() => setAdminLogsOpen(true)}
        health={health}
        healthLoading={healthLoading}
        healthError={healthError}
        onRefreshHealth={fetchHealth}
      />

      {/* Main Two-Column Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Document Ingestion & Management (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="enterprise-panel p-4 flex flex-col gap-3">
              <div className="border-b border-slate-800 pb-2">
                <h2 className="font-semibold text-sm text-white">Document Ingestion</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Upload enterprise PDFs to asynchronously parse, chunk, and index with pgvector.
                </p>
              </div>

              {/* Upload Dropzone */}
              <UploadDropzone
                onUploadSuccess={handleUploadSuccess}
                disabled={health?.status !== 'ok'}
              />

              {/* Document List */}
              <DocumentList
                documents={documents}
                selectedDocIds={selectedDocIds}
                onToggleDocSelect={handleToggleDocSelect}
                onSelectAll={handleSelectAllDocs}
                onClearSelection={handleClearSelection}
                onDocumentDeleted={handleDocumentDeleted}
                onDocumentUpdated={handleDocumentUpdated}
                onRefreshList={fetchDocuments}
                isLoading={documentsLoading}
              />
            </div>
          </div>

          {/* Right Column: Grounded Q&A Assistant (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="enterprise-panel p-4">
              <ChatContainer
                key={chatResetKey}
                selectedDocIds={selectedDocIds}
                totalDocCount={documents.length}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-3 mt-auto bg-[#090d16]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 font-mono">
          <span>{APP_NAME} — Enterprise AI-Powered Document Q&amp;A</span>
          <span>Next.js 15 App Router • TypeScript • Tailwind CSS</span>
        </div>
      </footer>
    </div>
  );
}
