'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
        if (r.status === 401) {
          router.push('/login');
          return [];
        }
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) setSessions(data);
        setLoading(false);
      })
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
    if (!confirm('Delete this session? This cannot be undone.')) return;
    await fetch(`/api/sessions/${slug}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.slug !== slug));
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: '#07060c', color: '#d4c4a0' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-3"
        style={{
          background: '#100f18',
          borderBottom: '1px solid rgba(200,150,62,.2)',
        }}
      >
        <div
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '1.3rem',
            fontWeight: 900,
            color: '#c8963e',
            letterSpacing: '.08em',
            textShadow: '0 0 16px rgba(200,150,62,.3)',
          }}
        >
          Veil<span style={{ color: '#e05c2a' }}>Map</span>
        </div>
        <div
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '.6rem',
            color: 'rgba(212,196,160,.4)',
            letterSpacing: '.1em',
          }}
        >
          DASHBOARD
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-8">
        {/* Create new session */}
        <div
          className="mb-8 p-5 rounded-lg"
          style={{
            background: '#0c0b13',
            border: '1px solid rgba(200,150,62,.2)',
          }}
        >
          <h2
            className="mb-4"
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '.7rem',
              color: '#c8963e',
              letterSpacing: '.12em',
              textTransform: 'uppercase',
            }}
          >
            ✦ New Session
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Session name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="flex-1 px-3 py-2 rounded outline-none"
              style={{
                background: 'rgba(0,0,0,.45)',
                border: '1px solid rgba(200,150,62,.2)',
                color: '#d4c4a0',
                fontFamily: "'Crimson Pro', serif",
                fontSize: '.85rem',
              }}
            />
            <button
              onClick={createSession}
              disabled={creating}
              className="px-5 py-2 rounded cursor-pointer transition-all"
              style={{
                fontFamily: 'Cinzel, serif',
                fontSize: '.6rem',
                letterSpacing: '.08em',
                background: 'rgba(200,150,62,.12)',
                border: '1px solid #c8963e',
                color: '#c8963e',
              }}
            >
              {creating ? 'Creating…' : 'CREATE'}
            </button>
          </div>
        </div>

        {/* Session list */}
        <h2
          className="mb-4"
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '.7rem',
            color: '#c8963e',
            letterSpacing: '.12em',
            textTransform: 'uppercase',
          }}
        >
          ✦ Your Sessions
        </h2>

        {loading ? (
          <div
            className="text-center py-8"
            style={{
              fontFamily: 'Cinzel, serif',
              fontSize: '.7rem',
              color: 'rgba(212,196,160,.4)',
              letterSpacing: '.1em',
            }}
          >
            Loading…
          </div>
        ) : sessions.length === 0 ? (
          <div
            className="text-center py-8"
            style={{
              fontFamily: "'Crimson Pro', serif",
              fontSize: '.9rem',
              color: 'rgba(212,196,160,.3)',
            }}
          >
            No sessions yet. Create your first adventure above!
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between p-4 rounded-lg transition-all"
                style={{
                  background: '#0c0b13',
                  border: '1px solid rgba(200,150,62,.15)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "'Crimson Pro', serif",
                      fontSize: '1rem',
                      color: '#d4c4a0',
                    }}
                  >
                    {s.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: '.5rem',
                      color: 'rgba(212,196,160,.3)',
                      letterSpacing: '.05em',
                    }}
                  >
                    /{s.slug} · {new Date(s.updated_at).toLocaleDateString()}
                    {s.prep_mode && (
                      <span style={{ color: '#a070d0', marginLeft: '8px' }}>● PREP</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/gm/${s.slug}`}
                    className="px-3 py-1.5 rounded transition-all"
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: '.55rem',
                      letterSpacing: '.06em',
                      background: 'rgba(200,150,62,.08)',
                      border: '1px solid rgba(200,150,62,.3)',
                      color: '#c8963e',
                    }}
                  >
                    ⚔ GM
                  </a>
                  <a
                    href={`/play/${s.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded transition-all"
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: '.55rem',
                      letterSpacing: '.06em',
                      background: 'rgba(200,150,62,.04)',
                      border: '1px solid rgba(200,150,62,.15)',
                      color: 'rgba(212,196,160,.5)',
                    }}
                  >
                    🎲 Display
                  </a>
                  <button
                    onClick={() => deleteSession(s.slug)}
                    className="px-3 py-1.5 rounded transition-all cursor-pointer"
                    style={{
                      fontFamily: 'Cinzel, serif',
                      fontSize: '.55rem',
                      letterSpacing: '.06em',
                      background: 'rgba(224,92,42,.05)',
                      border: '1px solid rgba(224,92,42,.2)',
                      color: '#e05c2a',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
