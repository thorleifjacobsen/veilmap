import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/library — get all library assets (user's + global)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const assets = await db.assetLibrary.findMany({
    where: {
      OR: [
        { owner_id: session.user.id },
        { is_global: true },
      ],
    },
    orderBy: [{ is_global: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      url: true,
      category: true,
      is_global: true,
    },
  });

  return NextResponse.json(assets);
}

// POST /api/library — add an asset to the library
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.name || !body.url) {
    return NextResponse.json({ error: 'Missing name or url' }, { status: 400 });
  }

  const asset = await db.assetLibrary.create({
    data: {
      owner_id: session.user.id,
      name: body.name,
      url: body.url,
      category: body.category || 'object',
      is_global: false,
    },
  });

  return NextResponse.json(asset, { status: 201 });
}

// DELETE /api/library — delete a library asset
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Only allow deleting own assets (not global)
  await db.assetLibrary.deleteMany({
    where: { id: body.id, owner_id: session.user.id, is_global: false },
  });

  return NextResponse.json({ ok: true });
}
