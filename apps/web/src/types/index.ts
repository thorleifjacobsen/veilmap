// types/index.ts

export type BoxType = 'autoReveal' | 'trigger' | 'hazard' | 'note' | 'hidden';

export interface Box {
  id: string;
  sessionId: string;
  name: string;
  type: BoxType;
  x: number; y: number; w: number; h: number;
  color: string;
  notes: string;
  metaJson: Record<string, unknown>;
  revealed: boolean;
  sortOrder: number;
}

export interface Token {
  id: string;
  sessionId: string;
  emoji: string;
  color: string;
  x: number; y: number;
  label: string;
}

export interface Session {
  id: string;
  slug: string;
  ownerId: string;
  name: string;
  mapUrl: string | null;
  mapWidth: number;
  mapHeight: number;
  prepMode: boolean;
  prepMessage: string;
  gmFogOpacity: number;
  gridSize: number;
  boxes: Box[];
  tokens: Token[];
}

export interface ViewportState {
  x: number;       // pan offset x (pixels)
  y: number;       // pan offset y (pixels)
  scale: number;   // zoom level (1.0 = 100%)
}

// ── WebSocket Event Types ──────────────────────────────────────────────────

export type WSEventType =
  | 'fog:paint'
  | 'fog:snapshot'
  | 'fog:reset'
  | 'box:reveal'
  | 'box:hide'
  | 'box:create'
  | 'box:update'
  | 'box:delete'
  | 'token:move'
  | 'token:create'
  | 'token:delete'
  | 'session:prep'
  | 'session:settings'
  | 'ping'
  | 'connected'
  | 'state:full';  // sent to new player connections with full current state

export interface WSMessage {
  type: WSEventType;
  sessionSlug: string;
  payload: unknown;
}

// Specific payloads
export interface FogPaintPayload {
  x: number; y: number;
  radius: number;
  mode: 'reveal' | 'hide';
}

export interface FogSnapshotPayload {
  png: string;    // base64 encoded PNG of full fog canvas
}

export interface BoxRevealPayload {
  boxId: string;
}

export interface TokenMovePayload {
  tokenId: string;
  x: number; y: number;
}

export interface PingPayload {
  x: number; y: number;
}

export interface PrepPayload {
  active: boolean;
  message?: string;
}

export interface FullStatePayload {
  session: Session;
  fogPng: string | null;   // base64 current fog state
}
