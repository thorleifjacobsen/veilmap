import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

// POST /api/sessions/[slug]/tokens — create a token
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = params;

  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (sessionRow[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  // Allow client-provided ID for immediate WS event referencing; fallback to server-generated UUID
  const id = body.id || uuidv4();

  const result = await db`
    INSERT INTO tokens (id, session_id, emoji, color, x, y, label)
    VALUES (${id}, ${sessionRow[0].id}, ${body.emoji}, ${body.color || '#e05c2a'},
            ${body.x}, ${body.y}, ${body.label || ''})
    RETURNING *
  `;

  const t = result[0];
  return NextResponse.json({
    id: t.id,
    sessionId: t.session_id,
    emoji: t.emoji,
    color: t.color,
    x: t.x, y: t.y,
    label: t.label,
  }, { status: 201 });
}

// PUT /api/sessions/[slug]/tokens — update token position (with tokenId in body)
export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = params;
  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length || sessionRow[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  if (!body.tokenId) {
    return NextResponse.json({ error: 'Missing tokenId' }, { status: 400 });
  }

  await db`UPDATE tokens SET x = ${body.x}, y = ${body.y} WHERE id = ${body.tokenId} AND session_id = ${sessionRow[0].id}`;
  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/[slug]/tokens — delete token (with tokenId in body)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = params;
  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length || sessionRow[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  if (!body.tokenId) {
    return NextResponse.json({ error: 'Missing tokenId' }, { status: 400 });
  }

  await db`DELETE FROM tokens WHERE id = ${body.tokenId} AND session_id = ${sessionRow[0].id}`;
  return NextResponse.json({ ok: true });
}
