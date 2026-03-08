'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { dialogConfirm } from '@/components/DialogModal';

interface SessionSummary {
  id: string;
  slug: string;
  name: string;
  map_url: string | null;
  prep_mode: boolean;
  created_at: string;
  updated_at: string;
}

export default function DashboardPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => {
        if (r.status === 401) { router.push('/login'); return []; }
        return r.json();
      })
      .then(data => { if (Array.isArray(data)) setSessions(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [router]);

  const createSession = async () => {
    setCreating(true);
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName || 'New Session' }),
    });
    if (res.ok) {
      const session = await res.json();
      router.push(`/gm/${session.slug}`);
    }
    setCreating(false);
  };

  const deleteSession = async (slug: string) => {
    if (!(await dialogConfirm('Delete Session', 'Delete this session? This cannot be undone.', true))) return;
    await fetch(`/api/sessions/${slug}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.slug !== slug));
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--dark)', color: 'var(--text)' }}>
      <header className="flex items-center justify-between px-6 py-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.3rem', fontWeight: 900, color: 'var(--gold)', letterSpacing: '.08em', textShadow: '0 0 16px rgba(200,150,62,.3)' }}>
          Veil<span style={{ color: 'var(--ember)' }}>Map</span>
        </div>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '.6rem', color: 'var(--dim)', letterSpacing: '.1em' }}>DASHBOARD</div>
      </header>
      <div className="max-w-3xl mx-auto p-8">
        {/* Create new session */}
        <div className="mb-8 p-5 rounded-lg" style={{ background: 'var(--panel2)', border: '1px solid var(--border)' }}>
          <h2 className="mb-4" style={{ fontFamily: 'Cinzel, serif', fontSize: '.7rem', color: 'var(--gold)', letterSpacing: '.12em', textTransform: 'uppercase' }}>✦ New Session</h2>
          <div className="flex gap-3">
            <input type="text" placeholder="Session name…" value={newName} onChange={e => setNewName(e.target.value)}
              className="flex-1 px-3 py-2 rounded outline-none" style={{ background: 'rgba(0,0,0,.45)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '.85rem' }} />
            <button onClick={createSession} disabled={creating} className="px-5 py-2 rounded cursor-pointer transition-all"
              style={{ fontFamily: 'Cinzel, serif', fontSize: '.6rem', letterSpacing: '.08em', background: 'rgba(200,150,62,.12)', border: '1px solid var(--gold)', color: 'var(--gold)' }}>
              {creating ? 'Creating…' : 'CREATE'}
            </button>
          </div>
        </div>
        {/* Sessions list */}
        <h2 className="mb-4" style={{ fontFamily: 'Cinzel, serif', fontSize: '.7rem', color: 'var(--gold)', letterSpacing: '.12em', textTransform: 'uppercase' }}>✦ Your Sessions</h2>
        {loading ? (
          <div className="text-center py-8" style={{ fontFamily: 'Cinzel, serif', fontSize: '.7rem', color: 'var(--dim)', letterSpacing: '.1em' }}>Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8" style={{ fontSize: '.9rem', color: 'rgba(212,196,160,.3)' }}>No sessions yet. Create your first adventure above!</div>
        ) : (
          <div className="space-y-3">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between p-4 rounded-lg" style={{ background: 'var(--panel2)', border: '1px solid rgba(200,150,62,.15)' }}>
                <div>
                  <div style={{ fontSize: '1rem', color: 'var(--text)' }}>{s.name}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '.5rem', color: 'rgba(212,196,160,.3)', letterSpacing: '.05em' }}>
                    /{s.slug} · {new Date(s.updated_at).toLocaleDateString()}
                    {s.prep_mode && <span style={{ color: '#a070d0', marginLeft: '8px' }}>● PREP</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <a href={`/gm/${s.slug}`} className="px-3 py-1.5 rounded" style={{ fontFamily: 'Cinzel, serif', fontSize: '.55rem', letterSpacing: '.06em', background: 'rgba(200,150,62,.08)', border: '1px solid rgba(200,150,62,.3)', color: 'var(--gold)' }}>⚔ GM</a>
                  <a href={`/play/${s.slug}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded" style={{ fontFamily: 'Cinzel, serif', fontSize: '.55rem', letterSpacing: '.06em', background: 'rgba(200,150,62,.04)', border: '1px solid rgba(200,150,62,.15)', color: 'rgba(212,196,160,.5)' }}>🎲 Display</a>
                  <button onClick={() => deleteSession(s.slug)} className="px-3 py-1.5 rounded cursor-pointer" style={{ fontFamily: 'Cinzel, serif', fontSize: '.55rem', letterSpacing: '.06em', background: 'rgba(224,92,42,.05)', border: '1px solid rgba(224,92,42,.2)', color: 'var(--ember)' }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
