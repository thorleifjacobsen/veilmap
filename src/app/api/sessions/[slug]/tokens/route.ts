import { NextResponse } from 'next/server';

// Token endpoints removed — feature deprecated
export async function POST() {
  return NextResponse.json({ error: 'Tokens feature removed' }, { status: 410 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Tokens feature removed' }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Tokens feature removed' }, { status: 410 });
}

