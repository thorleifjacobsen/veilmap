import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { setFogState, getFogState, broadcastPlayers } from '@/lib/ws-store';

// GET /api/sessions/[slug]/fog — retrieve fog snapshot (GM loads on mount)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  // Try in-memory first
  const memFog = getFogState(slug);
  if (memFog) return NextResponse.json({ png: memFog });

  // Fall back to DB
  const s = await db.session.findUnique({ where: { slug }, select: { fog_snapshot: true, owner_id: true } });
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (s.owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (s.fog_snapshot) {
    const png = Buffer.from(s.fog_snapshot).toString('base64');
    setFogState(slug, png);
    return NextResponse.json({ png });
  }

  return NextResponse.json({ png: null });
}

// PUT /api/sessions/[slug]/fog — save fog snapshot (persists to DB, broadcasts to players)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return saveFogSnapshot(req, params);
}

// POST /api/sessions/[slug]/fog — same as PUT (used by navigator.sendBeacon on beforeunload)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  return saveFogSnapshot(req, params);
}

async function saveFogSnapshot(
  req: NextRequest,
  params: Promise<{ slug: string }>
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  const sessionRow = await db.session.findUnique({
    where: { slug },
    select: { id: true, owner_id: true },
  });
  if (!sessionRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sessionRow.owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  if (!body.png) return NextResponse.json({ error: 'Missing png' }, { status: 400 });

  // Store in memory for reconnecting clients
  setFogState(slug, body.png);

  // Persist fog to DB for all users
  const fogBuffer = Buffer.from(body.png, 'base64');
  await db.session.update({
    where: { slug },
    data: { fog_snapshot: fogBuffer, updated_at: new Date() },
  });

  // Broadcast to all connected player displays
  broadcastPlayers(slug, { type: 'fog:snapshot', payload: { png: body.png } });

  return NextResponse.json({ ok: true });
}
