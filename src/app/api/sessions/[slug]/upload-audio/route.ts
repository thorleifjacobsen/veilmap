import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '20', 10) * 1024 * 1024;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'public/uploads';
const ALLOWED_AUDIO_EXTS = ['mp3', 'ogg', 'wav'];

// POST /api/sessions/[slug]/upload-audio — upload audio file for soundboard
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { slug } = await params;

  const row = await db.session.findUnique({
    where: { slug },
    select: { id: true, owner_id: true },
  });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.owner_id !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get('audio') as File | null;
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large' }, { status: 413 });

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_AUDIO_EXTS.includes(ext)) {
    return NextResponse.json({ error: 'Invalid file type. Allowed: mp3, ogg, wav' }, { status: 400 });
  }

  const filename = `audio-${uuidv4()}.${ext}`;
  const uploadPath = join(process.cwd(), UPLOAD_DIR);
  await mkdir(uploadPath, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(uploadPath, filename), buffer);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
