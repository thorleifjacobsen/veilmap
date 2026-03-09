import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// PATCH /api/sessions/[slug]/soundboard/[slotId] — update slot (e.g. volume)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; slotId: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug, slotId } = await params;

  const session = await db.session.findUnique({ where: { slug }, select: { id: true, owner_id: true } });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.owner_id !== authSession.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { volume?: number; name?: string; type?: string };
  const updates: Record<string, unknown> = {};
  if (body.volume !== undefined) updates.volume = body.volume;
  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;

  if (Object.keys(updates).length > 0) {
    await db.soundboardSlot.updateMany({
      where: { id: slotId, session_id: session.id },
      data: updates,
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/[slug]/soundboard/[slotId] — delete a slot
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; slotId: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug, slotId } = await params;

  const session = await db.session.findUnique({ where: { slug }, select: { id: true, owner_id: true } });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.owner_id !== authSession.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await db.soundboardSlot.deleteMany({ where: { id: slotId, session_id: session.id } });

  return NextResponse.json({ ok: true });
}
