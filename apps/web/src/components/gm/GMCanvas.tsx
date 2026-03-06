'use client';

import {
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import type { Session, Box, Token, WSMessage, FogPaintPayload, PingPayload } from '@/types';
import {
  MAP_W,
  MAP_H,
  FOG_SAVE_INTERVAL_MS,
  createFogCanvas,
  paintReveal,
  paintHide,
  revealBox as revealBoxFog,
  fogToBase64,
  loadFogFromBase64,
} from '@/lib/fog-engine';
import {
  screenToMap,
  mapToScreen,
  zoomAt,
  fitToContainer,
  applyViewport,
  type Viewport,
} from '@/lib/viewport';
import Toolbar from './Toolbar';
import RightPanel from './RightPanel';
import BoxEditor from './BoxEditor';
import SettingsModal from './SettingsModal';
import ContextMenu, { type ContextMenuState } from './ContextMenu';

/* ── Tool type ────────────────────────────────── */

export type ToolType = 'reveal' | 'hide' | 'box' | 'select' | 'token' | 'ping' | 'torch' | 'measure';

/* ── Constants ────────────────────────────────── */

const MAX_UNDO = 20;
const BOX_COLORS = ['#c8963e', '#e05c2a', '#6a4fc8', '#2a8a4a', '#c8300a', '#2a6a9a', '#888'];
const TYPE_COLORS: Record<string, string> = {
  autoReveal: '#c8963e', trigger: '#a080e0', hazard: '#e05c2a', note: '#5aba6a', hidden: '#555',
};

/* ── Helper ────────────────────────────────── */

function hexToRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ── Local types for torches/pings ────────── */

interface LocalTorch { id: number; x: number; y: number; r: number; }
interface LocalPing { id: number; x: number; y: number; born: number; }

/* ── Props ────────────────────────────────── */

interface GMCanvasProps {
  session: Session;
  send: (msg: WSMessage) => void;
  onMessage?: (msg: WSMessage) => void;
}

/* ══════════════════════════════════════════════
   GM CANVAS COMPONENT
   ══════════════════════════════════════════════ */

export default function GMCanvas({ session, send }: GMCanvasProps) {
  /* ── Refs: Canvas layers ── */
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const boxesCanvasRef = useRef<HTMLCanvasElement>(null);
  const fogGMCanvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const topCanvasRef = useRef<HTMLCanvasElement>(null);
  const interCanvasRef = useRef<HTMLCanvasElement>(null);

  /* ── Refs: Offscreen fog canvas ── */
  const fogOffRef = useRef<HTMLCanvasElement | null>(null);

  /* ── Refs: Custom map image ── */
  const customMapRef = useRef<HTMLImageElement | null>(null);

  /* ── Refs: Undo stack ── */
  const undoStackRef = useRef<HTMLCanvasElement[]>([]);

  /* ── Refs: Interaction state (mutable, no re-render) ── */
  const vpRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const paintingRef = useRef(false);
  const paintUndoPushedRef = useRef(false);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const spaceHeldRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const measureStartRef = useRef<{ sx: number; sy: number; mx: number; my: number } | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0, mx: 0, my: 0 });
  const dragTokenRef = useRef<Token | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const topLoopRef = useRef(false);
  const fogSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const boxNumRef = useRef(1);
  const animFrameRef = useRef<number>(0);

  /* ── State (triggers re-renders where needed) ── */
  const [tool, setToolState] = useState<ToolType>('reveal');
  const [brushSize, setBrushSize] = useState(36);
  const [showGrid, setShowGrid] = useState(false);
  const [gmFogOpacity, setGmFogOpacity] = useState(session.gmFogOpacity);
  const [gridSize, setGridSize] = useState(session.gridSize);
  const [boxes, setBoxes] = useState<Box[]>(session.boxes || []);
  const [tokens, setTokens] = useState<Token[]>(session.tokens || []);
  const [torches, setTorches] = useState<LocalTorch[]>([]);
  const [pings, setPings] = useState<LocalPing[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [editBox, setEditBox] = useState<Box | null>(null);
  const [pendingToken, setPendingToken] = useState<{ emoji: string; color: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showBoxesGM, setShowBoxesGM] = useState(true);
  const [showBoxesPlayer, setShowBoxesPlayer] = useState(false);
  const [prepMessage, setPrepMessage] = useState(session.prepMessage || 'Preparing next scene…');
  const [sessionName, setSessionName] = useState(session.name || '');
  const [notification, setNotification] = useState<string | null>(null);
  const [measureInfo, setMeasureInfo] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false, x: 0, y: 0, mapX: 0, mapY: 0,
    boxId: null, boxName: null, boxRevealed: false, tokenId: null,
  });

  // Keep mutable refs in sync with state
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const brushRef = useRef(brushSize);
  brushRef.current = brushSize;
  const gridSizeRef = useRef(gridSize);
  gridSizeRef.current = gridSize;
  const gmFogOpacityRef = useRef(gmFogOpacity);
  gmFogOpacityRef.current = gmFogOpacity;
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const torchesRef = useRef(torches);
  torchesRef.current = torches;
  const pingsRef = useRef(pings);
  pingsRef.current = pings;
  const pendingTokenRef = useRef(pendingToken);
  pendingTokenRef.current = pendingToken;
  const showBoxesGMRef = useRef(showBoxesGM);
  showBoxesGMRef.current = showBoxesGM;
  const selectedBoxIdRef = useRef(selectedBoxId);
  selectedBoxIdRef.current = selectedBoxId;

  /* ── Notification helper ── */
  const notifTimer = useRef<ReturnType<typeof setTimeout>>();
  const showNotif = useCallback((msg: string) => {
    setNotification(msg);
    clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotification(null), 2600);
  }, []);

  /* ── Snap to grid ── */
  const snap = useCallback((v: number) => Math.round(v / gridSizeRef.current) * gridSizeRef.current, []);

  /* ══════════════════════════════════════════════
     DRAW FUNCTIONS
     ══════════════════════════════════════════════ */

  const drawDefaultMap = useCallback((ctx: CanvasRenderingContext2D) => {
    const gs = gridSizeRef.current;
    ctx.fillStyle = '#0c0a08';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    // Noise
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * MAP_W, y = Math.random() * MAP_H;
      ctx.fillStyle = `rgba(${100 + ~~(Math.random() * 40)},${80 + ~~(Math.random() * 30)},${55 + ~~(Math.random() * 20)},${Math.random() * 0.1})`;
      ctx.beginPath(); ctx.arc(x, y, Math.random() * 2, 0, Math.PI * 2); ctx.fill();
    }
    const rooms: [number, number, number, number, string][] = [
      [160, 150, 580, 640, 'Entry Hall'], [950, 90, 520, 460, 'Guard Room'],
      [1550, 60, 720, 680, 'Throne Room'], [950, 680, 520, 560, 'Armory'],
      [1550, 820, 720, 620, 'The Vault'], [160, 950, 580, 470, 'Dungeon'],
    ];
    const corridors: [number, number, number, number, number][] = [
      [740, 390, 950, 330, 90], [1470, 320, 1550, 320, 90],
      [1210, 550, 1210, 680, 90], [1470, 990, 1550, 990, 90],
      [740, 1100, 950, 930, 90],
    ];
    corridors.forEach(([x1, y1, x2, y2, hw]) => {
      const dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / l * hw / 2, ny = dx / l * hw / 2;
      ctx.fillStyle = '#1a1408'; ctx.beginPath();
      ctx.moveTo(x1 + nx, y1 + ny); ctx.lineTo(x2 + nx, y2 + ny);
      ctx.lineTo(x2 - nx, y2 - ny); ctx.lineTo(x1 - nx, y1 - ny);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#282010'; ctx.lineWidth = 2; ctx.stroke();
    });
    rooms.forEach(([rx, ry, rw, rh, label]) => {
      const g = ctx.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, Math.max(rw, rh) / 2);
      g.addColorStop(0, '#2e2214'); g.addColorStop(1, '#160f06');
      ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = 'rgba(255,220,140,.04)'; ctx.lineWidth = 1;
      for (let tx = rx; tx < rx + rw; tx += gs) { ctx.beginPath(); ctx.moveTo(tx, ry); ctx.lineTo(tx, ry + rh); ctx.stroke(); }
      for (let ty = ry; ty < ry + rh; ty += gs) { ctx.beginPath(); ctx.moveTo(rx, ty); ctx.lineTo(rx + rw, ty); ctx.stroke(); }
      ctx.strokeStyle = '#4e3218'; ctx.lineWidth = 4; ctx.strokeRect(rx, ry, rw, rh);
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 7; ctx.strokeRect(rx + 3, ry + 3, rw - 6, rh - 6);
      ctx.fillStyle = 'rgba(200,150,62,.15)';
      ctx.font = `bold ${Math.min(rw, rh) * 0.08}px Cinzel,serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label.toUpperCase(), rx + rw / 2, ry + rh / 2);
    });
    const emojis: [number, number, string][] = [
      [390, 380, '🕯️'], [280, 650, '⚰️'], [1820, 240, '👑'], [2000, 450, '🗡️'],
      [1210, 900, '🛡️'], [1900, 1050, '💎'], [400, 1100, '🔗'], [260, 1200, '💀'],
    ];
    emojis.forEach(([x, y, e]) => {
      ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.4; ctx.fillText(e, x, y); ctx.globalAlpha = 1;
    });
  }, []);

  const drawGridLines = useCallback((ctx: CanvasRenderingContext2D) => {
    const gs = gridSizeRef.current;
    const vp = vpRef.current;
    ctx.strokeStyle = 'rgba(200,150,62,.07)'; ctx.lineWidth = 1 / vp.scale;
    for (let x = 0; x <= MAP_W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke(); }
    for (let y = 0; y <= MAP_H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke(); }
  }, []);

  const drawMap = useCallback(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const vp = vpRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); applyViewport(ctx, vp);
    if (customMapRef.current) {
      ctx.drawImage(customMapRef.current, 0, 0, MAP_W, MAP_H);
    } else {
      drawDefaultMap(ctx);
    }
    if (showGrid) drawGridLines(ctx);
    ctx.restore();
  }, [drawDefaultMap, drawGridLines, showGrid]);

  const renderBox = useCallback((ctx: CanvasRenderingContext2D, b: Box, forPlayer: boolean) => {
    const vp = vpRef.current;
    if (b.type === 'note' && forPlayer) return;
    if (b.type === 'hidden') return;
    const col = b.color || TYPE_COLORS[b.type] || '#c8963e';
    const a = b.revealed ? 0.25 : 1;
    ctx.save();
    ctx.globalAlpha = a * (forPlayer ? 0.4 : 1);
    ctx.fillStyle = hexToRgba(col, b.revealed ? 0.03 : 0.06);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = col;
    ctx.lineWidth = (selectedBoxIdRef.current === b.id ? 3 : 1.5) / vp.scale;
    if (!b.revealed) ctx.setLineDash([8 / vp.scale, 4 / vp.scale]);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
    if (b.type === 'hazard' && !b.revealed) {
      ctx.strokeStyle = hexToRgba('#e05c2a', 0.12);
      ctx.lineWidth = 2 / vp.scale;
      for (let i = -b.h; i < b.w + b.h; i += 24) {
        ctx.beginPath(); ctx.moveTo(b.x + i, b.y); ctx.lineTo(b.x + i - b.h, b.y + b.h); ctx.stroke();
      }
    }
    if (!forPlayer && b.w * vp.scale > 50 && b.h * vp.scale > 28) {
      const fs = Math.min(b.w, b.h) * 0.08;
      ctx.fillStyle = hexToRgba(col, b.revealed ? 0.4 : 0.65);
      ctx.font = `bold ${Math.max(10, fs)}px Cinzel,serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 - fs * 0.4);
      ctx.font = `${Math.max(7, fs * 0.65)}px Cinzel,serif`;
      ctx.fillStyle = hexToRgba(col, 0.35);
      ctx.fillText(`[${b.type}]`, b.x + b.w / 2, b.y + b.h / 2 + fs * 0.65);
    }
    ctx.restore();
  }, []);

  const redrawBoxes = useCallback(() => {
    const canvas = boxesCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const vp = vpRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!showBoxesGMRef.current) return;
    ctx.save(); applyViewport(ctx, vp);
    boxesRef.current.forEach((b) => renderBox(ctx, b, false));
    ctx.restore();
  }, [renderBox]);

  const composeFogGM = useCallback(() => {
    const canvas = fogGMCanvasRef.current;
    const fogOff = fogOffRef.current;
    if (!canvas || !fogOff) return;
    const ctx = canvas.getContext('2d')!;
    const vp = vpRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); applyViewport(ctx, vp);
    ctx.globalAlpha = gmFogOpacityRef.current;
    ctx.drawImage(fogOff, 0, 0);
    ctx.globalAlpha = 1;
    ctx.restore();
  }, []);

  const drawTop = useCallback(() => {
    const canvas = topCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const vp = vpRef.current;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save(); applyViewport(ctx, vp);

    // Torches
    const now = Date.now();
    torchesRef.current.forEach((t) => {
      const fl = 0.9 + Math.sin(now * 0.003 + t.id) * 0.1;
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r * fl);
      g.addColorStop(0, 'rgba(255,180,60,.16)');
      g.addColorStop(0.5, 'rgba(255,90,15,.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(t.x, t.y, t.r * fl, 0, Math.PI * 2); ctx.fill();
      ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🕯️', t.x, t.y);
    });

    // Pings — filter expired
    const livePings = pingsRef.current.filter((p) => now - p.born < 2400);
    if (livePings.length !== pingsRef.current.length) {
      setPings(livePings);
    }
    livePings.forEach((p) => {
      const age = now - p.born;
      const al = 1 - age / 2400;
      const r = 18 + (age / 2400) * 55;
      ctx.strokeStyle = `rgba(200,150,62,${al})`; ctx.lineWidth = 2 / vp.scale;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(200,150,62,${al * 0.35})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2); ctx.stroke();
    });

    // Tokens
    tokensRef.current.forEach((t) => {
      const r = 16;
      ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 8;
      ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = dragTokenRef.current?.id === t.id ? 'rgba(255,220,80,.9)' : 'rgba(255,220,140,.4)';
      ctx.lineWidth = (dragTokenRef.current?.id === t.id ? 2.5 : 1.5) / vp.scale;
      ctx.stroke();
      ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.emoji, t.x, t.y);
    });

    ctx.restore();

    // Screen-space overlays
    const mp = mousePosRef.current;

    // Measurement line
    if (toolRef.current === 'measure' && measureStartRef.current) {
      const ms = measureStartRef.current;
      ctx.strokeStyle = 'rgba(200,150,62,.8)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(ms.sx, ms.sy); ctx.lineTo(mp.x, mp.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200,150,62,.9)';
      ctx.beginPath(); ctx.arc(ms.sx, ms.sy, 4, 0, Math.PI * 2); ctx.fill();
      const dist = Math.sqrt((mp.x - ms.sx) ** 2 + (mp.y - ms.sy) ** 2) / vp.scale;
      const gs = gridSizeRef.current;
      setMeasureInfo(`${Math.round(dist / gs * 5)} ft · ${Math.round(dist / gs)} sq`);
    } else {
      setMeasureInfo(null);
    }

    // Box draw preview
    if (toolRef.current === 'box' && drawStartRef.current) {
      ctx.save(); applyViewport(ctx, vp);
      const ds = drawStartRef.current;
      const x = Math.min(ds.x, mp.mx), y = Math.min(ds.y, mp.my);
      const w = Math.abs(mp.mx - ds.x), h = Math.abs(mp.my - ds.y);
      const gs = gridSizeRef.current;
      const sx = snap(x), sy = snap(y);
      const sw = Math.max(gs, snap(w)), sh = Math.max(gs, snap(h));
      ctx.strokeStyle = 'rgba(200,150,62,.75)'; ctx.lineWidth = 2 / vp.scale;
      ctx.setLineDash([6 / vp.scale, 3 / vp.scale]);
      ctx.strokeRect(sx, sy, sw, sh); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200,150,62,.05)'; ctx.fillRect(sx, sy, sw, sh);
      ctx.font = `${Math.min(sw, sh) * 0.09}px Cinzel,serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(200,150,62,.4)';
      ctx.fillText(`${~~(sw / gs)}×${~~(sh / gs)}sq`, sx + sw / 2, sy + sh / 2);
      ctx.restore();
    }

    // Pending token ghost
    if (pendingTokenRef.current && toolRef.current === 'token') {
      ctx.save(); applyViewport(ctx, vp);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = pendingTokenRef.current.color;
      ctx.beginPath(); ctx.arc(mp.mx, mp.my, 16, 0, Math.PI * 2); ctx.fill();
      ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pendingTokenRef.current.emoji, mp.mx, mp.my);
      ctx.globalAlpha = 1; ctx.restore();
    }

    // Animation loop
    const needs = torchesRef.current.length > 0 || livePings.length > 0 ||
      (toolRef.current === 'box' && drawStartRef.current) ||
      (toolRef.current === 'measure' && measureStartRef.current) ||
      (pendingTokenRef.current && toolRef.current === 'token');
    if (needs && !topLoopRef.current) {
      topLoopRef.current = true;
      animFrameRef.current = requestAnimationFrame(() => {
        topLoopRef.current = false;
        drawTop();
      });
    }
  }, [snap]);

  const redrawAll = useCallback(() => {
    drawMap();
    redrawBoxes();
    composeFogGM();
    drawTop();
  }, [drawMap, redrawBoxes, composeFogGM, drawTop]);

  /* ══════════════════════════════════════════════
     FOG OPERATIONS
     ══════════════════════════════════════════════ */

  const pushUndo = useCallback(() => {
    const fogOff = fogOffRef.current;
    if (!fogOff) return;
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = MAP_W; snapCanvas.height = MAP_H;
    snapCanvas.getContext('2d')!.drawImage(fogOff, 0, 0);
    undoStackRef.current.push(snapCanvas);
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
  }, []);

  const undo = useCallback(() => {
    if (!undoStackRef.current.length) { showNotif('Nothing to undo'); return; }
    const snapCanvas = undoStackRef.current.pop()!;
    const fogOff = fogOffRef.current;
    if (!fogOff) return;
    const ctx = fogOff.getContext('2d')!;
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.drawImage(snapCanvas, 0, 0);
    composeFogGM();
    showNotif('↩ Undone');
  }, [composeFogGM, showNotif]);

  const sendFogSnapshot = useCallback(async () => {
    const fogOff = fogOffRef.current;
    if (!fogOff) return;
    const png = await fogToBase64(fogOff);
    send({
      type: 'fog:snapshot',
      sessionSlug: session.slug,
      payload: { png },
    });
  }, [send, session.slug]);

  const doRevealBox = useCallback((box: Box) => {
    if (box.revealed) return;
    pushUndo();
    const fogOff = fogOffRef.current;
    if (fogOff) {
      revealBoxFog(fogOff.getContext('2d')!, box);
      composeFogGM();
    }
    setBoxes((prev) => prev.map((b) => b.id === box.id ? { ...b, revealed: true } : b));
    send({ type: 'box:reveal', sessionSlug: session.slug, payload: { boxId: box.id } });
    if (box.notes) showNotif(`⚡ ${box.name}: ${box.notes.substring(0, 55)}${box.notes.length > 55 ? '…' : ''}`);
    else showNotif(`✦ ${box.name} revealed!`);
    sendFogSnapshot();
  }, [pushUndo, composeFogGM, send, session.slug, showNotif, sendFogSnapshot]);

  const doHideBox = useCallback((box: Box) => {
    const fogOff = fogOffRef.current;
    if (fogOff) {
      const ctx = fogOff.getContext('2d')!;
      ctx.fillStyle = 'rgba(8,7,16,.97)';
      ctx.fillRect(box.x, box.y, box.w, box.h);
      composeFogGM();
    }
    setBoxes((prev) => prev.map((b) => b.id === box.id ? { ...b, revealed: false } : b));
    send({ type: 'box:hide', sessionSlug: session.slug, payload: { boxId: box.id } });
  }, [composeFogGM, send, session.slug]);

  const paintFog = useCallback((mx: number, my: number, mode: 'reveal' | 'hide') => {
    const fogOff = fogOffRef.current;
    if (!fogOff) return;
    const ctx = fogOff.getContext('2d')!;
    const r = brushRef.current;

    if (mode === 'reveal') {
      // Check autoReveal boxes
      const hit = boxesRef.current.find(
        (b) => b.type === 'autoReveal' && !b.revealed && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h,
      );
      if (hit) { doRevealBox(hit); return; }

      // Check trigger boxes
      const trig = boxesRef.current.find(
        (b) => b.type === 'trigger' && !b.revealed && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h,
      );
      if (trig) {
        setBoxes((prev) => prev.map((b) => b.id === trig.id ? { ...b, revealed: true } : b));
        revealBoxFog(ctx, trig);
        composeFogGM();
        redrawBoxes();
        if (trig.notes) showNotif(`⚡ ${trig.name}: ${trig.notes.substring(0, 55)}${trig.notes.length > 55 ? '…' : ''}`);
        send({ type: 'box:reveal', sessionSlug: session.slug, payload: { boxId: trig.id } });
        return;
      }

      paintReveal(ctx, mx, my, r);
    } else {
      paintHide(ctx, mx, my, r);
    }

    composeFogGM();
    send({
      type: 'fog:paint',
      sessionSlug: session.slug,
      payload: { x: mx, y: my, radius: r, mode } as FogPaintPayload,
    });
  }, [doRevealBox, composeFogGM, redrawBoxes, showNotif, send, session.slug]);

  const resetFog = useCallback(() => {
    if (!confirm('Reset all fog?')) return;
    pushUndo();
    const fogOff = fogOffRef.current;
    if (fogOff) {
      const ctx = fogOff.getContext('2d')!;
      ctx.fillStyle = '#080710';
      ctx.fillRect(0, 0, MAP_W, MAP_H);
      composeFogGM();
    }
    setBoxes((prev) => prev.map((b) => ({ ...b, revealed: false })));
    send({ type: 'fog:reset', sessionSlug: session.slug, payload: {} });
    showNotif('Fog reset');
    sendFogSnapshot();
  }, [pushUndo, composeFogGM, send, session.slug, showNotif, sendFogSnapshot]);

  /* ══════════════════════════════════════════════
     EVENT HANDLERS
     ══════════════════════════════════════════════ */

  const getCanvasPos = useCallback((e: React.MouseEvent | MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return { x: 0, y: 0, sx: 0, sy: 0, mx: 0, my: 0 };
    const rect = wrap.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const vp = vpRef.current;
    const m = screenToMap(sx, sy, vp);
    return { x: sx, y: sy, sx, sy, mx: m.x, my: m.y };
  }, []);

  const startPan = useCallback((e: React.MouseEvent | MouseEvent) => {
    panningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panOriginRef.current = { x: vpRef.current.x, y: vpRef.current.y };
    wrapRef.current?.classList.add('cursor-grabbing');
  }, []);

  const doPan = useCallback((e: React.MouseEvent | MouseEvent) => {
    vpRef.current.x = panOriginRef.current.x + (e.clientX - panStartRef.current.x);
    vpRef.current.y = panOriginRef.current.y + (e.clientY - panStartRef.current.y);
    redrawAll();
  }, [redrawAll]);

  const stopPan = useCallback(() => {
    panningRef.current = false;
    wrapRef.current?.classList.remove('cursor-grabbing');
  }, []);

  const finalizeBox = useCallback((a: { x: number; y: number }, b: { x: number; y: number }) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (w < 20 || h < 20) { showNotif('Too small'); return; }
    const gs = gridSizeRef.current;
    const sx = snap(x), sy = snap(y);
    const sw = Math.max(gs, snap(w)), sh = Math.max(gs, snap(h));
    const nb: Box = {
      id: generateId(),
      sessionId: session.id,
      x: sx, y: sy, w: sw, h: sh,
      name: `Room ${boxNumRef.current++}`,
      type: 'autoReveal',
      color: BOX_COLORS[boxesRef.current.length % BOX_COLORS.length],
      notes: '',
      metaJson: {},
      revealed: false,
      sortOrder: boxesRef.current.length,
    };
    setBoxes((prev) => [...prev, nb]);
    send({ type: 'box:create', sessionSlug: session.slug, payload: { box: nb } });
    setEditBox(nb);
  }, [snap, showNotif, send, session.id, session.slug]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle mouse or space+left click = pan
    if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) { startPan(e); return; }
    if (e.button === 2) return; // right click handled by contextmenu

    const pos = getCanvasPos(e);
    mousePosRef.current = pos;

    // Token placement
    if (toolRef.current === 'token' && pendingTokenRef.current) {
      const newToken: Token = {
        id: generateId(),
        sessionId: session.id,
        emoji: pendingTokenRef.current.emoji,
        color: pendingTokenRef.current.color,
        x: pos.mx, y: pos.my,
        label: '',
      };
      setTokens((prev) => [...prev, newToken]);
      send({ type: 'token:create', sessionSlug: session.slug, payload: { token: newToken } });
      setPendingToken(null);
      setToolState('reveal');
      return;
    }

    // Token drag
    if (toolRef.current === 'select' || toolRef.current === 'token') {
      const tok = [...tokensRef.current].reverse().find((t) => Math.hypot(t.x - pos.mx, t.y - pos.my) < 18);
      if (tok) {
        dragTokenRef.current = tok;
        dragOffsetRef.current = { x: pos.mx - tok.x, y: pos.my - tok.y };
        return;
      }
    }

    if (toolRef.current === 'box') { drawStartRef.current = { x: pos.mx, y: pos.my }; return; }
    if (toolRef.current === 'measure') { measureStartRef.current = { sx: pos.sx, sy: pos.sy, mx: pos.mx, my: pos.my }; return; }
    if (toolRef.current === 'ping') {
      setPings((prev) => [...prev, { id: Date.now(), x: pos.mx, y: pos.my, born: Date.now() }]);
      send({ type: 'ping', sessionSlug: session.slug, payload: { x: pos.mx, y: pos.my } as PingPayload });
      showNotif('📍 Ping!');
      setToolState('reveal');
      drawTop();
      return;
    }
    if (toolRef.current === 'torch') {
      setTorches((prev) => [...prev, { id: Date.now(), x: pos.mx, y: pos.my, r: 110 }]);
      showNotif('🕯 Torch placed');
      drawTop();
      return;
    }
    if (toolRef.current === 'select') {
      // Check for box click
      const tok2 = [...tokensRef.current].reverse().find((t) => Math.hypot(t.x - pos.mx, t.y - pos.my) < 18);
      if (tok2) return;
      const box = boxesRef.current.find((b) => pos.mx >= b.x && pos.mx <= b.x + b.w && pos.my >= b.y && pos.my <= b.y + b.h);
      setSelectedBoxId(box?.id ?? null);
      redrawBoxes();
      if (box) setEditBox(box);
      return;
    }
    if (toolRef.current === 'reveal' || toolRef.current === 'hide') {
      if (!paintUndoPushedRef.current) { pushUndo(); paintUndoPushedRef.current = true; }
      paintingRef.current = true;
      paintFog(pos.mx, pos.my, toolRef.current);
    }
  }, [startPan, getCanvasPos, session.id, session.slug, send, showNotif, pushUndo, paintFog, redrawBoxes, drawTop]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    mousePosRef.current = pos;

    if (panningRef.current) { doPan(e); return; }

    if (dragTokenRef.current) {
      const newX = pos.mx - dragOffsetRef.current.x;
      const newY = pos.my - dragOffsetRef.current.y;
      setTokens((prev) => prev.map((t) => t.id === dragTokenRef.current!.id ? { ...t, x: newX, y: newY } : t));
      drawTop();
      return;
    }

    if (paintingRef.current && (toolRef.current === 'reveal' || toolRef.current === 'hide')) {
      paintFog(pos.mx, pos.my, toolRef.current);
      return;
    }

    if (['box', 'measure', 'select', 'token'].includes(toolRef.current)) drawTop();
  }, [getCanvasPos, doPan, drawTop, paintFog]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (panningRef.current) { stopPan(); return; }

    if (dragTokenRef.current) {
      const pos = getCanvasPos(e);
      const tokId = dragTokenRef.current.id;
      const newX = pos.mx - dragOffsetRef.current.x;
      const newY = pos.my - dragOffsetRef.current.y;
      send({ type: 'token:move', sessionSlug: session.slug, payload: { tokenId: tokId, x: newX, y: newY } });
      dragTokenRef.current = null;
      drawTop();
      return;
    }

    const pos = getCanvasPos(e);
    if (toolRef.current === 'box' && drawStartRef.current) {
      finalizeBox(drawStartRef.current, { x: pos.mx, y: pos.my });
      drawStartRef.current = null;
      drawTop();
    }
    if (toolRef.current === 'measure') { measureStartRef.current = null; drawTop(); }

    if (paintingRef.current) {
      paintingRef.current = false;
      paintUndoPushedRef.current = false;
      sendFogSnapshot();
    }
  }, [stopPan, getCanvasPos, send, session.slug, drawTop, finalizeBox, sendFogSnapshot]);

  const handleMouseLeave = useCallback(() => {
    stopPan();
    dragTokenRef.current = null;
    drawStartRef.current = null;
    measureStartRef.current = null;
    if (paintingRef.current) {
      paintingRef.current = false;
      paintUndoPushedRef.current = false;
      sendFogSnapshot();
    }
    drawTop();
  }, [stopPan, drawTop, sendFogSnapshot]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    vpRef.current = zoomAt(vpRef.current, pos.sx, pos.sy, factor);
    redrawAll();
  }, [getCanvasPos, redrawAll]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e);
    const box = boxesRef.current.find((b) => pos.mx >= b.x && pos.mx <= b.x + b.w && pos.my >= b.y && pos.my <= b.y + b.h) ?? null;
    const tok = [...tokensRef.current].reverse().find((t) => Math.hypot(t.x - pos.mx, t.y - pos.my) < 18) ?? null;
    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      mapX: pos.mx,
      mapY: pos.my,
      boxId: box?.id ?? null,
      boxName: box?.name ?? null,
      boxRevealed: box?.revealed ?? false,
      tokenId: tok?.id ?? null,
    });
  }, [getCanvasPos]);

  const handleContextAction = useCallback((action: string) => {
    const { mapX: mx, mapY: my, boxId, tokenId } = contextMenu;
    if (action === 'reveal') { pushUndo(); paintFog(mx, my, 'reveal'); sendFogSnapshot(); }
    if (action === 'hide') { pushUndo(); paintFog(mx, my, 'hide'); sendFogSnapshot(); }
    if (action === 'ping') {
      setPings((prev) => [...prev, { id: Date.now(), x: mx, y: my, born: Date.now() }]);
      send({ type: 'ping', sessionSlug: session.slug, payload: { x: mx, y: my } as PingPayload });
      drawTop();
    }
    if (action === 'torch') {
      setTorches((prev) => [...prev, { id: Date.now(), x: mx, y: my, r: 110 }]);
      drawTop();
    }
    if (action === 'revealBox' && boxId) {
      const box = boxesRef.current.find((b) => b.id === boxId);
      if (box) doRevealBox(box);
    }
    if (action === 'hideBox' && boxId) {
      const box = boxesRef.current.find((b) => b.id === boxId);
      if (box) doHideBox(box);
    }
    if (action === 'editBox' && boxId) {
      const box = boxesRef.current.find((b) => b.id === boxId);
      if (box) setEditBox(box);
    }
    if (action === 'deleteBox' && boxId) {
      setBoxes((prev) => prev.filter((b) => b.id !== boxId));
      send({ type: 'box:delete', sessionSlug: session.slug, payload: { boxId } });
      redrawBoxes();
    }
    if (action === 'deleteToken' && tokenId) {
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      send({ type: 'token:delete', sessionSlug: session.slug, payload: { tokenId } });
      drawTop();
    }
  }, [contextMenu, pushUndo, paintFog, sendFogSnapshot, send, session.slug, doRevealBox, doHideBox, redrawBoxes, drawTop]);

  /* ── Tool setter ── */
  const setTool = useCallback((t: ToolType) => {
    setToolState(t);
    if (t !== 'token') setPendingToken(null);
    drawTop();
  }, [drawTop]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !['INPUT', 'TEXTAREA'].includes((document.activeElement?.tagName ?? ''))) {
        e.preventDefault();
        spaceHeldRef.current = true;
        wrapRef.current?.classList.add('cursor-grab');
      }
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (!['INPUT', 'TEXTAREA'].includes((document.activeElement?.tagName ?? ''))) {
        const keyMap: Record<string, ToolType> = { r: 'reveal', h: 'hide', b: 'box', s: 'select', t: 'token', p: 'ping', m: 'measure' };
        const k = e.key.toLowerCase();
        if (k === 'g') setShowGrid((prev) => !prev);
        else if (keyMap[k]) setTool(keyMap[k]);
        if (e.key === 'Escape') {
          setPendingToken(null);
          setContextMenu((prev) => ({ ...prev, open: false }));
          setEditBox(null);
          setSettingsOpen(false);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        wrapRef.current?.classList.remove('cursor-grab');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [undo, setTool]);

  /* ══════════════════════════════════════════════
     INITIALIZATION
     ══════════════════════════════════════════════ */

  useEffect(() => {
    // Create offscreen fog canvas
    fogOffRef.current = createFogCanvas();

    // Initial resize
    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const W = wrap.offsetWidth, H = wrap.offsetHeight;
      [mapCanvasRef, boxesCanvasRef, fogGMCanvasRef, fogCanvasRef, topCanvasRef, interCanvasRef].forEach((ref) => {
        if (ref.current) { ref.current.width = W; ref.current.height = H; }
      });
      // Fit view on first load
      vpRef.current = fitToContainer(MAP_W, MAP_H, W, H);
      redrawAll();
    };

    resize();
    const resizeHandler = () => setTimeout(resize, 60);
    window.addEventListener('resize', resizeHandler);

    // Fog save interval
    fogSaveTimerRef.current = setInterval(() => {
      if (paintingRef.current) sendFogSnapshot();
    }, FOG_SAVE_INTERVAL_MS);

    return () => {
      window.removeEventListener('resize', resizeHandler);
      if (fogSaveTimerRef.current) clearInterval(fogSaveTimerRef.current);
      cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw when grid visibility or gridSize changes
  useEffect(() => { redrawAll(); }, [showGrid, gridSize, redrawAll]);

  // Redraw boxes when boxes or selectedBoxId change
  useEffect(() => { redrawBoxes(); drawTop(); }, [boxes, selectedBoxId, redrawBoxes, drawTop]);

  // Recompose fog when opacity changes
  useEffect(() => { composeFogGM(); }, [gmFogOpacity, composeFogGM]);

  /* ══════════════════════════════════════════════
     CALLBACKS FOR CHILD COMPONENTS
     ══════════════════════════════════════════════ */

  const handleMapUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        customMapRef.current = img;
        drawMap();
        showNotif('Map loaded!');
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [drawMap, showNotif]);

  const handleBoxClick = useCallback((boxId: string) => {
    setSelectedBoxId(boxId);
    const box = boxesRef.current.find((b) => b.id === boxId);
    if (box) setEditBox(box);
  }, []);

  const handleRevealAll = useCallback(() => {
    boxesRef.current.filter((b) => b.type === 'autoReveal' && !b.revealed).forEach((b) => doRevealBox(b));
  }, [doRevealBox]);

  const handleClearBoxes = useCallback(() => {
    if (!confirm('Delete all boxes?')) return;
    const ids = boxesRef.current.map((b) => b.id);
    setBoxes([]);
    ids.forEach((id) => send({ type: 'box:delete', sessionSlug: session.slug, payload: { boxId: id } }));
  }, [send, session.slug]);

  const handleQueueToken = useCallback((emoji: string, color: string) => {
    setPendingToken({ emoji, color });
    setTool('token');
    showNotif(`Click map to place ${emoji}`);
  }, [setTool, showNotif]);

  const handleClearTokens = useCallback(() => {
    const ids = tokensRef.current.map((t) => t.id);
    setTokens([]);
    setTorches([]);
    ids.forEach((id) => send({ type: 'token:delete', sessionSlug: session.slug, payload: { tokenId: id } }));
    showNotif('Tokens cleared');
  }, [send, session.slug, showNotif]);

  const handleBoxSave = useCallback((boxId: string, updates: Partial<Box>) => {
    setBoxes((prev) => prev.map((b) => b.id === boxId ? { ...b, ...updates } : b));
    send({ type: 'box:update', sessionSlug: session.slug, payload: { boxId, updates } });
    setEditBox(null);
    showNotif(`Saved: ${updates.name || ''}`);
  }, [send, session.slug, showNotif]);

  const handleBoxDelete = useCallback((boxId: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== boxId));
    send({ type: 'box:delete', sessionSlug: session.slug, payload: { boxId } });
    setEditBox(null);
  }, [send, session.slug]);

  const handleSettingsChangeOpacity = useCallback((v: number) => {
    setGmFogOpacity(v);
    send({ type: 'session:settings', sessionSlug: session.slug, payload: { gmFogOpacity: v, gridSize: gridSizeRef.current } });
  }, [send, session.slug]);

  const handleSettingsChangeGridSize = useCallback((v: number) => {
    setGridSize(v);
    send({ type: 'session:settings', sessionSlug: session.slug, payload: { gmFogOpacity: gmFogOpacityRef.current, gridSize: v } });
  }, [send, session.slug]);

  /* ══════════════════════════════════════════════
     HANDLE DROP ON CANVAS (map file)
     ══════════════════════════════════════════════ */
  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleMapUpload(file);
  }, [handleMapUpload]);

  /* ══════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════ */

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      {/* Left toolbar */}
      <Toolbar
        activeTool={tool}
        brushSize={brushSize}
        showGrid={showGrid}
        onSetTool={setTool}
        onSetBrush={setBrushSize}
        onToggleGrid={() => setShowGrid((p) => !p)}
        onResetFog={resetFog}
      />

      {/* Canvas area */}
      <div
        ref={wrapRef}
        className="relative flex-1 overflow-hidden"
        style={{ background: '#040308', cursor: 'crosshair' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleCanvasDrop}
      >
        <canvas ref={mapCanvasRef} className="absolute inset-0" style={{ zIndex: 1, imageRendering: 'pixelated' }} />
        <canvas ref={boxesCanvasRef} className="absolute inset-0" style={{ zIndex: 2, imageRendering: 'pixelated' }} />
        <canvas ref={fogGMCanvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 3, imageRendering: 'pixelated' }} />
        <canvas ref={fogCanvasRef} className="absolute inset-0" style={{ zIndex: 4, imageRendering: 'pixelated' }} />
        <canvas ref={topCanvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5, imageRendering: 'pixelated' }} />
        <canvas
          ref={interCanvasRef}
          className="absolute inset-0"
          style={{ zIndex: 6, imageRendering: 'pixelated' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          onContextMenu={handleContextMenu}
        />

        {/* Measure info overlay */}
        {measureInfo && (
          <div
            className="pointer-events-none fixed left-1/2 top-[44px] z-[500] -translate-x-1/2 rounded-[3px] px-3 py-[3px] tracking-[0.07em]"
            style={{
              background: 'rgba(7,6,12,0.95)',
              border: '1px solid var(--gold)',
              fontFamily: "'Cinzel', serif",
              fontSize: '0.65rem',
              color: 'var(--gold-l)',
            }}
          >
            {measureInfo}
          </div>
        )}

        {/* Notification toast */}
        {notification && (
          <div
            className="pointer-events-none fixed bottom-[14px] left-1/2 z-[9999] -translate-x-1/2 whitespace-nowrap rounded-[3px] px-[14px] py-[5px] tracking-[0.07em]"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--gold)',
              fontFamily: "'Cinzel', serif",
              fontSize: '0.65rem',
              color: 'var(--gold)',
            }}
          >
            {notification}
          </div>
        )}
      </div>

      {/* Right panel */}
      <RightPanel
        boxes={boxes}
        tokens={tokens}
        selectedBoxId={selectedBoxId}
        onMapUpload={handleMapUpload}
        onBoxClick={handleBoxClick}
        onRevealAll={handleRevealAll}
        onClearBoxes={handleClearBoxes}
        onQueueToken={handleQueueToken}
        onClearTokens={handleClearTokens}
      />

      {/* Modals & Overlays */}
      <BoxEditor
        box={editBox}
        onSave={handleBoxSave}
        onDelete={handleBoxDelete}
        onClose={() => setEditBox(null)}
      />
      <SettingsModal
        open={settingsOpen}
        gmFogOpacity={gmFogOpacity}
        gridSize={gridSize}
        showBoxesGM={showBoxesGM}
        showBoxesPlayer={showBoxesPlayer}
        prepMessage={prepMessage}
        sessionName={sessionName}
        onChangeGmFogOpacity={handleSettingsChangeOpacity}
        onChangeGridSize={handleSettingsChangeGridSize}
        onChangeShowBoxesGM={setShowBoxesGM}
        onChangeShowBoxesPlayer={setShowBoxesPlayer}
        onChangePrepMessage={setPrepMessage}
        onChangeSessionName={setSessionName}
        onClose={() => setSettingsOpen(false)}
      />
      <ContextMenu
        state={contextMenu}
        onAction={handleContextAction}
        onClose={() => setContextMenu((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
