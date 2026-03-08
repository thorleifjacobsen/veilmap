// lib/ws-store.ts — Shared in-memory WebSocket state store
// Holds active WS connections and per-session state.
// Imported by server.ts and by Next.js API routes that need to broadcast events.

import type WebSocket from 'ws';
import type { MapObject } from '@/types';

export interface WSEvent {
  type: string;
  payload?: unknown;
}

export interface SessionConnections {
  gm: Set<WebSocket>;
  players: Set<WebSocket>;
}

export interface SessionState {
  fogPng: string | null;
  camera: { x: number; y: number; w: number; h: number } | null;
  blackout: { active: boolean; message?: string } | null;
  objects: MapObject[];
}

const connections = new Map<string, SessionConnections>();
const state = new Map<string, SessionState>();

// ── Connection management ──

function getConnections(slug: string): SessionConnections {
  if (!connections.has(slug)) {
    connections.set(slug, { gm: new Set(), players: new Set() });
  }
  return connections.get(slug)!;
}

export function addConnection(slug: string, role: 'gm' | 'player', ws: WebSocket) {
  const room = getConnections(slug);
  if (role === 'gm') {
    room.gm.add(ws);
  } else {
    room.players.add(ws);
  }
}

export function removeConnection(slug: string, role: 'gm' | 'player', ws: WebSocket) {
  const room = connections.get(slug);
  if (!room) return;
  if (role === 'gm') {
    room.gm.delete(ws);
  } else {
    room.players.delete(ws);
  }
  if (room.gm.size === 0 && room.players.size === 0) {
    // Delay cleanup so a quick reconnect doesn't lose state
    setTimeout(() => {
      const current = connections.get(slug);
      if (current && current.gm.size === 0 && current.players.size === 0) {
        connections.delete(slug);
      }
    }, 60_000);
  }
}

// ── Broadcast helpers ──

/** Send an event to all player connections for a slug */
export function broadcastPlayers(slug: string, event: WSEvent) {
  const room = connections.get(slug);
  if (!room) return;
  const msg = JSON.stringify(event);
  for (const ws of room.players) {
    try {
      if (ws.readyState === 1 /* OPEN */) ws.send(msg);
    } catch { /* ignore closed socket */ }
  }
}

/** Send an event to all GM connections for a slug */
export function broadcastGMs(slug: string, event: WSEvent) {
  const room = connections.get(slug);
  if (!room) return;
  const msg = JSON.stringify(event);
  for (const ws of room.gm) {
    try {
      if (ws.readyState === 1 /* OPEN */) ws.send(msg);
    } catch { /* ignore closed socket */ }
  }
}

/** Send an event to ALL connections (GM + players) for a slug */
export function broadcast(slug: string, event: WSEvent) {
  broadcastGMs(slug, event);
  broadcastPlayers(slug, event);
}

// ── Per-session state ──

function getState(slug: string): SessionState {
  if (!state.has(slug)) {
    state.set(slug, { fogPng: null, camera: null, blackout: null, objects: [] });
  }
  return state.get(slug)!;
}

export function setFogState(slug: string, png: string) {
  getState(slug).fogPng = png;
}

export function getFogState(slug: string): string | null {
  return state.get(slug)?.fogPng ?? null;
}

export function setCameraState(slug: string, camera: { x: number; y: number; w: number; h: number }) {
  getState(slug).camera = camera;
}

export function getCameraState(slug: string): { x: number; y: number; w: number; h: number } | null {
  return state.get(slug)?.camera ?? null;
}

export function setBlackoutState(slug: string, blackout: { active: boolean; message?: string } | null) {
  getState(slug).blackout = blackout;
}

export function getBlackoutState(slug: string): { active: boolean; message?: string } | null {
  return state.get(slug)?.blackout ?? null;
}

export function setObjectsState(slug: string, objects: MapObject[]) {
  getState(slug).objects = objects;
}

export function getObjectsState(slug: string): MapObject[] {
  return state.get(slug)?.objects ?? [];
}
