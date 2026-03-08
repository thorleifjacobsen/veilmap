import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/sessions/[slug]/soundboard — list soundboard slots
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const session = await db.session.findUnique({ where: { slug }, select: { id: true } });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const slots = await db.soundboardSlot.findMany({
    where: { session_id: session.id },
    orderBy: { slot_index: 'asc' },
  });

  return NextResponse.json({ slots: slots.map(s => ({
    id: s.id,
    name: s.name,
    file_url: s.file_url,
    type: s.type,
    volume: s.volume,
    slot_index: s.slot_index,
  })) });
}

// POST /api/sessions/[slug]/soundboard — create or update a slot
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  const existing = await db.session.findUnique({ where: { slug }, select: { id: true, owner_id: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.owner_id !== authSession.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as { slotIndex: number; name: string; type: string; fileUrl: string; volume?: number };
  const { slotIndex, name, type, fileUrl, volume = 0.8 } = body;

  if (slotIndex < 0 || slotIndex >= 12) return NextResponse.json({ error: 'Invalid slot index' }, { status: 400 });

  // Upsert: delete existing at this index if any, then create
  await db.soundboardSlot.deleteMany({ where: { session_id: existing.id, slot_index: slotIndex } });
  const slot = await db.soundboardSlot.create({
    data: {
      session_id: existing.id,
      slot_index: slotIndex,
      name,
      type,
      file_url: fileUrl,
      volume,
    },
  });

  return NextResponse.json({ id: slot.id });
}
