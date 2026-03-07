import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { broadcast } from '@/lib/sse';
import { v4 as uuidv4 } from 'uuid';

// POST /api/sessions/[slug]/boxes — create a box
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = params;

  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sessionRow[0].owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const id = body.id || uuidv4();

  const result = await db`
    INSERT INTO boxes (id, session_id, name, type, x, y, w, h, color, notes, revealed, sort_order)
    VALUES (${id}, ${sessionRow[0].id}, ${body.name || 'Room'}, ${body.type || 'autoReveal'},
            ${body.x}, ${body.y}, ${body.w}, ${body.h},
            ${body.color || '#c8963e'}, ${body.notes || ''},
            ${body.revealed || false}, ${body.sort_order || 0})
    RETURNING *
  `;

  const b = result[0];
  const box = {
    id: b.id, session_id: b.session_id, name: b.name, type: b.type,
    x: b.x, y: b.y, w: b.w, h: b.h,
    color: b.color, notes: b.notes, revealed: b.revealed, sort_order: b.sort_order,
  };

  broadcast(slug, { type: 'box:create', payload: box });
  return NextResponse.json(box, { status: 201 });
}

// PATCH /api/sessions/[slug]/boxes — update box (boxId in body)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = params;

  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length || sessionRow[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { boxId, ...updates } = body;
  if (!boxId) return NextResponse.json({ error: 'Missing boxId' }, { status: 400 });

  const dbUpdates: Record<string, unknown> = {};
  for (const key of ['name', 'type', 'color', 'notes', 'revealed', 'x', 'y', 'w', 'h']) {
    if (updates[key] !== undefined) dbUpdates[key] = updates[key];
  }

  if (Object.keys(dbUpdates).length > 0) {
    await db`UPDATE boxes SET ${db(dbUpdates, ...Object.keys(dbUpdates))} WHERE id = ${boxId} AND session_id = ${sessionRow[0].id}`;
  }

  // Broadcast reveal/hide specifically
  if (updates.revealed === true) broadcast(slug, { type: 'box:reveal', payload: { boxId } });
  else if (updates.revealed === false) broadcast(slug, { type: 'box:hide', payload: { boxId } });
  else broadcast(slug, { type: 'box:update', payload: { boxId, ...dbUpdates } });

  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/[slug]/boxes — delete box (boxId in body)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = params;

  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length || sessionRow[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  if (!body.boxId) return NextResponse.json({ error: 'Missing boxId' }, { status: 400 });

  await db`DELETE FROM boxes WHERE id = ${body.boxId} AND session_id = ${sessionRow[0].id}`;
  broadcast(slug, { type: 'box:delete', payload: { boxId: body.boxId } });
  return NextResponse.json({ ok: true });
}
