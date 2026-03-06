# VeilMap — Architecture & Technical Specification

> **For AI assistants (GitHub Copilot, Claude, etc.):**  
> This document is the authoritative spec for VeilMap — a self-hosted SaaS DnD Fog of War tool.
> When generating code, always follow the patterns, naming conventions, and data structures defined here.
> Do not introduce Supabase, Firebase, or any managed BaaS. All backend is custom Node.js + PostgreSQL + WebSocket.

---

## Product Overview

VeilMap is a real-time collaborative map tool for tabletop RPG game masters.

**Core flow:**
1. GM logs in → creates a session → gets two URLs
2. `veilmap.app/gm/[slug]` — GM view (laptop): draws fog, places tokens, manages meta boxes
3. `veilmap.app/play/[slug]` — Player display (projector/TV): fullscreen, receives live updates, shows only revealed areas

**Key differentiators vs. Roll20/Owlbear:**
- Projector-first design (fullscreen display URL with no UI chrome)
- Prep Mode: GM can prep next scene while players see a loading screen
- Meta Box system: zones with types (autoReveal, trigger, hazard, note) that snap-reveal on brush contact
- Self-hosted, no third-party services

---

## Tech Stack

```
Runtime:        Node.js 20+ (ESM)
Framework:      Next.js 14 (App Router)
Database:       PostgreSQL 15+ (via postgres.js — NOT pg, NOT Prisma)
Realtime:       ws (native WebSocket server, sidecar to Next.js)
Auth:           NextAuth.js v5 (credentials provider)
Styling:        Tailwind CSS + CSS Modules for canvas UI
Deployment:     Single VPS (Ubuntu) — Next.js + WS server as systemd services
Reverse proxy:  Nginx (handles TLS, proxies /ws → WebSocket port)
```

**Explicitly NOT used:** Supabase, Firebase, Pusher, Prisma, tRPC, GraphQL, Redux, React Query (use SWR if needed).

---

## Repository Structure

```
veilmap/
├── apps/
│   └── web/                          # Next.js app
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/page.tsx
│       │   │   └── register/page.tsx
│       │   ├── dashboard/
│       │   │   └── page.tsx          # Session list, create new session
│       │   ├── gm/
│       │   │   └── [slug]/
│       │   │       └── page.tsx      # GM editor view
│       │   ├── play/
│       │   │   └── [slug]/
│       │   │       └── page.tsx      # Player display (fullscreen, no nav)
│       │   ├── api/
│       │   │   ├── auth/[...nextauth]/route.ts
│       │   │   ├── sessions/
│       │   │   │   ├── route.ts          # GET (list), POST (create)
│       │   │   │   └── [slug]/
│       │   │   │       ├── route.ts      # GET, PATCH, DELETE
│       │   │   │       ├── boxes/route.ts
│       │   │   │       ├── tokens/route.ts
│       │   │   │       └── fog/route.ts  # Save fog snapshot
│       │   └── layout.tsx
│       ├── components/
│       │   ├── gm/
│       │   │   ├── GMCanvas.tsx      # Main canvas orchestrator
│       │   │   ├── Toolbar.tsx
│       │   │   ├── RightPanel.tsx
│       │   │   ├── BoxEditor.tsx     # Modal for editing meta boxes
│       │   │   ├── SettingsModal.tsx
│       │   │   └── ContextMenu.tsx
│       │   ├── player/
│       │   │   ├── PlayerCanvas.tsx  # Fullscreen display canvas
│       │   │   └── PrepScreen.tsx    # Shown during prep mode
│       │   └── ui/                   # Shared UI primitives
│       ├── lib/
│       │   ├── db.ts                 # postgres.js client (singleton)
│       │   ├── ws-client.ts          # Browser WebSocket hook
│       │   ├── fog-engine.ts         # Canvas fog logic (pure functions)
│       │   ├── viewport.ts           # Pan/zoom math
│       │   └── session-store.ts      # In-memory session state (server)
│       └── types/
│           └── index.ts              # All shared TypeScript types
│
├── server/
│   └── ws-server.ts                  # Standalone WS server (Node.js)
│
├── db/
│   ├── schema.sql                    # Full schema
│   └── migrations/
│       └── 001_initial.sql
│
├── nginx/
│   └── veilmap.conf
└── README.md
```

---

## Database Schema

```sql
-- db/schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         TEXT UNIQUE NOT NULL,          -- human-readable URL segment e.g. "krypt-av-azarath"
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'New Session',
  map_url      TEXT,                          -- URL to uploaded map image (local /uploads/ or object storage)
  map_width    INTEGER DEFAULT 2400,
  map_height   INTEGER DEFAULT 1600,
  fog_snapshot BYTEA,                         -- compressed PNG of fog canvas, saved on disconnect
  prep_mode    BOOLEAN DEFAULT FALSE,
  prep_message TEXT DEFAULT 'Preparing next scene…',
  gm_fog_opacity REAL DEFAULT 0.5,
  grid_size    INTEGER DEFAULT 32,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE boxes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'Room',
  type         TEXT NOT NULL DEFAULT 'autoReveal'
               CHECK (type IN ('autoReveal','trigger','hazard','note','hidden')),
  x            REAL NOT NULL,
  y            REAL NOT NULL,
  w            REAL NOT NULL,
  h            REAL NOT NULL,
  color        TEXT DEFAULT '#c8963e',
  notes        TEXT DEFAULT '',
  meta_json    JSONB DEFAULT '{}',
  revealed     BOOLEAN DEFAULT FALSE,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tokens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  emoji        TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#e05c2a',
  x            REAL NOT NULL,
  y            REAL NOT NULL,
  label        TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast session lookups
CREATE INDEX idx_boxes_session    ON boxes(session_id);
CREATE INDEX idx_tokens_session   ON tokens(session_id);
CREATE INDEX idx_sessions_slug    ON sessions(slug);
CREATE INDEX idx_sessions_owner   ON sessions(owner_id);
```

---

## TypeScript Types

```typescript
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
```

---

## WebSocket Server

```typescript
// server/ws-server.ts
// Run as a separate Node.js process alongside Next.js
// Port: 3001 (proxied via Nginx from /ws)

import { WebSocketServer, WebSocket } from 'ws';
import { db } from '../apps/web/lib/db.js';

const PORT = 3001;
const wss = new WebSocketServer({ port: PORT });

// In-memory rooms: slug → Set<WebSocket>
const rooms = new Map<string, Set<WebSocket>>();

// In-memory fog state per session: slug → Buffer (PNG)
const fogState = new Map<string, Buffer>();

wss.on('connection', (ws, req) => {
  // URL format: ws://host/ws?slug=session-slug&role=gm|player
  const url = new URL(req.url!, `http://localhost`);
  const slug = url.searchParams.get('slug');
  const role = url.searchParams.get('role') as 'gm' | 'player';

  if (!slug) { ws.close(1008, 'Missing slug'); return; }

  // Join room
  if (!rooms.has(slug)) rooms.set(slug, new Set());
  rooms.get(slug)!.add(ws);

  // Send full state to new connection
  sendFullState(ws, slug);

  ws.on('message', async (data) => {
    const msg: WSMessage = JSON.parse(data.toString());

    // Only GMs can send mutating events
    if (role !== 'gm' && msg.type !== 'ping') return;

    // Persist important state changes to DB
    await persistEvent(msg);

    // Broadcast to all OTHER clients in the room
    broadcast(slug, msg, ws);
  });

  ws.on('close', () => {
    rooms.get(slug)?.delete(ws);
    if (rooms.get(slug)?.size === 0) rooms.delete(slug);
  });
});

function broadcast(slug: string, msg: WSMessage, sender?: WebSocket) {
  rooms.get(slug)?.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg));
    }
  });
}

async function sendFullState(ws: WebSocket, slug: string) {
  const session = await db`
    SELECT s.*, 
      json_agg(DISTINCT b.*) FILTER (WHERE b.id IS NOT NULL) as boxes,
      json_agg(DISTINCT t.*) FILTER (WHERE t.id IS NOT NULL) as tokens
    FROM sessions s
    LEFT JOIN boxes b ON b.session_id = s.id
    LEFT JOIN tokens t ON t.session_id = s.id
    WHERE s.slug = ${slug}
    GROUP BY s.id
  `;
  if (!session.length) return;

  const fogPng = fogState.get(slug) ? fogState.get(slug)!.toString('base64') : null;

  const payload: FullStatePayload = { session: session[0], fogPng };
  ws.send(JSON.stringify({ type: 'state:full', sessionSlug: slug, payload }));
}

async function persistEvent(msg: WSMessage) {
  const { type, sessionSlug, payload } = msg;
  const p = payload as any;

  switch(type) {
    case 'fog:snapshot':
      fogState.set(sessionSlug, Buffer.from(p.png, 'base64'));
      await db`UPDATE sessions SET fog_snapshot=${Buffer.from(p.png,'base64')}, updated_at=NOW() WHERE slug=${sessionSlug}`;
      break;
    case 'box:reveal':
      await db`UPDATE boxes SET revealed=TRUE WHERE id=${p.boxId}`;
      break;
    case 'box:hide':
      await db`UPDATE boxes SET revealed=FALSE WHERE id=${p.boxId}`;
      break;
    case 'box:create':
      await db`INSERT INTO boxes ${db(p.box)} ON CONFLICT DO NOTHING`;
      break;
    case 'box:update':
      await db`UPDATE boxes SET ${db(p.updates)} WHERE id=${p.boxId}`;
      break;
    case 'box:delete':
      await db`DELETE FROM boxes WHERE id=${p.boxId}`;
      break;
    case 'token:create':
      await db`INSERT INTO tokens ${db(p.token)} ON CONFLICT DO NOTHING`;
      break;
    case 'token:move':
      await db`UPDATE tokens SET x=${p.x}, y=${p.y} WHERE id=${p.tokenId}`;
      break;
    case 'token:delete':
      await db`DELETE FROM tokens WHERE id=${p.tokenId}`;
      break;
    case 'session:prep':
      await db`UPDATE sessions SET prep_mode=${p.active}, prep_message=${p.message??'Preparing…'} WHERE slug=${sessionSlug}`;
      break;
    case 'session:settings':
      await db`UPDATE sessions SET gm_fog_opacity=${p.gmFogOpacity}, grid_size=${p.gridSize} WHERE slug=${sessionSlug}`;
      break;
  }
}
```

---

## Browser WebSocket Hook

```typescript
// lib/ws-client.ts

import { useEffect, useRef, useCallback } from 'react';
import type { WSMessage } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export function useSessionWS(slug: string, role: 'gm' | 'player', onMessage: (msg: WSMessage) => void) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    ws.current = new WebSocket(`${WS_URL}/ws?slug=${slug}&role=${role}`);

    ws.current.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch {}
    };

    ws.current.onclose = () => {
      // Reconnect after 2s
      reconnectTimer.current = setTimeout(connect, 2000);
    };
  }, [slug, role, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: WSMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
}
```

---

## Fog Engine (Pure Functions)

```typescript
// lib/fog-engine.ts
// All fog operations work on an offscreen canvas at MAP resolution.
// The GM view composites this with reduced opacity. The player view composites at full opacity.
// Fog is serialized as a PNG blob and sent via WebSocket on mouseup / periodically.

export const MAP_W = 2400;
export const MAP_H = 1600;
export const FOG_SAVE_INTERVAL_MS = 3000;

export function createFogCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MAP_W; c.height = MAP_H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#080710';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  return c;
}

export function paintReveal(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.globalCompositeOperation = 'destination-out';
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.65, 'rgba(0,0,0,0.9)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

export function paintHide(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.fillStyle = '#080710';
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}

export function revealBox(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }) {
  ctx.globalCompositeOperation = 'destination-out';
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const r = Math.max(box.w, box.h) * 0.78;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.8, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(box.x - 6, box.y - 6, box.w + 12, box.h + 12);
  ctx.globalCompositeOperation = 'source-over';
}

export async function fogToBase64(fogCanvas: HTMLCanvasElement): Promise<string> {
  return new Promise(resolve => {
    fogCanvas.toBlob(blob => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob!);
    }, 'image/png', 0.9);
  });
}

export function loadFogFromBase64(ctx: CanvasRenderingContext2D, base64: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { ctx.clearRect(0,0,MAP_W,MAP_H); ctx.drawImage(img,0,0); resolve(); };
    img.src = 'data:image/png;base64,' + base64;
  });
}
```

---

## Viewport Math

```typescript
// lib/viewport.ts

export interface Viewport { x: number; y: number; scale: number; }

export function screenToMap(sx: number, sy: number, vp: Viewport) {
  return { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
}

export function mapToScreen(mx: number, my: number, vp: Viewport) {
  return { x: mx * vp.scale + vp.x, y: my * vp.scale + vp.y };
}

export function zoomAt(vp: Viewport, sx: number, sy: number, factor: number, min=0.1, max=8): Viewport {
  const newScale = Math.min(max, Math.max(min, vp.scale * factor));
  return {
    scale: newScale,
    x: sx - (sx - vp.x) * (newScale / vp.scale),
    y: sy - (sy - vp.y) * (newScale / vp.scale),
  };
}

export function fitToContainer(mapW: number, mapH: number, cW: number, cH: number): Viewport {
  const scale = Math.min(cW / mapW, cH / mapH) * 0.92;
  return { scale, x: (cW - mapW * scale) / 2, y: (cH - mapH * scale) / 2 };
}

export function applyViewport(ctx: CanvasRenderingContext2D, vp: Viewport) {
  ctx.setTransform(vp.scale, 0, 0, vp.scale, vp.x, vp.y);
}
```

---

## API Routes

### `POST /api/sessions`
Create a new session. Generates a unique slug.

```typescript
// Body: { name: string }
// Returns: Session
```

### `GET /api/sessions/[slug]`
Get full session with boxes and tokens.

### `PATCH /api/sessions/[slug]`
Update session settings (name, map_url, prep_mode, etc.)

### `POST /api/sessions/[slug]/boxes`
Create a box. Also broadcasts `box:create` via WS.

### `PATCH /api/sessions/[slug]/boxes/[boxId]`
Update box (name, type, notes, revealed, etc.)

### `DELETE /api/sessions/[slug]/boxes/[boxId]`
Delete a box.

### `POST /api/sessions/[slug]/tokens`
Create a token.

### `PUT /api/sessions/[slug]/tokens/[tokenId]`
Update token position.

### `DELETE /api/sessions/[slug]/tokens/[tokenId]`
Delete token.

### `PUT /api/sessions/[slug]/fog`
Save fog snapshot (called periodically by GM client and on disconnect).
Body: `{ png: string }` (base64)

---

## Nginx Config

```nginx
# nginx/veilmap.conf

server {
    listen 443 ssl;
    server_name veilmap.app;

    # Next.js app
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket upgrade
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;   # keep WS alive for long sessions
    }

    # Map image uploads (served directly)
    location /uploads/ {
        alias /var/www/veilmap/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## Environment Variables

```bash
# .env.local

DATABASE_URL=postgresql://veilmap:password@localhost:5432/veilmap
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=https://veilmap.app
NEXT_PUBLIC_WS_URL=wss://veilmap.app
UPLOAD_DIR=/var/www/veilmap/uploads
MAX_UPLOAD_SIZE_MB=20
```

---

## Key Implementation Notes for Copilot

1. **Fog is offscreen at map resolution.** Never render fog directly at screen resolution — always paint to a `MAP_W × MAP_H` offscreen canvas, then composite onto screen via `drawImage` with the viewport transform.

2. **GM view vs Player view fog:** Same fog canvas, different `globalAlpha`. GM sees `gmFogOpacity` (e.g. 0.5), players see 1.0.

3. **Box snap-reveal:** When GM brushes in `reveal` mode, check if the brush center is inside any `autoReveal` or `trigger` box that isn't revealed. If yes, call `revealBox()` (which fills the whole box area) instead of painting the brush stroke.

4. **Fog sync strategy:** Don't send fog on every mousemove — that's too much data. Instead:
   - Send `fog:paint` events (x, y, radius, mode) in real-time (lightweight)
   - Player reconstructs by replaying paint events on their own offscreen canvas
   - Every 3 seconds (or on mouseup), send `fog:snapshot` with a full PNG (for reconnecting players)

5. **Prep Mode:** When `prepMode === true`, the player display shows `PrepScreen` component instead of `PlayerCanvas`. The GM can freely edit the map. When toggled off, broadcast `session:prep` event with `active: false` and the player display switches back to live canvas.

6. **Auth:** Only the session owner (by `owner_id`) can be the GM. Any unauthenticated user can access `/play/[slug]` as a viewer.

7. **Slug generation:** Use `adjective-noun-number` format (e.g. `dark-forest-42`). Keep a wordlist in `lib/slug.ts`.

8. **Upload strategy for MVP:** Store map images on local disk at `UPLOAD_DIR`. Serve via Nginx. No S3/object storage needed for MVP.

9. **Token drag:** Tokens are dragged in map space. On `mouseup`, emit `token:move` WS event. During drag, only update local state (don't spam WS events per frame).

10. **Undo:** Client-side only (no server-side undo). Keep a stack of fog canvas snapshots (max 20). Undo pops the stack and redraws the fog locally, then sends a full `fog:snapshot` to sync.

---

## MVP Checklist

### Auth & Sessions
- [ ] Registration / Login with email + password (bcrypt)
- [ ] Session creation with slug generation
- [ ] Session list on dashboard
- [ ] Delete session

### Map
- [ ] Upload map image (PNG/JPG/WEBP, max 20MB)
- [ ] Drag-and-drop upload
- [ ] Default dungeon map if no image uploaded
- [ ] Pan (Space+drag, middle mouse drag)
- [ ] Zoom (scroll wheel, pinch, +/- keys)
- [ ] Fit-to-screen button

### Fog
- [ ] Reveal brush (variable size)
- [ ] Hide brush
- [ ] Reset fog
- [ ] GM sees semi-transparent fog (adjustable opacity)
- [ ] Player sees full-opacity fog
- [ ] Undo (Ctrl+Z, client-side)

### Meta Boxes
- [ ] Draw box (drag)
- [ ] Select & edit box (name, type, color, notes)
- [ ] Types: autoReveal, trigger, hazard, note, hidden
- [ ] Brush-inside snap-reveal for autoReveal & trigger
- [ ] Reveal/hide single box from context menu
- [ ] Delete box
- [ ] Box list in right panel

### Tokens
- [ ] Place token (click to place from palette)
- [ ] Drag to move token
- [ ] Remove token (context menu)
- [ ] Token types: ⚔️🧙🗡️✨🐉👺💀🔥

### Realtime
- [ ] GM fog brush events → player display
- [ ] Box reveal/hide → player display
- [ ] Token move → player display
- [ ] Ping → player display
- [ ] Prep mode toggle → player display
- [ ] Reconnect on disconnect

### Display
- [ ] `/play/[slug]` fullscreen with no UI chrome
- [ ] Prep Mode: override display with loading screen
- [ ] Session name shown on player display
- [ ] Vignette effect on player display

### Misc
- [ ] Right-click context menu on canvas
- [ ] Keyboard shortcuts (R/H/B/S/T/P/M/G, Space+drag, Ctrl+Z)
- [ ] Grid overlay toggle
- [ ] Measure tool (feet & squares)
- [ ] Settings modal (fog opacity, grid size, session name, prep message)

---

## Post-MVP (v2)
- Torch light sources with animated glow
- Multiple map layers (battle map + overview)
- Session history / fog undo server-side
- Shareable session templates
- Custom token images (upload)
- Mobile GM view (touch-optimized)
- SaaS billing (Stripe) + Pro tier
