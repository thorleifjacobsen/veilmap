import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { generateSlug } from '@/lib/slug';

// GET /api/sessions — list sessions for authenticated user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessions = await db.session.findMany({
    where: { owner_id: session.user.id },
    select: {
      id: true,
      slug: true,
      name: true,
      map_url: true,
      prep_mode: true,
      created_at: true,
      updated_at: true,
    },
    orderBy: { updated_at: 'desc' },
  });

  return NextResponse.json(sessions);
}

// POST /api/sessions — create a new session
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const name = body.name || 'New Session';

  // Generate unique slug
  let slug = generateSlug();
  let attempts = 0;
  while (attempts < 10) {
    const existing = await db.session.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) break;
    slug = generateSlug();
    attempts++;
  }

  const s = await db.session.create({
    data: {
      slug,
      owner_id: session.user.id,
      name,
    },
  });

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
    boxes: [],
    tokens: [],
  }, { status: 201 });
}
