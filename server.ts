// server.ts — Custom Node.js entry point
// Runs Next.js and a WebSocket server on the same HTTP server (port 3000).
// The ws-store module is shared between this file and Next.js API routes.

import 'dotenv/config';
import http from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { getToken } from 'next-auth/jwt';
import { db } from './src/lib/db';
import {
  addConnection,
  removeConnection,
  broadcastPlayers,
  setFogState,
  getFogState,
  setCameraState,
  getCameraState,
  setBlackoutState,
  getBlackoutState,
  setObjectsState,
  getObjectsState,
  type WSEvent,
} from './src/lib/ws-store';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev });
const handle = app.getRequestHandler();

const PING_INTERVAL_MS = 30_000;
const AUTH_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const parsedUrl = parse(req.url || '/', true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  // Handle WS upgrade requests on the /ws path
  server.on('upgrade', async (req, socket, head) => {
    const { pathname, query } = parse(req.url || '/', true);
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const slug = String(query.slug || '');
    const role = query.role === 'gm' ? 'gm' : 'player';

    if (!slug) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    if (role === 'gm') {
      // Authenticate using the NextAuth session cookie sent with the upgrade request
      try {
        const cookieHeader = req.headers.cookie || '';
        const token = await getToken({
          req: { headers: { cookie: cookieHeader } },
          secret: AUTH_SECRET,
          cookieName: AUTH_COOKIE_NAME,
        });

        if (!token?.sub) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // Verify the user owns the session with this slug
        const sessionRow = await db.session.findUnique({
          where: { slug },
          select: { owner_id: true },
        });

        if (!sessionRow || sessionRow.owner_id !== token.sub) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
      } catch {
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, slug, role);
    });
  });

  wss.on('connection', async (ws: WebSocket, _req: http.IncomingMessage, slug: string, role: 'gm' | 'player') => {
    addConnection(slug, role, ws);

    // Initialize keepalive tracking
    const ext = ws as WebSocket & { _isAlive: boolean };
    ext._isAlive = true;
    ws.on('pong', () => { ext._isAlive = true; });

    // Send full state on connect
    await sendFullState(ws, slug, role);

    ws.on('message', (data) => {
      let event: WSEvent;
      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (role === 'gm') handleGMEvent(slug, ws, event);
    });

    ws.on('close', () => {
      removeConnection(slug, role, ws);
    });

    ws.on('error', () => {
      removeConnection(slug, role, ws);
    });
  });

  // Keepalive: ping all connections every 30 seconds.
  // Clients that don't respond with a pong within the next cycle are terminated.
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const ext = ws as WebSocket & { _isAlive: boolean };
      if (ext._isAlive === false) {
        ws.terminate();
        return;
      }
      ext._isAlive = false;
      ws.ping();
      // Also send a heartbeat JSON message for client-side connection status indicators
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
      } catch { /* ignore closed socket */ }
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(pingInterval));

  server.listen(port, () => {
    console.log(`> VeilMap ready on http://localhost:${port} (${dev ? 'dev' : 'prod'})`);
  });
});

// ── Full state on connect ──

async function sendFullState(ws: WebSocket, slug: string, role: 'gm' | 'player') {
  try {
    const s = await db.session.findUnique({
      where: { slug },
      include: {
        boxes: true,
        map_objects: { orderBy: { z_index: 'asc' } },
      },
    });

    if (!s) return;

    // Resolve fog
    let fogPng = getFogState(slug);
    if (!fogPng && s.fog_snapshot) {
      fogPng = Buffer.from(s.fog_snapshot).toString('base64');
      setFogState(slug, fogPng);
    }

    // Resolve camera
    let camera = getCameraState(slug);
    if (!camera && s.camera_x != null && s.camera_y != null && s.camera_w != null && s.camera_h != null) {
      camera = { x: s.camera_x, y: s.camera_y, w: s.camera_w, h: s.camera_h };
      setCameraState(slug, camera);
    }

    const blackout = getBlackoutState(slug);

    const allObjects = s.map_objects.map((o) => ({
      id: o.id,
      name: o.name,
      src: o.src,
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      rotation: o.rotation,
      zIndex: o.z_index,
      visible: o.visible,
      playerVisible: o.player_visible,
      locked: o.locked,
    }));

    // Use in-memory objects if set, otherwise DB objects
    const memObjects = getObjectsState(slug);
    const objects = memObjects.length > 0 ? memObjects : allObjects;

    const sessionData = {
      id: s.id, slug: s.slug, owner_id: s.owner_id, name: s.name,
      map_url: s.map_url, prep_mode: s.prep_mode, prep_message: s.prep_message,
      gm_fog_opacity: s.gm_fog_opacity, grid_size: s.grid_size,
      show_grid: s.show_grid, grid_color: s.grid_color, grid_opacity: s.grid_opacity,
      measurement_unit: s.measurement_unit, fog_style: s.fog_style,
      camera_x: s.camera_x, camera_y: s.camera_y,
      camera_w: s.camera_w, camera_h: s.camera_h,
      boxes: s.boxes.map((b) => ({
        id: b.id, session_id: b.session_id, name: b.name, type: b.type,
        x: b.x, y: b.y, w: b.w, h: b.h,
        color: b.color, notes: b.notes, revealed: b.revealed, sort_order: b.sort_order,
        points: (b.points as { x: number; y: number }[] | null) || [],
      })),
      objects,
    };

    // Players only see player-visible objects
    const visibleObjects = role === 'gm'
      ? objects
      : objects.filter((o) => o.playerVisible);

    const fullState: WSEvent = {
      type: 'state:full',
      payload: {
        session: { ...sessionData, objects: visibleObjects },
        fogPng,
        objects: visibleObjects,
        camera,
        blackout,
        grid: {
          show: s.show_grid,
          size: s.grid_size,
          color: s.grid_color,
          opacity: s.grid_opacity,
        },
      },
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(fullState));
    }
  } catch (err) {
    console.error('[WS] sendFullState error:', err);
  }
}

// ── GM event handler ──

function handleGMEvent(slug: string, _ws: WebSocket, event: WSEvent) {
  switch (event.type) {
    case 'fog:paint':
      // Forward paint strokes to players immediately (no processing)
      broadcastPlayers(slug, event);
      break;

    case 'fog:snapshot': {
      const payload = event.payload as { png: string };
      if (payload?.png) {
        setFogState(slug, payload.png);
        // Persist to DB asynchronously
        const fogBuffer = Buffer.from(payload.png, 'base64');
        db.session.update({
          where: { slug },
          data: { fog_snapshot: fogBuffer, updated_at: new Date() },
        }).catch((err: unknown) => console.error('[WS] fog:snapshot persist error:', err));
      }
      broadcastPlayers(slug, event);
      break;
    }

    case 'fog:reset':
      // Clear in-memory fog so reconnecting clients start fresh
      setFogState(slug, null);
      broadcastPlayers(slug, event);
      break;

    case 'fog:revealall':
      // Clear in-memory fog so reconnecting clients start fresh
      setFogState(slug, null);
      broadcastPlayers(slug, event);
      break;

    case 'fog:grid-reveal':
      broadcastPlayers(slug, event);
      break;

    case 'camera:update': {
      const payload = event.payload as { x: number; y: number; w: number; h: number };
      if (payload) {
        setCameraState(slug, payload);
        // Persist camera to DB asynchronously
        db.session.update({
          where: { slug },
          data: {
            camera_x: payload.x,
            camera_y: payload.y,
            camera_w: payload.w,
            camera_h: payload.h,
            updated_at: new Date(),
          },
        }).catch((err: unknown) => console.error('[WS] camera:update persist error:', err));
      }
      // Broadcast to players as 'camera:move' (the event type players listen for)
      broadcastPlayers(slug, { type: 'camera:move', payload });
      break;
    }

    case 'session:settings':
      broadcastPlayers(slug, event);
      break;

    case 'session:prep':
      broadcastPlayers(slug, event);
      break;

    case 'session:blackout': {
      const payload = event.payload as { active: boolean; message?: string };
      setBlackoutState(slug, payload?.active ? payload : null);
      broadcastPlayers(slug, event);
      break;
    }

    case 'objects:update': {
      const payload = event.payload as { objects: Parameters<typeof setObjectsState>[1] };
      if (payload?.objects) {
        setObjectsState(slug, payload.objects);
      }
      broadcastPlayers(slug, event);
      break;
    }

    case 'box:create':
    case 'box:update':
    case 'box:reveal':
    case 'box:hide':
    case 'box:delete':
      broadcastPlayers(slug, event);
      break;

    case 'token:create':
    case 'token:update':
    case 'token:delete':
      // Tokens are GM-only — never forwarded to players
      break;

    case 'display:shake':
      broadcastPlayers(slug, event);
      break;

    case 'audio:play':
    case 'audio:stop':
      broadcastPlayers(slug, event);
      break;

    case 'ping':
      broadcastPlayers(slug, event);
      break;

    case 'grid:update':
      broadcastPlayers(slug, event);
      break;

    case 'fog:style':
      broadcastPlayers(slug, event);
      break;

    default:
      // Unknown event — forward to players
      broadcastPlayers(slug, event);
      break;
  }
}
