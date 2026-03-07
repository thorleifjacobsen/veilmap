'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Session, SSEEvent, FogPaintPayload, FogSnapshotPayload, FullStatePayload, MapObject, CameraViewport, BlackoutPayload, CameraMovePayload } from '@/types';
import { MAP_W, MAP_H, createFogCanvas, paintHide, revealBox as revealBoxFog, loadFogFromBase64, animateReveal } from '@/lib/fog-engine';
import { applyViewport, hexToRgba, type Viewport } from '@/lib/viewport';
import { renderAnimatedFog } from '@/lib/animated-fog';
import PrepScreen from './PrepScreen';

export default function PlayerDisplay({ slug }: { slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasBgRef = useRef<HTMLCanvasElement>(null);
  const canvasFogRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapImageRef = useRef<HTMLImageElement | null>(null);
  const vpRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const rafRef = useRef<number>(0);
  const sessionRef = useRef<Session | null>(null);
  const cameraRef = useRef<CameraViewport | null>(null);
  const objectsRef = useRef<MapObject[]>([]);
  const objectImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pingsRef = useRef<Array<{ x: number; y: number; born: number }>>([]);
  const gridRef = useRef<{ show: boolean; size: number; color: string; opacity: number }>({ show: false, size: 32, color: '#c8963e', opacity: 0.25 });
  const fogStyleRef = useRef<'solid' | 'animated'>('solid');
  const [connected, setConnected] = useState(false);
  const [prepMode, setPrepMode] = useState(false);
  const [prepMessage, setPrepMessage] = useState('Preparing next scene…');
  const [sessionName, setSessionName] = useState('');
  const [blackout, setBlackout] = useState<{ active: boolean; message?: string } | null>(null);
  const [playerObjects, setPlayerObjects] = useState<MapObject[]>([]);
  const [htmlVpTransform, setHtmlVpTransform] = useState('translate(0px,0px) scale(1)');
  const [clipStyle, setClipStyle] = useState<React.CSSProperties>({});

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
      const canvasBg = canvasBgRef.current;
      const canvasFog = canvasFogRef.current;
      if (!container || !canvasBg || !canvasFog) return;
      const { width, height } = container.getBoundingClientRect();
      canvasBg.width = width;
      canvasBg.height = height;
      canvasFog.width = width;
      canvasFog.height = height;
      computeViewport();
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [computeViewport]);

  // Render loop
  const render = useCallback(() => {
    const canvasBg = canvasBgRef.current;
    const canvasFog = canvasFogRef.current;
    const fogCanvas = fogCanvasRef.current;
    if (!canvasBg || !canvasFog || !fogCanvas) return;
    const ctxBg = canvasBg.getContext('2d');
    const ctxFog = canvasFog.getContext('2d');
    if (!ctxBg || !ctxFog) return;
    const W = canvasBg.width, H = canvasBg.height;

    const cam = cameraRef.current;
    const vp = vpRef.current;
    const isCustomCam = cam && !(cam.x === 0 && cam.y === 0 && cam.w === MAP_W && cam.h === MAP_H);

    // --- Background canvas: map image only ---
    ctxBg.clearRect(0, 0, W, H);
    ctxBg.fillStyle = '#000';
    ctxBg.fillRect(0, 0, W, H);

    if (isCustomCam) {
      const screenX = vp.x + cam.x * vp.scale;
      const screenY = vp.y + cam.y * vp.scale;
      const screenW = cam.w * vp.scale;
      const screenH = cam.h * vp.scale;
      ctxBg.save();
      ctxBg.beginPath();
      ctxBg.rect(screenX, screenY, screenW, screenH);
      ctxBg.clip();
    }

    ctxBg.save();
    applyViewport(ctxBg, vp);
    if (mapImageRef.current) {
      ctxBg.drawImage(mapImageRef.current, 0, 0, MAP_W, MAP_H);
    } else {
      ctxBg.fillStyle = '#0c0a08';
      ctxBg.fillRect(0, 0, MAP_W, MAP_H);
    }
    ctxBg.restore();
    if (isCustomCam) ctxBg.restore();

    // --- Update HTML object layer transform and clip ---
    setHtmlVpTransform(`translate(${vp.x}px,${vp.y}px) scale(${vp.scale})`);
    setPlayerObjects([...objectsRef.current]);
    if (isCustomCam) {
      const screenX = vp.x + cam.x * vp.scale;
      const screenY = vp.y + cam.y * vp.scale;
      const screenW = cam.w * vp.scale;
      const screenH = cam.h * vp.scale;
      setClipStyle({
        clipPath: `inset(${screenY}px ${W - screenX - screenW}px ${H - screenY - screenH}px ${screenX}px)`,
      });
    } else {
      setClipStyle({});
    }

    // --- Fog/overlay canvas: fog, grid, pings ---
    ctxFog.clearRect(0, 0, W, H);

    if (isCustomCam) {
      const screenX = vp.x + cam.x * vp.scale;
      const screenY = vp.y + cam.y * vp.scale;
      const screenW = cam.w * vp.scale;
      const screenH = cam.h * vp.scale;
      ctxFog.save();
      ctxFog.beginPath();
      ctxFog.rect(screenX, screenY, screenW, screenH);
      ctxFog.clip();
    }

    ctxFog.save();
    applyViewport(ctxFog, vp);
    ctxFog.globalAlpha = 1.0;
    ctxFog.drawImage(fogCanvas, 0, 0);
    // Animated fog overlay
    if (fogStyleRef.current === 'animated') {
      renderAnimatedFog(ctxFog, fogCanvas, Date.now() / 1000, MAP_W, MAP_H);
    }
    ctxFog.globalAlpha = 1;

    // Draw grid above fog so it's always visible
    if (gridRef.current.show && gridRef.current.size > 0) {
      const gs = gridRef.current.size;
      const gc = gridRef.current.color || '#c8963e';
      const go = gridRef.current.opacity ?? 0.25;
      ctxFog.strokeStyle = hexToRgba(gc, go);
      ctxFog.lineWidth = 0.5 / vp.scale;
      for (let x = 0; x <= MAP_W; x += gs) {
        ctxFog.beginPath(); ctxFog.moveTo(x, 0); ctxFog.lineTo(x, MAP_H); ctxFog.stroke();
      }
      for (let y = 0; y <= MAP_H; y += gs) {
        ctxFog.beginPath(); ctxFog.moveTo(0, y); ctxFog.lineTo(MAP_W, y); ctxFog.stroke();
      }
    }

    // Draw ping animations
    const now = Date.now();
    pingsRef.current = pingsRef.current.filter(p => now - p.born < 1500);
    pingsRef.current.forEach((p) => {
      const age = now - p.born;
      const t = age / 1500;
      const maxR = 60;
      for (let i = 0; i < 3; i++) {
        const rt = Math.max(0, t - i * 0.15);
        if (rt <= 0) continue;
        const r = rt * maxR;
        const alpha = Math.max(0, 1 - rt) * 0.7;
        ctxFog.beginPath();
        ctxFog.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctxFog.strokeStyle = `rgba(200,150,62,${alpha})`;
        ctxFog.lineWidth = 2;
        ctxFog.stroke();
      }
    });

    ctxFog.restore();
    if (isCustomCam) ctxFog.restore();

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
          // Set camera (from SSE state or DB values)
          if (p.camera) {
            cameraRef.current = p.camera;
            computeViewport();
          } else if (p.session.camera_x != null && p.session.camera_y != null && p.session.camera_w != null && p.session.camera_h != null) {
            cameraRef.current = { x: p.session.camera_x, y: p.session.camera_y, w: p.session.camera_w, h: p.session.camera_h };
            computeViewport();
          }
          // Set grid state
          if (p.grid) {
            gridRef.current = { show: p.grid.show, size: p.grid.size, color: p.grid.color || '#c8963e', opacity: p.grid.opacity ?? 0.25 };
          } else if (p.session.show_grid !== undefined) {
            gridRef.current = { show: p.session.show_grid, size: p.session.grid_size, color: p.session.grid_color || '#c8963e', opacity: p.session.grid_opacity ?? 0.25 };
          }
          // Set blackout
          const bl = (p as FullStatePayload & { blackout?: BlackoutPayload }).blackout;
          if (bl) setBlackout(bl);
          // Set fog style
          if (p.session.fog_style) {
            fogStyleRef.current = p.session.fog_style as 'solid' | 'animated';
          }
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
          if (fogCtx) { fogCtx.fillStyle = '#1a1a2e'; fogCtx.fillRect(0, 0, MAP_W, MAP_H); }
          break;
        }
        case 'fog:revealall': {
          if (fogCtx) { fogCtx.clearRect(0, 0, MAP_W, MAP_H); }
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
          const p = event.payload as { x: number; y: number };
          pingsRef.current.push({ x: p.x, y: p.y, born: Date.now() });
          break;
        }
        case 'grid:update': {
          const p = event.payload as { show: boolean; size: number; color?: string; opacity?: number };
          gridRef.current = { show: p.show, size: p.size, color: p.color || gridRef.current.color, opacity: p.opacity ?? gridRef.current.opacity };
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

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black" onContextMenu={(e) => e.preventDefault()}>
      {/* Background canvas — map image only */}
      <canvas ref={canvasBgRef} className="absolute inset-0 w-full h-full block" style={{ zIndex: 1 }} />
      {/* HTML object layer — GIFs animate naturally */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 2,
          ...clipStyle,
        }}
      >
        <div
          style={{
            position: 'absolute',
            transformOrigin: '0 0',
            transform: htmlVpTransform,
            width: MAP_W,
            height: MAP_H,
            overflow: 'hidden',
          }}
        >
          {[...playerObjects].sort((a, b) => a.zIndex - b.zIndex).map((obj) => {
            if (!obj.visible || !obj.playerVisible) return null;
            return (
              <img
                key={obj.id}
                src={obj.src}
                alt={obj.name}
                draggable={false}
                style={{
                  position: 'absolute',
                  left: obj.x,
                  top: obj.y,
                  width: obj.w,
                  height: obj.h,
                  transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            );
          })}
        </div>
      </div>
      {/* Fog/overlay canvas — fog, grid, pings */}
      <canvas ref={canvasFogRef} className="absolute inset-0 w-full h-full block pointer-events-none" style={{ zIndex: 3 }} />
      {/* Blackout overlay */}
      {blackout?.active && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1.2rem', color: 'rgba(200,150,62,.4)', letterSpacing: '.2em', textAlign: 'center' }}>
            {blackout.message || 'Please wait…'}
          </div>
        </div>
      )}
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
