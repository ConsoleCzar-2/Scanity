'use client';

import React, { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
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
import {
  getStoredSessions,
  getActiveSessionId,
  setActiveSessionId,
  createNewSession,
  deleteStoredSession,
  saveSession,
  type ChatSession,
} from '@/lib/chatStorage';
import type {
  HealthResponse,
  DocumentResponse,
} from '@/types/api';

function subscribeAuth(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getClientUser(): UserProfile | null {
  return getCurrentUser();
}

function getServerUser(): UserProfile | null {
  return null;
}

export default function ChatWorkspacePage() {
  const router = useRouter();
  const authUser = useSyncExternalStore(subscribeAuth, getClientUser, getServerUser);
  const [profileUser, setProfileUser] = useState<UserProfile | null>(null);
  const currentUser = profileUser || authUser;

  // Parameter state (tuned by Admin via SidebarDrawer)
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [topK, setTopK] = useState<number>(DEFAULT_TOP_K);

  // Dialog & drawer states
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [adminLogsOpen, setAdminLogsOpen] = useState<boolean>(false);
  const [profileOpen, setProfileOpen] = useState<boolean>(false);

  // Conversation Session State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string>('');
  const [isStorageLoaded, setIsStorageLoaded] = useState<boolean>(false);

  // Backend Health State
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // Document Management State
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  // Verify authentication once mounted on client
  useEffect(() => {
    if (typeof window !== 'undefined' && !getCurrentUser()) {
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
    if (!currentUser) return;

    let isSubscribed = true;

    async function loadInitialData() {
      try {
        const [healthData, docData] = await Promise.allSettled([
          api.checkHealth(),
          api.listDocuments(0, 100),
        ]);

        if (isSubscribed) {
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
        if (isSubscribed) {
          setDocumentsLoading(false);
        }
      }
    }

    loadInitialData();

    // Re-check health every 30s
    const healthInterval = setInterval(fetchHealth, 30000);
    return () => {
      isSubscribed = false;
      clearInterval(healthInterval);
    };
  }, [fetchHealth, currentUser]);

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

  // Initialize sessions from localStorage once on client
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = setTimeout(() => {
      const stored = getStoredSessions();
      if (stored.length > 0) {
        setSessions(stored);
        const savedActive = getActiveSessionId();
        if (savedActive && stored.some((s) => s.id === savedActive)) {
          setActiveSessionIdState(savedActive);
        } else {
          setActiveSessionIdState(stored[0].id);
          setActiveSessionId(stored[0].id);
        }
      } else {
        const initial = createNewSession('Initial Conversation');
        setSessions([initial]);
        setActiveSessionIdState(initial.id);
      }
      setIsStorageLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleSelectSession = (id: string) => {
    setActiveSessionIdState(id);
    setActiveSessionId(id);
  };

  const handleNewChat = () => {
    const newSession = createNewSession('New Conversation');
    setSessions((prev) => [newSession, ...prev.filter((s) => s.id !== newSession.id)]);
    setActiveSessionIdState(newSession.id);
  };

  const handleDeleteSession = (id: string) => {
    deleteStoredSession(id);
    api.deleteSession(id).catch(() => {});

    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fresh = createNewSession('New Conversation');
        setActiveSessionIdState(fresh.id);
        return [fresh];
      }
      if (activeSessionId === id) {
        setActiveSessionIdState(remaining[0].id);
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleSessionTitleUpdate = (sessId: string, newTitle: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === sessId) {
          const updated = { ...s, title: newTitle, updatedAt: new Date().toISOString() };
          saveSession(updated);
          return updated;
        }
        return s;
      })
    );
  };

  const handleSignOut = () => {
    logout();
    router.push('/');
  };

  const handleUpdateParameters = (newThreshold: number, newTopK: number) => {
    setThreshold(newThreshold);
    setTopK(newTopK);
  };

  if (!currentUser) {
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
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
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
        onProfileUpdated={(u) => setProfileUser(u)}
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
              {isStorageLoaded && activeSessionId ? (
                <ChatContainer
                  key={activeSessionId}
                  sessionId={activeSessionId}
                  selectedDocIds={selectedDocIds}
                  totalDocCount={documents.length}
                  threshold={threshold}
                  topK={topK}
                  onSessionTitleUpdate={handleSessionTitleUpdate}
                />
              ) : (
                <div className="min-h-[580px] flex items-center justify-center text-slate-500 font-mono text-xs">
                  Initializing conversation session...
                </div>
              )}
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
