import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const MAX_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '20', 10) * 1024 * 1024;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'public/uploads';

// POST /api/uploads — upload a file and get back a URL
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large' }, { status: 413 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }

  const filename = `${uuidv4()}.${ext}`;
  const uploadPath = join(process.cwd(), UPLOAD_DIR);
  await mkdir(uploadPath, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(uploadPath, filename), buffer);

  const url = `/uploads/${filename}`;
  return NextResponse.json({ url, filename });
}
