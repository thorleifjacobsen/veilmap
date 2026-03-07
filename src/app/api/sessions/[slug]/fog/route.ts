import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { broadcast, setFogState, setCameraState, setBlackoutState } from '@/lib/sse';

// PUT /api/sessions/[slug]/fog — save fog snapshot and broadcast
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  const sessionRow = await db`
    SELECT s.id, s.owner_id, u.is_pro
    FROM sessions s JOIN users u ON u.id = s.owner_id
    WHERE s.slug = ${slug}
  `;
  if (!sessionRow.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sessionRow[0].owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  if (!body.png) return NextResponse.json({ error: 'Missing png' }, { status: 400 });

  // Always store in memory for reconnecting players
  setFogState(slug, body.png);

  // Only persist to DB for pro users
  if (sessionRow[0].is_pro) {
    const fogBuffer = Buffer.from(body.png, 'base64');
    await db`UPDATE sessions SET fog_snapshot = ${fogBuffer}, updated_at = NOW() WHERE slug = ${slug}`;
  }

  // Broadcast to all connected player displays
  broadcast(slug, { type: 'fog:snapshot', payload: { png: body.png } });

  return NextResponse.json({ ok: true });
}

// POST /api/sessions/[slug]/fog — paint operations (throttled by client)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sessionRow[0].owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();

  // body.strokes is an array of { x, y, radius, mode } paint operations
  if (body.strokes && Array.isArray(body.strokes)) {
    for (const stroke of body.strokes) {
      broadcast(slug, { type: 'fog:paint', payload: stroke });
    }
  }

  // body.reset sends a fog reset event
  if (body.reset) {
    broadcast(slug, { type: 'fog:reset', payload: {} });
  }

  // body.ping sends a ping event
  if (body.ping) {
    broadcast(slug, { type: 'ping', payload: body.ping });
  }

  // body.camera broadcasts camera viewport update
  if (body.camera) {
    setCameraState(slug, body.camera);
    broadcast(slug, { type: 'camera:move', payload: body.camera });
  }

  // body.blackout broadcasts blackout state
  if (body.blackout !== undefined) {
    setBlackoutState(slug, body.blackout.active ? body.blackout : null);
    broadcast(slug, { type: 'session:blackout', payload: body.blackout });
  }

  return NextResponse.json({ ok: true });
}
