import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/sessions/[slug] — get full session with boxes and tokens
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const sessions = await db`
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

  if (!sessions.length) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const s = sessions[0];
  return NextResponse.json({
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
  });
}

// PATCH /api/sessions/[slug] — update session settings
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;

  // Verify ownership
  const existing = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!existing.length) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (existing[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.mapUrl !== undefined) updates.map_url = body.mapUrl;
  if (body.prepMode !== undefined) updates.prep_mode = body.prepMode;
  if (body.prepMessage !== undefined) updates.prep_message = body.prepMessage;
  if (body.gmFogOpacity !== undefined) updates.gm_fog_opacity = body.gmFogOpacity;
  if (body.gridSize !== undefined) updates.grid_size = body.gridSize;

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date();
    await db`UPDATE sessions SET ${db(updates, ...Object.keys(updates))} WHERE slug = ${slug}`;
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/[slug] — delete session
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;

  // Verify ownership
  const existing = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!existing.length) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (existing[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db`DELETE FROM sessions WHERE slug = ${slug}`;
  return NextResponse.json({ ok: true });
}
