'use client';

import React, { useState, useEffect, use } from 'react';
import type { Session } from '@/types';
import GMCanvas from '@/components/gm/GMCanvas';

export default function GMPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sessions/${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(data => {
        if (data.id) { setSession(data); setLoading(false); }
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--dark)', color: 'var(--text)' }}>
        <div style={{ fontFamily: 'Cinzel, serif', letterSpacing: '.1em' }}>Loading session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--dark)', color: 'var(--text)' }}>
        <div style={{ fontFamily: 'Cinzel, serif', letterSpacing: '.1em' }}>Session not found</div>
      </div>
    );
  }

  return <GMCanvas session={session} slug={slug} />;
}
