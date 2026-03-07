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
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const s = sessions[0];
  return NextResponse.json({
    id: s.id,
    slug: s.slug,
    owner_id: s.owner_id,
    name: s.name,
    map_url: s.map_url,
    prep_mode: s.prep_mode,
    prep_message: s.prep_message,
    gm_fog_opacity: s.gm_fog_opacity,
    grid_size: s.grid_size,
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

  const existing = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!existing.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing[0].owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.map_url !== undefined) updates.map_url = body.map_url;
  if (body.prep_mode !== undefined) updates.prep_mode = body.prep_mode;
  if (body.prep_message !== undefined) updates.prep_message = body.prep_message;
  if (body.gm_fog_opacity !== undefined) updates.gm_fog_opacity = body.gm_fog_opacity;
  if (body.grid_size !== undefined) updates.grid_size = body.grid_size;

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date();
    await db`UPDATE sessions SET ${db(updates, ...Object.keys(updates))} WHERE slug = ${slug}`;
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/[slug]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { slug } = await params;

  const existing = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!existing.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing[0].owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await db`DELETE FROM sessions WHERE slug = ${slug}`;
  return NextResponse.json({ ok: true });
}
