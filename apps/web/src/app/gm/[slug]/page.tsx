'use client';

import React, { use, useState, useCallback, useEffect } from 'react';
import type { Session, WSMessage, FullStatePayload } from '@/types';
import { useSessionWS } from '@/lib/ws-client';
import GMCanvas from '@/components/gm/GMCanvas';

export default function GMPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const handleMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'state:full') {
      const payload = msg.payload as FullStatePayload;
      setSession(payload.session as Session);
      setLoading(false);
    }
  }, []);

  const { send } = useSessionWS(slug, 'gm', handleMessage);

  // Also fetch session via REST as fallback
  useEffect(() => {
    fetch(`/api/sessions/${slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          setSession(data);
          setLoading(false);
        }
      })
      .catch(() => {});
  }, [slug]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#07060c', color: '#d4c4a0' }}>
        <div style={{ fontFamily: 'Cinzel, serif', letterSpacing: '.1em' }}>Loading session…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#07060c', color: '#d4c4a0' }}>
        <div style={{ fontFamily: 'Cinzel, serif', letterSpacing: '.1em' }}>Session not found</div>
      </div>
    );
  }

  return <GMCanvas session={session} send={send} />;
}
