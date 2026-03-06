'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import type { Session } from '@/types';
import { MAP_W, MAP_H, createFogCanvas } from '@/lib/fog-engine';
import { fitToContainer, applyViewport, type Viewport } from '@/lib/viewport';

interface PlayerCanvasProps {
  session: Session;
}

export default function PlayerCanvas({ session }: PlayerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapImageRef = useRef<HTMLImageElement | null>(null);
  const vpRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const rafRef = useRef<number>(0);

  // Initialize fog canvas
  useEffect(() => {
    fogCanvasRef.current = createFogCanvas();
  }, []);

  // Load map image
  useEffect(() => {
    if (session.mapUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        mapImageRef.current = img;
      };
      img.src = session.mapUrl;
    } else {
      mapImageRef.current = null;
    }
  }, [session.mapUrl]);

  // Fit viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();
    vpRef.current = fitToContainer(MAP_W, MAP_H, width, height);
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      vpRef.current = fitToContainer(MAP_W, MAP_H, width, height);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const fogCanvas = fogCanvasRef.current;
    if (!canvas || !fogCanvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const vp = vpRef.current;

    ctx.clearRect(0, 0, W, H);

    // Draw map
    ctx.save();
    applyViewport(ctx, vp);
    if (mapImageRef.current) {
      ctx.drawImage(mapImageRef.current, 0, 0, MAP_W, MAP_H);
    } else {
      drawDefaultMap(ctx);
    }

    // Draw tokens
    session.tokens.forEach(t => {
      const r = 16;
      ctx.shadowColor = 'rgba(0,0,0,.7)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = t.color;
      ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,220,140,.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = '13px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.emoji, t.x, t.y);
    });
    ctx.restore();

    // Draw fog at full opacity
    ctx.save();
    applyViewport(ctx, vp);
    ctx.globalAlpha = 1.0;
    ctx.drawImage(fogCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.restore();

    rafRef.current = requestAnimationFrame(render);
  }, [session.tokens]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.7) 100%)',
        }}
      />

      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-1.5"
        style={{
          background: 'rgba(0,0,0,.8)',
          borderBottom: '1px solid rgba(200,150,62,.1)',
        }}
      >
        <div
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '.75rem',
            color: 'rgba(200,150,62,.4)',
            letterSpacing: '.2em',
          }}
        >
          VEILMAP — {session.name.toUpperCase()}
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1"
        style={{
          background: 'rgba(0,0,0,.65)',
          borderTop: '1px solid rgba(200,150,62,.07)',
        }}
      >
        <div
          style={{
            fontFamily: 'Cinzel, serif',
            fontSize: '.58rem',
            color: 'rgba(200,150,62,.35)',
            letterSpacing: '.15em',
          }}
        >
          {session.name.toUpperCase()}
        </div>
        <div
          className="flex items-center gap-1"
          style={{
            fontSize: '.55rem',
            fontFamily: 'Cinzel, serif',
            color: 'rgba(100,200,100,.6)',
            letterSpacing: '.08em',
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: '#4caf50',
              animation: 'livepulse 2s ease-in-out infinite',
            }}
          />
          LIVE
        </div>
      </div>

      <style jsx>{`
        @keyframes livepulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(76,175,80,.4); }
          50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(76,175,80,0); }
        }
      `}</style>
    </div>
  );
}

function drawDefaultMap(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#0c0a08';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  const rooms: [number, number, number, number, string][] = [
    [160, 150, 580, 640, 'Entry Hall'],
    [950, 90, 520, 460, 'Guard Room'],
    [1550, 60, 720, 680, 'Throne Room'],
    [950, 680, 520, 560, 'Armory'],
    [1550, 820, 720, 620, 'The Vault'],
    [160, 950, 580, 470, 'Dungeon'],
  ];

  rooms.forEach(([rx, ry, rw, rh, label]) => {
    const g = ctx.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, Math.max(rw, rh) / 2);
    g.addColorStop(0, '#2e2214');
    g.addColorStop(1, '#160f06');
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#4e3218';
    ctx.lineWidth = 4;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(200,150,62,.15)';
    ctx.font = `bold ${Math.min(rw, rh) * 0.08}px Cinzel, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), rx + rw / 2, ry + rh / 2);
  });
}
