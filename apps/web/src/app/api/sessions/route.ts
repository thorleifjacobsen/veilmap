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

  const sessions = await db`
    SELECT id, slug, name, map_url, prep_mode, created_at, updated_at
    FROM sessions
    WHERE owner_id = ${session.user.id}
    ORDER BY updated_at DESC
  `;

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
    const existing = await db`SELECT id FROM sessions WHERE slug = ${slug}`;
    if (!existing.length) break;
    slug = generateSlug();
    attempts++;
  }

  const result = await db`
    INSERT INTO sessions (slug, owner_id, name)
    VALUES (${slug}, ${session.user.id}, ${name})
    RETURNING *
  `;

  const s = result[0];
  return NextResponse.json({
    id: s.id,
    slug: s.slug,
    ownerId: s.owner_id,
    name: s.name,
    mapUrl: s.map_url,
    mapWidth: s.map_width,
    mapHeight: s.map_height,
    prepMode: s.prep_mode,
    prepMessage: s.prep_message,
    gmFogOpacity: s.gm_fog_opacity,
    gridSize: s.grid_size,
    boxes: [],
    tokens: [],
  }, { status: 201 });
}
