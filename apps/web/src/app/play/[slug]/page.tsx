'use client';

import React, { use, useState, useCallback, useRef, useEffect } from 'react';
import type { Session, WSMessage, FullStatePayload, FogPaintPayload, FogSnapshotPayload } from '@/types';
import { useSessionWS } from '@/lib/ws-client';
import { createFogCanvas, loadFogFromBase64, paintReveal, paintHide, revealBox as revealBoxFog, MAP_W, MAP_H } from '@/lib/fog-engine';
import PlayerCanvas from '@/components/player/PlayerCanvas';
import PrepScreen from '@/components/player/PrepScreen';

export default function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize fog canvas
  useEffect(() => {
    fogCanvasRef.current = createFogCanvas();
  }, []);

  const handleMessage = useCallback((msg: WSMessage) => {
    const fogCtx = fogCanvasRef.current?.getContext('2d');

    switch (msg.type) {
      case 'state:full': {
        const payload = msg.payload as FullStatePayload;
        setSession(payload.session as Session);
        setLoading(false);
        if (payload.fogPng && fogCtx) {
          loadFogFromBase64(fogCtx, payload.fogPng);
        }
        break;
      }
      case 'fog:paint': {
        const p = msg.payload as FogPaintPayload;
        if (fogCtx) {
          if (p.mode === 'reveal') paintReveal(fogCtx, p.x, p.y, p.radius);
          else paintHide(fogCtx, p.x, p.y, p.radius);
        }
        break;
      }
      case 'fog:snapshot': {
        const p = msg.payload as FogSnapshotPayload;
        if (fogCtx) loadFogFromBase64(fogCtx, p.png);
        break;
      }
      case 'fog:reset': {
        if (fogCtx) {
          fogCtx.fillStyle = '#080710';
          fogCtx.fillRect(0, 0, MAP_W, MAP_H);
        }
        break;
      }
      case 'box:reveal': {
        const p = msg.payload as { boxId: string };
        setSession(prev => {
          if (!prev) return null;
          const box = prev.boxes.find(b => b.id === p.boxId);
          if (box && fogCtx) {
            revealBoxFog(fogCtx, box);
          }
          return {
            ...prev,
            boxes: prev.boxes.map(b => b.id === p.boxId ? { ...b, revealed: true } : b),
          };
        });
        break;
      }
      case 'box:hide': {
        const p = msg.payload as { boxId: string };
        setSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            boxes: prev.boxes.map(b => b.id === p.boxId ? { ...b, revealed: false } : b),
          };
        });
        break;
      }
      case 'box:create': {
        const p = msg.payload as { box: Session['boxes'][0] };
        setSession(prev => prev ? { ...prev, boxes: [...prev.boxes, p.box] } : null);
        break;
      }
      case 'box:delete': {
        const p = msg.payload as { boxId: string };
        setSession(prev => prev ? { ...prev, boxes: prev.boxes.filter(b => b.id !== p.boxId) } : null);
        break;
      }
      case 'token:create': {
        const p = msg.payload as { token: Session['tokens'][0] };
        setSession(prev => prev ? { ...prev, tokens: [...prev.tokens, p.token] } : null);
        break;
      }
      case 'token:move': {
        const p = msg.payload as { tokenId: string; x: number; y: number };
        setSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            tokens: prev.tokens.map(t => t.id === p.tokenId ? { ...t, x: p.x, y: p.y } : t),
          };
        });
        break;
      }
      case 'token:delete': {
        const p = msg.payload as { tokenId: string };
        setSession(prev => prev ? { ...prev, tokens: prev.tokens.filter(t => t.id !== p.tokenId) } : null);
        break;
      }
      case 'session:prep': {
        const p = msg.payload as { active: boolean; message?: string };
        setSession(prev => prev ? {
          ...prev,
          prepMode: p.active,
          prepMessage: p.message || prev.prepMessage,
        } : null);
        break;
      }
      case 'session:settings': {
        const p = msg.payload as { gmFogOpacity?: number; gridSize?: number };
        setSession(prev => prev ? {
          ...prev,
          gmFogOpacity: p.gmFogOpacity ?? prev.gmFogOpacity,
          gridSize: p.gridSize ?? prev.gridSize,
        } : null);
        break;
      }
    }
  }, []);

  useSessionWS(slug, 'player', handleMessage);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <div
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '1rem',
            color: 'rgba(200,150,62,.4)',
            letterSpacing: '.2em',
          }}
        >
          Connecting…
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <div
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '1rem',
            color: 'rgba(200,150,62,.4)',
            letterSpacing: '.2em',
          }}
        >
          Session not found
        </div>
      </div>
    );
  }

  // Show prep screen if in prep mode
  if (session.prepMode) {
    return <PrepScreen message={session.prepMessage} />;
  }

  return (
    <PlayerCanvas
      session={session}
    />
  );
}
