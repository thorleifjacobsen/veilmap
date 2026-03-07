'use client';

import { use } from 'react';
import PlayerDisplay from '@/components/player/PlayerDisplay';

export default function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <PlayerDisplay slug={slug} />;
}
