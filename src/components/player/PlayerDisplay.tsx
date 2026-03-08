'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Session, FogPaintPayload, FogSnapshotPayload, FullStatePayload, MapObject, CameraViewport, BlackoutPayload, CameraMovePayload } from '@/types';
import { MAP_W, MAP_H, createFogCanvas, paintHide, revealBox as revealBoxFog, loadFogFromBase64, animateReveal } from '@/lib/fog-engine';
import { applyViewport, hexToRgba, type Viewport } from '@/lib/viewport';
import PrepScreen from './PrepScreen';
import { useSessionWS, type WSEvent } from '@/hooks/useSessionWS';

const FS_BTN_HIDE_DELAY = 3000; // ms — auto-hide fullscreen button after inactivity

// ── Particle system ──

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  alpha: number;
}

function spawnParticles(effect: string, intensity: number, w: number, h: number, existing: Particle[]): Particle[] {
  const count = Math.floor((intensity / 100) * 3);
  const particles = [...existing];
  for (let i = 0; i < count; i++) {
    if (effect === 'rain') {
      particles.push({
        x: Math.random() * w,
        y: -20,
        vx: 2.5 + Math.random(),
        vy: 18 + Math.random() * 8,
        life: 1, maxLife: 1,
        size: 1 + Math.random(),
        alpha: 0.4 + Math.random() * 0.3,
      });
    } else if (effect === 'snow') {
      particles.push({
        x: Math.random() * w,
        y: -10,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 1.5 + Math.random() * 1.5,
        life: 1, maxLife: 1,
        size: 2 + Math.random() * 3,
        alpha: 0.5 + Math.random() * 0.4,
      });
    } else if (effect === 'embers') {
      particles.push({
        x: Math.random() * w,
        y: h + 10,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -(1.5 + Math.random() * 2.5),
        life: 1, maxLife: 1,
        size: 1.5 + Math.random() * 2,
        alpha: 0.6 + Math.random() * 0.4,
      });
    } else if (effect === 'mist') {
      particles.push({
        x: Math.random() * w - 100,
        y: Math.random() * h,
        vx: 0.3 + Math.random() * 0.4,
        vy: (Math.random() - 0.5) * 0.2,
        life: 1, maxLife: 1,
        size: 80 + Math.random() * 120,
        alpha: 0.04 + Math.random() * 0.06,
      });
    }
  }
  return particles;
}

function updateAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  effect: string,
  w: number,
  h: number,
  dt: number
): Particle[] {
  ctx.clearRect(0, 0, w, h);
  const alive: Particle[] = [];

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Remove out-of-bounds
    if (effect === 'rain' && (p.y > h + 20 || p.x > w + 20)) continue;
    if (effect === 'snow' && p.y > h + 20) continue;
    if (effect === 'embers' && p.y < -20) continue;
    if (effect === 'mist' && p.x > w + 200) continue;

    ctx.save();
    ctx.globalAlpha = p.alpha;

    if (effect === 'rain') {
      ctx.strokeStyle = 'rgba(160,200,255,0.6)';
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2);
      ctx.stroke();
    } else if (effect === 'snow') {
      ctx.fillStyle = 'rgba(220,240,255,0.9)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (effect === 'embers') {
      const age = 1 - p.life;
      ctx.fillStyle = age < 0.5 ? 'rgba(255,160,40,0.9)' : 'rgba(255,80,20,0.7)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      // Flicker
      p.alpha = (0.6 + Math.random() * 0.4) * (1 - age * 0.3);
      p.vx += (Math.random() - 0.5) * 0.1;
    } else if (effect === 'mist') {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, 'rgba(200,220,255,0.15)');
      grad.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    alive.push(p);
  }

  return alive;
}

export default function PlayerDisplay({ slug }: { slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasBgRef = useRef<HTMLCanvasElement>(null);
  const canvasFogRef = useRef<HTMLCanvasElement>(null);
  const canvasParticleRef = useRef<HTMLCanvasElement>(null);
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
  const particleEffectRef = useRef<string>('none');
  const particleIntensityRef = useRef<number>(50);
  const particleRafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const [prepMode, setPrepMode] = useState(false);
  const [prepMessage, setPrepMessage] = useState('Preparing next scene…');
  const [sessionName, setSessionName] = useState('');
  const [blackout, setBlackout] = useState<{ active: boolean; message?: string } | null>(null);
  const [playerObjects, setPlayerObjects] = useState<MapObject[]>([]);
  const [htmlVpTransform, setHtmlVpTransform] = useState('translate(0px,0px) scale(1)');
  const [clipStyle, setClipStyle] = useState<React.CSSProperties>({});
  const [shaking, setShaking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFsBtn, setShowFsBtn] = useState(true);
  const fsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Helper to preload object images and push to React state
  const loadObjectImages = useCallback((objs: MapObject[]) => {
    objectsRef.current = objs;
    setPlayerObjects(objs);
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

  // WebSocket message handler
  const handleWSMessage = useCallback((event: WSEvent) => {
    const fogCtx = fogCanvasRef.current?.getContext('2d');

    switch (event.type) {
      case 'state:full': {
        const p = event.payload as FullStatePayload;
        sessionRef.current = p.session;
        setSessionName(p.session.name);
        setPrepMode(p.session.prep_mode);
        setPrepMessage(p.session.prep_message);
        if (p.fogPng && fogCtx) loadFogFromBase64(fogCtx, p.fogPng);
        if (p.session.map_url) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => { mapImageRef.current = img; };
          img.src = p.session.map_url;
        }
        // Load objects from full state
        if (p.objects) loadObjectImages(p.objects);
        // Set camera (from WS state or DB values)
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
      case 'fog:style': {
        // Animated fog removed — no-op for backward compatibility
        break;
      }
      case 'session:settings': {
        const p = event.payload as { environment?: { particleEffect?: string; particleIntensity?: number; showOnGM?: boolean } };
        if (p.environment) {
          if (p.environment.particleEffect !== undefined) particleEffectRef.current = p.environment.particleEffect;
          if (p.environment.particleIntensity !== undefined) particleIntensityRef.current = p.environment.particleIntensity;
          // Reset particles on effect change
          particlesRef.current = [];
        }
        break;
      }
      case 'audio:play': {
        const p = event.payload as { url: string; volume: number; loop: boolean };
        if (p.url) {
          const audio = new Audio(p.url);
          audio.volume = Math.min(1, Math.max(0, p.volume ?? 1));
          audio.loop = !!p.loop;
          audio.play().catch(() => {});
          if (!p.loop) audio.onended = () => audio.remove();
        }
        break;
      }
      case 'display:shake': {
        setShaking(true);
        setTimeout(() => setShaking(false), 600);
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadObjectImages, computeViewport]);

  const { status: wsStatus } = useSessionWS({
    slug,
    role: 'player',
    onMessage: handleWSMessage,
  });

  const connected = wsStatus === 'connected';

  // Particle animation loop
  useEffect(() => {
    let lastTime = performance.now();

    const animate = () => {
      const canvas = canvasParticleRef.current;
      if (!canvas) { particleRafRef.current = requestAnimationFrame(animate); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { particleRafRef.current = requestAnimationFrame(animate); return; }

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 16.67, 3); // normalized delta, capped
      lastTime = now;

      const effect = particleEffectRef.current;
      if (effect === 'none') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particlesRef.current = [];
        particleRafRef.current = requestAnimationFrame(animate);
        return;
      }

      // Spawn new particles based on intensity
      particlesRef.current = spawnParticles(effect, particleIntensityRef.current, canvas.width, canvas.height, particlesRef.current);

      // Cap particle count
      const maxParticles = Math.floor(particleIntensityRef.current * 3);
      if (particlesRef.current.length > maxParticles) {
        particlesRef.current = particlesRef.current.slice(-maxParticles);
      }

      particlesRef.current = updateAndDrawParticles(ctx, particlesRef.current, effect, canvas.width, canvas.height, dt);

      particleRafRef.current = requestAnimationFrame(animate);
    };

    particleRafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(particleRafRef.current); };
  }, []);

  // Resize particle canvas with container
  useEffect(() => {
    const resize = () => {
      const container = containerRef.current;
      const canvas = canvasParticleRef.current;
      if (!container || !canvas) return;
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // Track fullscreen state
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Auto-hide fullscreen button after inactivity
  useEffect(() => {
    const onMouseMove = () => {
      setShowFsBtn(true);
      if (fsTimerRef.current) clearTimeout(fsTimerRef.current);
      fsTimerRef.current = setTimeout(() => setShowFsBtn(false), FS_BTN_HIDE_DELAY);
    };
    window.addEventListener('mousemove', onMouseMove);
    fsTimerRef.current = setTimeout(() => setShowFsBtn(false), FS_BTN_HIDE_DELAY);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (fsTimerRef.current) clearTimeout(fsTimerRef.current);
    };
  }, []);

  if (prepMode) {
    return <PrepScreen message={prepMessage} />;
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black"
      onContextMenu={(e) => e.preventDefault()}
      style={shaking ? {
        animation: 'veilmap-shake 600ms ease-out',
      } : undefined}
    >
      {/* Shake keyframes (injected once) */}
      <style>{`
        @keyframes veilmap-shake {
          0% { transform: translate(0, 0) rotate(0deg); }
          10% { transform: translate(-6px, -3px) rotate(-0.5deg); }
          20% { transform: translate(5px, 4px) rotate(0.5deg); }
          30% { transform: translate(-4px, 2px) rotate(-0.3deg); }
          40% { transform: translate(3px, -3px) rotate(0.3deg); }
          50% { transform: translate(-2px, 1px) rotate(-0.2deg); }
          60% { transform: translate(1px, -1px) rotate(0.1deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
      `}</style>
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
      {/* Particle effects canvas — above fog */}
      <canvas ref={canvasParticleRef} className="absolute inset-0 w-full h-full block pointer-events-none" style={{ zIndex: 4 }} />
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
      {/* Fullscreen button */}
      <button
        onClick={toggleFullscreen}
        className="absolute z-[50] rounded cursor-pointer transition-opacity duration-300"
        style={{
          bottom: 28,
          right: 8,
          background: 'rgba(0,0,0,.45)',
          border: '1px solid rgba(200,150,62,.2)',
          color: 'rgba(200,150,62,.6)',
          padding: '4px 8px',
          fontSize: '.7rem',
          fontFamily: 'Cinzel, serif',
          opacity: showFsBtn ? 0.7 : 0.05,
        }}
        title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
      >
        {isFullscreen ? '✕' : '⛶'}
      </button>
    </div>
  );
}
