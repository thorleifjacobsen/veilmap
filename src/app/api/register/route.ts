import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.user.create({
    data: { email, password_hash: passwordHash },
    select: { id: true, email: true, created_at: true },
  });

  return NextResponse.json(result, { status: 201 });
}
