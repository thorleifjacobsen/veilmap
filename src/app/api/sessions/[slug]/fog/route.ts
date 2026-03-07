import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { broadcast, setFogState, setCameraState, setBlackoutState, setObjectsState } from '@/lib/sse';

// PUT /api/sessions/[slug]/fog — save fog snapshot and broadcast
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  const sessionRow = await db.session.findUnique({
    where: { slug },
    select: {
      id: true,
      owner_id: true,
      owner: {
        select: {
          is_pro: true,
        },
      },
    },
  });
  if (!sessionRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sessionRow.owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  if (!body.png) return NextResponse.json({ error: 'Missing png' }, { status: 400 });

  // Always store in memory for reconnecting players
  setFogState(slug, body.png);

  // Only persist to DB for pro users
  if (sessionRow.owner.is_pro) {
    const fogBuffer = Buffer.from(body.png, 'base64');
    await db.session.update({
      where: { slug },
      data: {
        fog_snapshot: fogBuffer,
        updated_at: new Date(),
      },
    });
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

  const sessionRow = await db.session.findUnique({ where: { slug }, select: { id: true, owner_id: true } });
  if (!sessionRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sessionRow.owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
    // Persist camera to DB
    await db.session.update({
      where: { slug },
      data: {
        camera_x: body.camera.x,
        camera_y: body.camera.y,
        camera_w: body.camera.w,
        camera_h: body.camera.h,
        updated_at: new Date(),
      },
    });
  }

  // body.blackout broadcasts blackout state
  if (body.blackout !== undefined) {
    setBlackoutState(slug, body.blackout.active ? body.blackout : null);
    broadcast(slug, { type: 'session:blackout', payload: body.blackout });
  }

  // body.objects broadcasts objects update and persists to DB
  if (body.objects) {
    setObjectsState(slug, body.objects);
    broadcast(slug, { type: 'objects:update', payload: { objects: body.objects } });
    // Persist objects to DB: delete all existing and re-create
    const sessionId = sessionRow.id;
    await db.mapObject.deleteMany({ where: { session_id: sessionId } });
    if (body.objects.length > 0) {
      await db.mapObject.createMany({
        data: body.objects.map((o: { id: string; name: string; src: string; x: number; y: number; w: number; h: number; rotation?: number; zIndex: number; visible: boolean; playerVisible?: boolean; locked: boolean }) => ({
          id: o.id,
          session_id: sessionId,
          name: o.name,
          src: o.src,
          x: o.x,
          y: o.y,
          w: o.w,
          h: o.h,
          rotation: o.rotation ?? 0,
          z_index: o.zIndex,
          visible: o.visible,
          player_visible: o.playerVisible ?? true,
          locked: o.locked,
        })),
      });
    }
  }

  // body.grid broadcasts grid state to players
  if (body.grid) {
    broadcast(slug, { type: 'grid:update', payload: body.grid });
  }

  return NextResponse.json({ ok: true });
}
