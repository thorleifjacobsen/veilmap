import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { broadcast } from '@/lib/sse';
import { v4 as uuidv4 } from 'uuid';

// POST /api/sessions/[slug]/boxes — create a box
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  const sessionRow = await db.session.findUnique({ where: { slug }, select: { id: true, owner_id: true } });
  if (!sessionRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sessionRow.owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const id = body.id || uuidv4();

  const b = await db.box.create({
    data: {
      id,
      session_id: sessionRow.id,
      name: body.name || 'Room',
      type: body.type || 'autoReveal',
      x: body.x,
      y: body.y,
      w: body.w,
      h: body.h,
      color: body.color || '#c8963e',
      notes: body.notes || '',
      revealed: body.revealed || false,
      sort_order: body.sort_order || 0,
      points: body.points || [],
    },
  });

  const box = {
    id: b.id, session_id: b.session_id, name: b.name, type: b.type,
    x: b.x, y: b.y, w: b.w, h: b.h,
    color: b.color, notes: b.notes, revealed: b.revealed, sort_order: b.sort_order,
    points: (b.points as { x: number; y: number }[] | null) || [],
  };

  broadcast(slug, { type: 'box:create', payload: box });
  return NextResponse.json(box, { status: 201 });
}

// PATCH /api/sessions/[slug]/boxes — update box (boxId in body)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  const sessionRow = await db.session.findUnique({ where: { slug }, select: { id: true, owner_id: true } });
  if (!sessionRow || sessionRow.owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { boxId, ...updates } = body;
  if (!boxId) return NextResponse.json({ error: 'Missing boxId' }, { status: 400 });

  const dbUpdates: Record<string, unknown> = {};
  for (const key of ['name', 'type', 'color', 'notes', 'revealed', 'x', 'y', 'w', 'h', 'points']) {
    if (updates[key] !== undefined) dbUpdates[key] = updates[key];
  }

  if (Object.keys(dbUpdates).length > 0) {
    await db.box.updateMany({
      where: { id: boxId, session_id: sessionRow.id },
      data: dbUpdates,
    });
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
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  const sessionRow = await db.session.findUnique({ where: { slug }, select: { id: true, owner_id: true } });
  if (!sessionRow || sessionRow.owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  if (!body.boxId) return NextResponse.json({ error: 'Missing boxId' }, { status: 400 });

  await db.box.deleteMany({ where: { id: body.boxId, session_id: sessionRow.id } });
  broadcast(slug, { type: 'box:delete', payload: { boxId: body.boxId } });
  return NextResponse.json({ ok: true });
}
