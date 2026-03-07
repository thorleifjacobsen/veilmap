'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Session, SSEEvent, FogPaintPayload, FogSnapshotPayload, FullStatePayload, MapObject, CameraViewport, BlackoutPayload, CameraMovePayload } from '@/types';
import { MAP_W, MAP_H, createFogCanvas, paintHide, revealBox as revealBoxFog, loadFogFromBase64, animateReveal } from '@/lib/fog-engine';
import { applyViewport, type Viewport } from '@/lib/viewport';
import PrepScreen from './PrepScreen';

export default function PlayerDisplay({ slug }: { slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapImageRef = useRef<HTMLImageElement | null>(null);
  const vpRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const rafRef = useRef<number>(0);
  const sessionRef = useRef<Session | null>(null);
  const cameraRef = useRef<CameraViewport | null>(null);
  const objectsRef = useRef<MapObject[]>([]);
  const objectImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [connected, setConnected] = useState(false);
  const [prepMode, setPrepMode] = useState(false);
  const [prepMessage, setPrepMessage] = useState('Preparing next scene…');
  const [sessionName, setSessionName] = useState('');
  const [blackout, setBlackout] = useState<{ active: boolean; message?: string } | null>(null);

  // Initialize fog canvas
  useEffect(() => {
    fogCanvasRef.current = createFogCanvas();
  }, []);

  // Compute viewport from camera
  const computeViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();
    const cam = cameraRef.current;
    if (cam && !(cam.x === 0 && cam.y === 0 && cam.w === MAP_W && cam.h === MAP_H)) {
      const scaleX = width / cam.w;
      const scaleY = height / cam.h;
      const scale = Math.min(scaleX, scaleY);
      vpRef.current = {
        x: width / 2 - (cam.x + cam.w / 2) * scale,
        y: height / 2 - (cam.y + cam.h / 2) * scale,
        scale,
      };
    } else {
      const scaleX = width / MAP_W;
      const scaleY = height / MAP_H;
      const scale = Math.min(scaleX, scaleY);
      vpRef.current = {
        x: (width - MAP_W * scale) / 2,
        y: (height - MAP_H * scale) / 2,
        scale,
      };
    }
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
      computeViewport();
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [computeViewport]);

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const fogCanvas = fogCanvasRef.current;
    if (!canvas || !fogCanvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;

    // Full black background (letterboxing)
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const cam = cameraRef.current;
    const vp = vpRef.current;

    // If we have a custom camera, clip to the camera area on screen
    const isCustomCam = cam && !(cam.x === 0 && cam.y === 0 && cam.w === MAP_W && cam.h === MAP_H);

    if (isCustomCam) {
      const screenX = vp.x + cam.x * vp.scale;
      const screenY = vp.y + cam.y * vp.scale;
      const screenW = cam.w * vp.scale;
      const screenH = cam.h * vp.scale;

      ctx.save();
      ctx.beginPath();
      ctx.rect(screenX, screenY, screenW, screenH);
      ctx.clip();
    }

    ctx.save();
    applyViewport(ctx, vp);

    // Draw map
    if (mapImageRef.current) {
      ctx.drawImage(mapImageRef.current, 0, 0, MAP_W, MAP_H);
    } else {
      drawDefaultMap(ctx);
    }

    // Draw map objects sorted by zIndex
    const sorted = [...objectsRef.current].sort((a, b) => a.zIndex - b.zIndex);
    sorted.forEach((obj) => {
      if (!obj.visible) return;
      const img = objectImagesRef.current.get(obj.id);
      if (img) ctx.drawImage(img, obj.x, obj.y, obj.w, obj.h);
    });

    ctx.restore();

    // Draw fog at full opacity (also within clip)
    ctx.save();
    applyViewport(ctx, vp);
    ctx.globalAlpha = 1.0;
    ctx.drawImage(fogCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Restore clip if applied
    if (isCustomCam) {
      ctx.restore();
    }

    rafRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [render]);

  // Helper to preload object images
  const loadObjectImages = useCallback((objs: MapObject[]) => {
    objectsRef.current = objs;
    // Clean up stale image entries
    const currentIds = new Set(objs.map(o => o.id));
    for (const id of objectImagesRef.current.keys()) {
      if (!currentIds.has(id)) objectImagesRef.current.delete(id);
    }
    objs.forEach((obj) => {
      // Always reload if image not yet loaded or src changed
      const existing = objectImagesRef.current.get(obj.id);
      if (existing && existing.src === obj.src) return;
      const img = new Image();
      img.onload = () => { objectImagesRef.current.set(obj.id, img); };
      img.src = obj.src;
    });
  }, []);

  // SSE connection
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      eventSource = new EventSource(`/api/sessions/${encodeURIComponent(slug)}/events`);

      eventSource.onmessage = (e) => {
        try {
          const event: SSEEvent = JSON.parse(e.data);
          handleEvent(event);
        } catch { /* ignore parse errors */ }
      };

      eventSource.onopen = () => setConnected(true);

      eventSource.onerror = () => {
        setConnected(false);
        eventSource?.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    function handleEvent(event: SSEEvent) {
      const fogCtx = fogCanvasRef.current?.getContext('2d');

      switch (event.type) {
        case 'state:full': {
          const p = event.payload as FullStatePayload;
          sessionRef.current = p.session;
          setSessionName(p.session.name);
          setPrepMode(p.session.prep_mode);
          setPrepMessage(p.session.prep_message);
          setConnected(true);
          if (p.fogPng && fogCtx) loadFogFromBase64(fogCtx, p.fogPng);
          if (p.session.map_url) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { mapImageRef.current = img; };
            img.src = p.session.map_url;
          }
          // Load objects from full state
          if (p.objects) loadObjectImages(p.objects);
          // Set camera
          if (p.camera) {
            cameraRef.current = p.camera;
            computeViewport();
          }
          // Set blackout
          const bl = (p as FullStatePayload & { blackout?: BlackoutPayload }).blackout;
          if (bl) setBlackout(bl);
          break;
        }
        case 'fog:paint': {
          const p = event.payload as FogPaintPayload;
          if (fogCtx) {
            if (p.mode === 'reveal') {
              animateReveal(fogCtx, p.x, p.y, p.radius);
            } else {
              paintHide(fogCtx, p.x, p.y, p.radius);
            }
          }
          break;
        }
        case 'fog:snapshot': {
          const p = event.payload as FogSnapshotPayload;
          if (fogCtx) loadFogFromBase64(fogCtx, p.png);
          break;
        }
        case 'fog:reset': {
          if (fogCtx) { fogCtx.fillStyle = '#080710'; fogCtx.fillRect(0, 0, MAP_W, MAP_H); }
          break;
        }
        case 'box:reveal': {
          const p = event.payload as { boxId: string };
          if (sessionRef.current) {
            const box = sessionRef.current.boxes.find(b => b.id === p.boxId);
            if (box && fogCtx) revealBoxFog(fogCtx, box);
            sessionRef.current = {
              ...sessionRef.current,
              boxes: sessionRef.current.boxes.map(b => b.id === p.boxId ? { ...b, revealed: true } : b),
            };
          }
          break;
        }
        case 'box:hide': {
          const p = event.payload as { boxId: string };
          if (sessionRef.current) {
            sessionRef.current = {
              ...sessionRef.current,
              boxes: sessionRef.current.boxes.map(b => b.id === p.boxId ? { ...b, revealed: false } : b),
            };
          }
          break;
        }
        case 'box:create': {
          const box = event.payload as Session['boxes'][0];
          if (sessionRef.current) {
            sessionRef.current = { ...sessionRef.current, boxes: [...sessionRef.current.boxes, box] };
          }
          break;
        }
        case 'box:delete': {
          const p = event.payload as { boxId: string };
          if (sessionRef.current) {
            sessionRef.current = { ...sessionRef.current, boxes: sessionRef.current.boxes.filter(b => b.id !== p.boxId) };
          }
          break;
        }
        case 'token:create': {
          const token = event.payload as Session['tokens'][0];
          if (sessionRef.current) {
            sessionRef.current = { ...sessionRef.current, tokens: [...sessionRef.current.tokens, token] };
          }
          break;
        }
        case 'token:move': {
          const p = event.payload as { tokenId: string; x: number; y: number };
          if (sessionRef.current) {
            sessionRef.current = {
              ...sessionRef.current,
              tokens: sessionRef.current.tokens.map(t => t.id === p.tokenId ? { ...t, x: p.x, y: p.y } : t),
            };
          }
          break;
        }
        case 'token:delete': {
          const p = event.payload as { tokenId: string };
          if (sessionRef.current) {
            sessionRef.current = { ...sessionRef.current, tokens: sessionRef.current.tokens.filter(t => t.id !== p.tokenId) };
          }
          break;
        }
        case 'session:prep': {
          const p = event.payload as { active: boolean; message?: string };
          setPrepMode(p.active);
          if (p.message) setPrepMessage(p.message);
          break;
        }
        case 'camera:move': {
          const p = event.payload as CameraMovePayload;
          cameraRef.current = p;
          computeViewport();
          break;
        }
        case 'session:blackout': {
          const p = event.payload as BlackoutPayload;
          setBlackout(p.active ? p : null);
          break;
        }
        case 'ping': {
          // TODO: render ping animation
          break;
        }
        case 'objects:update': {
          const p = event.payload as { objects: MapObject[] };
          loadObjectImages(p.objects);
          break;
        }
      }
    }

    connect();

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Force reconnect when tab becomes visible again
        eventSource?.close();
        clearTimeout(reconnectTimer);
        connect();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(reconnectTimer);
      eventSource?.close();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (prepMode) {
    return <PrepScreen message={prepMessage} />;
  }

  // Blackout screen
  if (blackout?.active) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.2rem', color: 'rgba(200,150,62,.4)', letterSpacing: '.2em', textAlign: 'center' }}>
          {blackout.message || 'Please wait…'}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black" onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.7) 100%)',
      }} />
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-1.5" style={{
        background: 'rgba(0,0,0,.8)', borderBottom: '1px solid rgba(200,150,62,.1)',
      }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '.75rem', color: 'rgba(200,150,62,.4)', letterSpacing: '.2em' }}>
          VEILMAP — {sessionName.toUpperCase()}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-1" style={{
        background: 'rgba(0,0,0,.65)', borderTop: '1px solid rgba(200,150,62,.07)',
      }}>
        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '.58rem', color: 'rgba(200,150,62,.35)', letterSpacing: '.15em' }}>
          {sessionName.toUpperCase()}
        </div>
        <div className="flex items-center gap-1" style={{ fontSize: '.55rem', fontFamily: 'Cinzel, serif', color: connected ? 'rgba(100,200,100,.6)' : 'rgba(200,100,100,.6)', letterSpacing: '.08em' }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: connected ? '#4caf50' : '#f44336' }} />
          {connected ? 'LIVE' : 'RECONNECTING…'}
        </div>
      </div>
    </div>
  );
}

function drawDefaultMap(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#0c0a08';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  const rooms: [number, number, number, number, string][] = [
    [160, 150, 580, 640, 'Entry Hall'], [950, 90, 520, 460, 'Guard Room'],
    [1550, 60, 720, 680, 'Throne Room'], [950, 680, 520, 560, 'Armory'],
    [1550, 820, 720, 620, 'The Vault'], [160, 950, 580, 470, 'Dungeon'],
  ];
  rooms.forEach(([rx, ry, rw, rh, label]) => {
    const g = ctx.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, Math.max(rw, rh) / 2);
    g.addColorStop(0, '#2e2214'); g.addColorStop(1, '#160f06');
    ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = '#4e3218'; ctx.lineWidth = 4; ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(200,150,62,.15)';
    ctx.font = `bold ${Math.min(rw, rh) * 0.08}px Cinzel, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), rx + rw / 2, ry + rh / 2);
  });
}
