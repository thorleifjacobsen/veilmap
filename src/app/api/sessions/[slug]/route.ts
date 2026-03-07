import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/sessions/[slug] — get full session with boxes and objects
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const s = await db.session.findUnique({
    where: { slug },
    include: {
      boxes: true,
      map_objects: { orderBy: { z_index: 'asc' } },
    },
  });

  if (!s) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: s.id,
    slug: s.slug,
    owner_id: s.owner_id,
    name: s.name,
    map_url: s.map_url,
    prep_mode: s.prep_mode,
    prep_message: s.prep_message,
    gm_fog_opacity: s.gm_fog_opacity,
    grid_size: s.grid_size,
    show_grid: s.show_grid,
    camera_x: s.camera_x,
    camera_y: s.camera_y,
    camera_w: s.camera_w,
    camera_h: s.camera_h,
    boxes: s.boxes.map((b) => ({
      id: b.id,
      session_id: b.session_id,
      name: b.name,
      type: b.type,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      color: b.color,
      notes: b.notes,
      revealed: b.revealed,
      sort_order: b.sort_order,
    })),
    objects: s.map_objects.map((o) => ({
      id: o.id,
      name: o.name,
      src: o.src,
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      rotation: o.rotation,
      zIndex: o.z_index,
      visible: o.visible,
      playerVisible: o.player_visible,
      locked: o.locked,
    })),
  });
}

// PATCH /api/sessions/[slug] — update session settings
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { slug } = await params;

  const existing = await db.session.findUnique({ where: { slug }, select: { id: true, owner_id: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.map_url !== undefined) updates.map_url = body.map_url;
  if (body.prep_mode !== undefined) updates.prep_mode = body.prep_mode;
  if (body.prep_message !== undefined) updates.prep_message = body.prep_message;
  if (body.gm_fog_opacity !== undefined) updates.gm_fog_opacity = body.gm_fog_opacity;
  if (body.grid_size !== undefined) updates.grid_size = body.grid_size;
  if (body.show_grid !== undefined) updates.show_grid = body.show_grid;
  if (body.camera_x !== undefined) updates.camera_x = body.camera_x;
  if (body.camera_y !== undefined) updates.camera_y = body.camera_y;
  if (body.camera_w !== undefined) updates.camera_w = body.camera_w;
  if (body.camera_h !== undefined) updates.camera_h = body.camera_h;

  if (Object.keys(updates).length > 0) {
    await db.session.update({
      where: { slug },
      data: {
        ...updates,
        updated_at: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/sessions/[slug]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { slug } = await params;

  const existing = await db.session.findUnique({ where: { slug }, select: { id: true, owner_id: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await db.session.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}
