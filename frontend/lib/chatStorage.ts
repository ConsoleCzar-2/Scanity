'use client';

import type { ChatMessage } from '@/components/chat/MessageItem';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const SESSIONS_STORAGE_KEY = 'scanity_chat_sessions_v1';
const ACTIVE_SESSION_KEY = 'scanity_active_session_id';
const MESSAGES_PREFIX = 'scanity_chat_messages_';

/**
 * Generates a clean, human-readable session title from the first prompt.
 */
export function generateSessionTitle(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New Conversation';
  if (cleaned.length <= 42) return cleaned;
  return cleaned.substring(0, 42).trim() + '...';
}

/**
 * Generates a unique UUID or timestamp-based ID.
 */
export function generateSessionId(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    try {
      return window.crypto.randomUUID();
    } catch {
      // Fallback below
    }
  }
  return 'sess-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
}

/**
 * Retrieves all stored chat sessions, sorted by updatedAt descending.
 */
export function getStoredSessions(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.sort(
        (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
      );
    }
  } catch (err) {
    console.error('Failed to parse stored chat sessions:', err);
  }
  return [];
}

/**
 * Retrieves the currently active session ID from localStorage.
 */
export function getActiveSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACTIVE_SESSION_KEY);
}

/**
 * Persists the active session ID in localStorage.
 */
export function setActiveSessionId(sessionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
  } catch (err) {
    console.error('Failed to set active session ID:', err);
  }
}

/**
 * Creates a new chat session, saves it, sets it as active, and returns it.
 */
export function createNewSession(initialTitle: string = 'New Conversation'): ChatSession {
  const newSession: ChatSession = {
    id: generateSessionId(),
    title: initialTitle,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const current = getStoredSessions();
  const updated = [newSession, ...current.filter((s) => s.id !== newSession.id)];
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
    setActiveSessionId(newSession.id);
  } catch (err) {
    console.error('Failed to save new session:', err);
  }

  return newSession;
}

/**
 * Updates or appends a session in storage.
 */
export function saveSession(session: ChatSession): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredSessions();
    const index = current.findIndex((s) => s.id === session.id);
    let updated: ChatSession[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = { ...session, updatedAt: new Date().toISOString() };
    } else {
      updated = [{ ...session, updatedAt: new Date().toISOString() }, ...current];
    }
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save session:', err);
  }
}

/**
 * Deletes a session and its associated message thread from localStorage.
 */
export function deleteStoredSession(sessionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getStoredSessions();
    const updated = current.filter((s) => s.id !== sessionId);
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
    localStorage.removeItem(MESSAGES_PREFIX + sessionId);

    if (getActiveSessionId() === sessionId) {
      if (updated.length > 0) {
        setActiveSessionId(updated[0].id);
      } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    }
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
}

/**
 * Retrieves the message thread for a given session.
 */
export function getStoredMessages(sessionId: string): ChatMessage[] {
  if (typeof window === 'undefined' || !sessionId) return [];
  try {
    const raw = localStorage.getItem(MESSAGES_PREFIX + sessionId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Filter out transient placeholder messages
      return parsed.filter((m) => !m.isThinking);
    }
  } catch (err) {
    console.error(`Failed to load messages for session ${sessionId}:`, err);
  }
  return [];
}

/**
 * Persists the message thread for a given session.
 */
export function saveStoredMessages(sessionId: string, messages: ChatMessage[]): void {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    // Only save completed, non-thinking messages
    const toSave = messages.filter((m) => !m.isThinking);
    localStorage.setItem(MESSAGES_PREFIX + sessionId, JSON.stringify(toSave));

    // Also touch the session's updatedAt timestamp
    const sessions = getStoredSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      session.updatedAt = new Date().toISOString();
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    }
  } catch (err) {
    console.error(`Failed to save messages for session ${sessionId}:`, err);
  }
}
