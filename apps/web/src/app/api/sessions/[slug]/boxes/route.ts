import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

// POST /api/sessions/[slug]/boxes — create a box
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;

  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (sessionRow[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const id = body.id || uuidv4();

  const result = await db`
    INSERT INTO boxes (id, session_id, name, type, x, y, w, h, color, notes, meta_json, revealed, sort_order)
    VALUES (${id}, ${sessionRow[0].id}, ${body.name || 'Room'}, ${body.type || 'autoReveal'},
            ${body.x}, ${body.y}, ${body.w}, ${body.h},
            ${body.color || '#c8963e'}, ${body.notes || ''}, ${JSON.stringify(body.metaJson || {})},
            ${body.revealed || false}, ${body.sortOrder || 0})
    RETURNING *
  `;

  const b = result[0];
  return NextResponse.json({
    id: b.id,
    sessionId: b.session_id,
    name: b.name,
    type: b.type,
    x: b.x, y: b.y, w: b.w, h: b.h,
    color: b.color,
    notes: b.notes,
    metaJson: b.meta_json,
    revealed: b.revealed,
    sortOrder: b.sort_order,
  }, { status: 201 });
}

// PATCH /api/sessions/[slug]/boxes — update box (with boxId in body)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length || sessionRow[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { boxId, ...updates } = body;

  if (!boxId) {
    return NextResponse.json({ error: 'Missing boxId' }, { status: 400 });
  }

  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.type !== undefined) dbUpdates.type = updates.type;
  if (updates.color !== undefined) dbUpdates.color = updates.color;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.revealed !== undefined) dbUpdates.revealed = updates.revealed;
  if (updates.x !== undefined) dbUpdates.x = updates.x;
  if (updates.y !== undefined) dbUpdates.y = updates.y;
  if (updates.w !== undefined) dbUpdates.w = updates.w;
  if (updates.h !== undefined) dbUpdates.h = updates.h;

  if (Object.keys(dbUpdates).length > 0) {
    await db`UPDATE boxes SET ${db(dbUpdates, ...Object.keys(dbUpdates))} WHERE id = ${boxId} AND session_id = ${sessionRow[0].id}`;
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/[slug]/boxes — delete box (with boxId in body)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;
  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length || sessionRow[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  if (!body.boxId) {
    return NextResponse.json({ error: 'Missing boxId' }, { status: 400 });
  }

  await db`DELETE FROM boxes WHERE id = ${body.boxId} AND session_id = ${sessionRow[0].id}`;
  return NextResponse.json({ ok: true });
}
