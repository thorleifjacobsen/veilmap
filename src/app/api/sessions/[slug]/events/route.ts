import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { subscribe, getFogState, getCameraState, getBlackoutState, getObjectsState } from '@/lib/sse';
import type { SSEEvent } from '@/types';

// GET /api/sessions/[slug]/events — SSE endpoint for player display
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Verify session exists
  const sessions = await db`
    SELECT s.*,
      COALESCE(
        json_agg(DISTINCT jsonb_build_object(
          'id', b.id, 'session_id', b.session_id, 'name', b.name, 'type', b.type,
          'x', b.x, 'y', b.y, 'w', b.w, 'h', b.h,
          'color', b.color, 'notes', b.notes,
          'revealed', b.revealed, 'sort_order', b.sort_order
        )) FILTER (WHERE b.id IS NOT NULL), '[]'
      ) as boxes,
      COALESCE(
        json_agg(DISTINCT jsonb_build_object(
          'id', t.id, 'session_id', t.session_id, 'emoji', t.emoji,
          'color', t.color, 'x', t.x, 'y', t.y, 'label', t.label
        )) FILTER (WHERE t.id IS NOT NULL), '[]'
      ) as tokens
    FROM sessions s
    LEFT JOIN boxes b ON b.session_id = s.id
    LEFT JOIN tokens t ON t.session_id = s.id
    WHERE s.slug = ${slug}
    GROUP BY s.id
  `;

  if (!sessions.length) {
    return new Response('Session not found', { status: 404 });
  }

  const s = sessions[0];
  const sessionData = {
    id: s.id, slug: s.slug, owner_id: s.owner_id, name: s.name,
    map_url: s.map_url, prep_mode: s.prep_mode, prep_message: s.prep_message,
    gm_fog_opacity: s.gm_fog_opacity, grid_size: s.grid_size,
    boxes: s.boxes || [], tokens: s.tokens || [],
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial full state
      const fogPng = getFogState(slug);
      const camera = getCameraState(slug);
      const blackout = getBlackoutState(slug);
      const objects = getObjectsState(slug);
      const fullState: SSEEvent = {
        type: 'state:full',
        payload: { session: { ...sessionData, objects }, fogPng, objects, camera, blackout },
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
