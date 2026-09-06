'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getCurrentUser, logout, UserProfile } from '@/lib/auth';
import { Header } from '@/components/layout/Header';
import { SidebarDrawer } from '@/components/layout/SidebarDrawer';
import { ProfileModal } from '@/components/layout/ProfileModal';
import { AdminLogsModal } from '@/components/admin/AdminLogsModal';
import { UploadDropzone } from '@/components/upload/UploadDropzone';
import { DocumentList } from '@/components/upload/DocumentList';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { APP_NAME, DEFAULT_THRESHOLD, DEFAULT_TOP_K } from '@/lib/constants';
import type {
  HealthResponse,
  DocumentResponse,
} from '@/types/api';

export default function ChatWorkspacePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getCurrentUser());
  const [isAuthChecking] = useState<boolean>(() => !getCurrentUser());

  // Parameter state (tuned by Admin via SidebarDrawer)
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [topK, setTopK] = useState<number>(DEFAULT_TOP_K);

  // Dialog & drawer states
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [adminLogsOpen, setAdminLogsOpen] = useState<boolean>(false);
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [chatResetKey, setChatResetKey] = useState<number>(0);

  // Backend Health State
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Document Management State
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  // Verify authentication on mount
  useEffect(() => {
    if (!getCurrentUser()) {
      router.push('/login');
    }
  }, [router]);

  // Health check handler
  const fetchHealth = useCallback(async () => {
    try {
      const data = await api.checkHealth();
      setHealth(data);
    } catch {
      setHealth(null);
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
    if (isAuthChecking) return;

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
          } else {
            setHealth(null);
          }

          if (docData.status === 'fulfilled') {
            setDocuments(docData.value.documents || []);
          }
          setDocumentsLoading(false);
        }
      } catch {
        if (isMounted) {
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
  }, [fetchHealth, isAuthChecking]);

  // Document handlers
  const handleUploadSuccess = (newDoc: DocumentResponse) => {
    setDocuments((prev) => {
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

  const handleSignOut = () => {
    logout();
    router.push('/');
  };

  const handleUpdateParameters = (newThreshold: number, newTopK: number) => {
    setThreshold(newThreshold);
    setTopK(newTopK);
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#090b0e] flex items-center justify-center text-slate-400 font-mono text-xs">
        Verifying authorization...
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#090b0e] text-slate-100">
      {/* Navigation Drawer with RBAC controls */}
      <SidebarDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNewChat={handleNewChat}
        onOpenAdminLogs={() => setAdminLogsOpen(true)}
        user={currentUser}
        threshold={threshold}
        topK={topK}
        onUpdateParameters={handleUpdateParameters}
      />

      {/* Admin & Audit Logs Modal (Only accessible by Admin) */}
      <AdminLogsModal
        isOpen={adminLogsOpen}
        onClose={() => setAdminLogsOpen(false)}
        health={health}
        totalDocuments={documents.length}
        totalChunks={documents.reduce((acc, d) => acc + (d.total_chunks || 0), 0)}
      />

      {/* User Profile Modal */}
      <ProfileModal
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        onProfileUpdated={(u) => setCurrentUser(u)}
      />

      {/* Extreme Left-to-Right Header Bar with Home Link */}
      <Header
        onToggleDrawer={() => setDrawerOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        onSignOut={handleSignOut}
        user={currentUser}
      />

      {/* Main Full-Width Workspace */}
      <main className="flex-1 w-full px-4 sm:px-6 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Document Ingestion (4 cols on desktop) */}
          <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-3">
            <div className="enterprise-panel p-3.5 flex flex-col gap-3">
              <div className="border-b border-[#1c232f] pb-2 flex items-center justify-between">
                <h2 className="font-semibold text-xs text-white uppercase tracking-wider font-mono">
                  Document Catalog
                </h2>
                <span className="text-[10px] text-slate-400 font-mono">
                  {documents.length} Indexed
                </span>
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

          {/* Right Column: Grounded Q&A Assistant (8 cols on desktop) */}
          <div className="lg:col-span-8 xl:col-span-8 flex flex-col gap-4">
            <div className="enterprise-panel p-3.5">
              <ChatContainer
                key={chatResetKey}
                selectedDocIds={selectedDocIds}
                totalDocCount={documents.length}
                threshold={threshold}
                topK={topK}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Edge-to-Edge Minimal Footer */}
      <footer className="w-full border-t border-[#1c232f] py-2.5 bg-[#090b0e]">
        <div className="w-full px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400 font-mono">
          <span>{APP_NAME} — Enterprise AI Document Q&amp;A</span>
          <span>Next.js 15 App Router • pgvector • Celery</span>
        </div>
      </footer>
    </div>
  );
}
