import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// PUT /api/sessions/[slug]/fog — save fog snapshot
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await params;

  const sessionRow = await db`SELECT id, owner_id FROM sessions WHERE slug = ${slug}`;
  if (!sessionRow.length) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (sessionRow[0].owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  if (!body.png) {
    return NextResponse.json({ error: 'Missing png data' }, { status: 400 });
  }

  const fogBuffer = Buffer.from(body.png, 'base64');
  await db`UPDATE sessions SET fog_snapshot = ${fogBuffer}, updated_at = NOW() WHERE slug = ${slug}`;

  return NextResponse.json({ ok: true });
}
