import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { broadcast } from '@/lib/sse';
import { v4 as uuidv4 } from 'uuid';

// POST /api/sessions/[slug]/tokens — create a token
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

  const t = await db.token.create({
    data: {
      id,
      session_id: sessionRow.id,
      emoji: body.emoji,
      color: body.color || '#e05c2a',
      x: body.x,
      y: body.y,
      label: body.label || '',
    },
  });

  const token = {
    id: t.id, session_id: t.session_id, emoji: t.emoji,
    color: t.color, x: t.x, y: t.y, label: t.label,
  };

  broadcast(slug, { type: 'token:create', payload: token });
  return NextResponse.json(token, { status: 201 });
}

// PUT /api/sessions/[slug]/tokens — update token position (tokenId in body)
export async function PUT(
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
  if (!body.tokenId) return NextResponse.json({ error: 'Missing tokenId' }, { status: 400 });

  await db.token.updateMany({
    where: { id: body.tokenId, session_id: sessionRow.id },
    data: { x: body.x, y: body.y },
  });
  broadcast(slug, { type: 'token:move', payload: { tokenId: body.tokenId, x: body.x, y: body.y } });
  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/[slug]/tokens — delete token (tokenId in body)
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
  if (!body.tokenId) return NextResponse.json({ error: 'Missing tokenId' }, { status: 400 });

  await db.token.deleteMany({ where: { id: body.tokenId, session_id: sessionRow.id } });
  broadcast(slug, { type: 'token:delete', payload: { tokenId: body.tokenId } });
  return NextResponse.json({ ok: true });
}
