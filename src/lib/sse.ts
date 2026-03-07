// lib/sse.ts — Server-Sent Events broadcaster
// Holds in-memory state per session and fans out events to connected players.

import type { SSEEvent } from '@/types';

interface SessionState {
  fogPng: string | null; // base64 fog snapshot held in RAM
  listeners: Set<(event: SSEEvent) => void>;
}

const sessions = new Map<string, SessionState>();

function getSession(slug: string): SessionState {
  if (!sessions.has(slug)) {
    sessions.set(slug, { fogPng: null, listeners: new Set() });
  }
  return sessions.get(slug)!;
}

/** Subscribe a player display to SSE events for a session */
export function subscribe(slug: string, listener: (event: SSEEvent) => void): () => void {
  const state = getSession(slug);
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
    // Clean up empty sessions from memory after a delay
    if (state.listeners.size === 0) {
      setTimeout(() => {
        const current = sessions.get(slug);
        if (current && current.listeners.size === 0) {
          sessions.delete(slug);
        }
      }, 60_000);
    }
  };
}

/** Broadcast an SSE event to all listeners on a session */
export function broadcast(slug: string, event: SSEEvent) {
  const state = sessions.get(slug);
  if (!state) return;
  for (const listener of state.listeners) {
    listener(event);
  }
}

/** Store current fog state in memory (for reconnecting players) */
export function setFogState(slug: string, png: string) {
  const state = getSession(slug);
  state.fogPng = png;
}

/** Get current fog state from memory */
export function getFogState(slug: string): string | null {
  return sessions.get(slug)?.fogPng ?? null;
}

/** Get listener count for a session */
export function getListenerCount(slug: string): number {
  return sessions.get(slug)?.listeners.size ?? 0;
}
