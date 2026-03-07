// lib/sse.ts — Server-Sent Events broadcaster
// Holds in-memory state per session and fans out events to connected players.

import type { SSEEvent } from '@/types';

interface SessionState {
  fogPng: string | null;
  camera: { x: number; y: number; w: number; h: number } | null;
  blackout: { active: boolean; message?: string } | null;
  objects: Array<{ id: string; name: string; src: string; x: number; y: number; w: number; h: number; zIndex: number; visible: boolean; locked: boolean }>;
  listeners: Set<(event: SSEEvent) => void>;
}

const sessions = new Map<string, SessionState>();

function getSession(slug: string): SessionState {
  if (!sessions.has(slug)) {
    sessions.set(slug, { fogPng: null, camera: null, blackout: null, objects: [], listeners: new Set() });
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

export function setCameraState(slug: string, camera: { x: number; y: number; w: number; h: number }) {
  const state = getSession(slug);
  state.camera = camera;
}

export function getCameraState(slug: string): { x: number; y: number; w: number; h: number } | null {
  return sessions.get(slug)?.camera ?? null;
}

export function setBlackoutState(slug: string, blackout: { active: boolean; message?: string } | null) {
  const state = getSession(slug);
  state.blackout = blackout;
}

export function getBlackoutState(slug: string): { active: boolean; message?: string } | null {
  return sessions.get(slug)?.blackout ?? null;
}

export function setObjectsState(slug: string, objects: SessionState['objects']) {
  const state = getSession(slug);
  state.objects = objects;
}

export function getObjectsState(slug: string): SessionState['objects'] {
  return sessions.get(slug)?.objects ?? [];
}
