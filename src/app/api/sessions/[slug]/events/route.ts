import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { subscribe, getFogState, getCameraState, setCameraState, getBlackoutState, getObjectsState } from '@/lib/sse';
import type { SSEEvent } from '@/types';

// GET /api/sessions/[slug]/events — SSE endpoint for player display
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Verify session exists
  const s = await db.session.findUnique({
    where: { slug },
    include: {
      boxes: true,
      map_objects: { orderBy: { z_index: 'asc' } },
    },
  });

  if (!s) {
    return new Response('Session not found', { status: 404 });
  }

  const sessionData = {
    id: s.id, slug: s.slug, owner_id: s.owner_id, name: s.name,
    map_url: s.map_url, prep_mode: s.prep_mode, prep_message: s.prep_message,
    gm_fog_opacity: s.gm_fog_opacity, grid_size: s.grid_size,
    show_grid: s.show_grid,
    camera_x: s.camera_x, camera_y: s.camera_y,
    camera_w: s.camera_w, camera_h: s.camera_h,
    boxes: s.boxes.map((b) => ({
      id: b.id,
      session_id: b.session_id,
      name: b.name,
      type: b.type,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      color: b.color,
      notes: b.notes,
      revealed: b.revealed,
      sort_order: b.sort_order,
    })),
    objects: s.map_objects.map((o) => ({
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
    })),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial full state
      const fogPng = getFogState(slug);
      const memCamera = getCameraState(slug);
      // Fall back to DB camera if in-memory is null
      const camera = memCamera ?? (s.camera_x != null && s.camera_y != null && s.camera_w != null && s.camera_h != null
        ? { x: s.camera_x, y: s.camera_y, w: s.camera_w, h: s.camera_h }
        : null);
      // Initialize in-memory camera from DB on first connect
      if (!memCamera && camera) setCameraState(slug, camera);
      const blackout = getBlackoutState(slug);
      // Use in-memory objects if GM has already set them, otherwise fall back to DB
      const memObjects = getObjectsState(slug);
      const objects = memObjects.length > 0 ? memObjects : sessionData.objects;
      // Always send DB objects as the canonical list so reconnects are consistent
      const fullState: SSEEvent = {
        type: 'state:full',
        payload: { session: { ...sessionData, objects }, fogPng, objects, camera, blackout, grid: { show: s.show_grid, size: s.grid_size } },
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(fullState)}\n\n`));

      // Subscribe to future events
      const unsubscribe = subscribe(slug, (event: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed
          unsubscribe();
        }
      });

      // Send keepalive every 30s to prevent connection timeout
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
          unsubscribe();
        }
      }, 30_000);

      // Cleanup when client disconnects
      _req.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
