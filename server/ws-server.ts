// server/ws-server.ts
// Run as a separate Node.js process alongside Next.js
// Port: 3001 (proxied via Nginx from /ws)

import { WebSocketServer, WebSocket } from 'ws';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://veilmap:password@localhost:5432/veilmap';
const db = postgres(DATABASE_URL);

const PORT = parseInt(process.env.WS_PORT || '3001', 10);
const wss = new WebSocketServer({ port: PORT });

interface WSMessage {
  type: string;
  sessionSlug: string;
  payload: Record<string, unknown>;
}

interface FullStatePayload {
  session: Record<string, unknown>;
  fogPng: string | null;
}

// In-memory rooms: slug → Set<WebSocket>
const rooms = new Map<string, Set<WebSocket>>();

// In-memory fog state per session: slug → Buffer (PNG)
const fogState = new Map<string, Buffer>();

console.log(`WebSocket server starting on port ${PORT}...`);

wss.on('connection', (ws: WebSocket, req) => {
  // URL format: ws://host/ws?slug=session-slug&role=gm|player
  const url = new URL(req.url!, `http://localhost`);
  const slug = url.searchParams.get('slug');
  const role = url.searchParams.get('role') as 'gm' | 'player';

  if (!slug) { ws.close(1008, 'Missing slug'); return; }

  // Join room
  if (!rooms.has(slug)) rooms.set(slug, new Set());
  rooms.get(slug)!.add(ws);

  console.log(`Client connected: slug=${slug}, role=${role}, room size=${rooms.get(slug)!.size}`);

  // Send full state to new connection
  sendFullState(ws, slug);

  ws.on('message', async (data: Buffer) => {
    try {
      const msg: WSMessage = JSON.parse(data.toString());

      // Only GMs can send mutating events
      if (role !== 'gm' && msg.type !== 'ping') return;

      // Persist important state changes to DB
      await persistEvent(msg);

      // Broadcast to all OTHER clients in the room
      broadcast(slug, msg, ws);
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    rooms.get(slug)?.delete(ws);
    if (rooms.get(slug)?.size === 0) rooms.delete(slug);
    console.log(`Client disconnected: slug=${slug}, role=${role}`);
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
  try {
    const session = await db`
      SELECT s.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', b.id, 'sessionId', b.session_id, 'name', b.name, 'type', b.type,
          'x', b.x, 'y', b.y, 'w', b.w, 'h', b.h,
          'color', b.color, 'notes', b.notes, 'metaJson', b.meta_json,
          'revealed', b.revealed, 'sortOrder', b.sort_order
        )) FILTER (WHERE b.id IS NOT NULL) as boxes,
        json_agg(DISTINCT jsonb_build_object(
          'id', t.id, 'sessionId', t.session_id, 'emoji', t.emoji,
          'color', t.color, 'x', t.x, 'y', t.y, 'label', t.label
        )) FILTER (WHERE t.id IS NOT NULL) as tokens
      FROM sessions s
      LEFT JOIN boxes b ON b.session_id = s.id
      LEFT JOIN tokens t ON t.session_id = s.id
      WHERE s.slug = ${slug}
      GROUP BY s.id
    `;
    if (!session.length) return;

    const s = session[0];
    const fogPng = fogState.get(slug) ? fogState.get(slug)!.toString('base64') : null;

    const payload: FullStatePayload = {
      session: {
        id: s.id,
        slug: s.slug,
        ownerId: s.owner_id,
        name: s.name,
        mapUrl: s.map_url,
        mapWidth: s.map_width,
        mapHeight: s.map_height,
        prepMode: s.prep_mode,
        prepMessage: s.prep_message,
        gmFogOpacity: s.gm_fog_opacity,
        gridSize: s.grid_size,
        boxes: s.boxes || [],
        tokens: s.tokens || [],
      },
      fogPng,
    };
    ws.send(JSON.stringify({ type: 'state:full', sessionSlug: slug, payload }));
  } catch (err) {
    console.error('Error sending full state:', err);
  }
}

async function persistEvent(msg: WSMessage) {
  const { type, sessionSlug, payload } = msg;
  const p = payload as Record<string, unknown>;

  try {
    switch (type) {
      case 'fog:snapshot':
        fogState.set(sessionSlug, Buffer.from(p.png as string, 'base64'));
        await db`UPDATE sessions SET fog_snapshot=${Buffer.from(p.png as string, 'base64')}, updated_at=NOW() WHERE slug=${sessionSlug}`;
        break;
      case 'box:reveal':
        await db`UPDATE boxes SET revealed=TRUE WHERE id=${p.boxId as string}`;
        break;
      case 'box:hide':
        await db`UPDATE boxes SET revealed=FALSE WHERE id=${p.boxId as string}`;
        break;
      case 'box:create': {
        const box = p.box as Record<string, unknown>;
        await db`INSERT INTO boxes (id, session_id, name, type, x, y, w, h, color, notes, meta_json, revealed, sort_order)
                 VALUES (${box.id as string}, ${box.sessionId as string}, ${box.name as string}, ${box.type as string},
                         ${box.x as number}, ${box.y as number}, ${box.w as number}, ${box.h as number},
                         ${box.color as string}, ${box.notes as string}, ${JSON.stringify(box.metaJson || {})},
                         ${box.revealed as boolean}, ${box.sortOrder as number})
                 ON CONFLICT DO NOTHING`;
        break;
      }
      case 'box:update': {
        const updates = p.updates as Record<string, unknown>;
        const boxId = p.boxId as string;
        if (updates.name !== undefined) await db`UPDATE boxes SET name=${updates.name as string} WHERE id=${boxId}`;
        if (updates.type !== undefined) await db`UPDATE boxes SET type=${updates.type as string} WHERE id=${boxId}`;
        if (updates.color !== undefined) await db`UPDATE boxes SET color=${updates.color as string} WHERE id=${boxId}`;
        if (updates.notes !== undefined) await db`UPDATE boxes SET notes=${updates.notes as string} WHERE id=${boxId}`;
        if (updates.revealed !== undefined) await db`UPDATE boxes SET revealed=${updates.revealed as boolean} WHERE id=${boxId}`;
        break;
      }
      case 'box:delete':
        await db`DELETE FROM boxes WHERE id=${p.boxId as string}`;
        break;
      case 'token:create': {
        const token = p.token as Record<string, unknown>;
        await db`INSERT INTO tokens (id, session_id, emoji, color, x, y, label)
                 VALUES (${token.id as string}, ${token.sessionId as string}, ${token.emoji as string},
                         ${token.color as string}, ${token.x as number}, ${token.y as number}, ${(token.label as string) ?? ''})
                 ON CONFLICT DO NOTHING`;
        break;
      }
      case 'token:move':
        await db`UPDATE tokens SET x=${p.x as number}, y=${p.y as number} WHERE id=${p.tokenId as string}`;
        break;
      case 'token:delete':
        await db`DELETE FROM tokens WHERE id=${p.tokenId as string}`;
        break;
      case 'session:prep':
        await db`UPDATE sessions SET prep_mode=${p.active as boolean}, prep_message=${(p.message as string) ?? 'Preparing…'} WHERE slug=${sessionSlug}`;
        break;
      case 'session:settings':
        await db`UPDATE sessions SET gm_fog_opacity=${p.gmFogOpacity as number}, grid_size=${p.gridSize as number} WHERE slug=${sessionSlug}`;
        break;
    }
  } catch (err) {
    console.error(`Error persisting event ${type}:`, err);
  }
}

console.log(`WebSocket server running on port ${PORT}`);
