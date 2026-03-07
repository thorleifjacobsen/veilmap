import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '20', 10) * 1024 * 1024;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'public/uploads';

// POST /api/sessions/[slug]/upload — upload map image (pro only)
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = params;

  // Check session ownership and pro status
  const rows = await db`
    SELECT s.id, s.owner_id, u.is_pro
    FROM sessions s JOIN users u ON u.id = s.owner_id
    WHERE s.slug = ${slug}
  `;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (rows[0].owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!rows[0].is_pro) return NextResponse.json({ error: 'Pro feature only' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('map') as File | null;
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large' }, { status: 413 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }

  const filename = `${uuidv4()}.${ext}`;
  const uploadPath = join(process.cwd(), UPLOAD_DIR);
  await mkdir(uploadPath, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(uploadPath, filename), buffer);

  const mapUrl = `/uploads/${filename}`;
  await db`UPDATE sessions SET map_url = ${mapUrl}, updated_at = NOW() WHERE slug = ${slug}`;

  return NextResponse.json({ map_url: mapUrl });
}
