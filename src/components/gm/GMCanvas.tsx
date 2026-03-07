'use client';

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Session, Box, Token, BoxType, SessionExport, MapObject, CameraViewport } from '@/types';
import {
  MAP_W,
  MAP_H,
  createFogCanvas,
  paintReveal,
  paintHide,
  revealBox as revealBoxFog,
  fogToBase64,
} from '@/lib/fog-engine';
import {
  screenToMap,
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

// ── Types ──

type ToolName = 'reveal' | 'hide' | 'box' | 'select' | 'token' | 'torch' | 'ping' | 'measure' | 'camera';

interface Ping { x: number; y: number; born: number }
interface Torch { x: number; y: number; r: number; id: number }
interface PendingToken { emoji: string; color: string }
interface MeasureState { sx: number; sy: number; mx: number; my: number }

const BOX_COLORS = ['#c8963e', '#e05c2a', '#6a4fc8', '#2a8a4a', '#c8300a', '#2a6a9a', '#888'];
const TYPE_COLORS: Record<string, string> = {
  autoReveal: '#c8963e', trigger: '#a080e0', hazard: '#e05c2a', note: '#5aba6a', hidden: '#555',
};
const MAX_UNDO = 20;
const POLYGON_SNAP_DISTANCE = 15; // px — how close to first vertex to close a polygon
const MIN_OBJECT_SIZE = 20; // px — minimum object width/height when resizing
const TOOL_HINTS: Partial<Record<ToolName, string>> = {
  box: 'Click to place polygon vertices, click near first to close',
  select: 'Click a box or token to select/edit — drag tokens to move',
  measure: 'Drag to measure distance in feet & squares',
  torch: 'Click to place a flickering torch',
  ping: 'Click to ping a location on player display',
  token: 'Click on map to place token',
  camera: 'Drag to set camera viewport for player display',
};

// ── Helpers ──

function hexAlpha(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function snap(v: number, gridSize: number) {
  return Math.round(v / gridSize) * gridSize;
}

// ── Component ──

type CameraInteraction = 'idle' | 'dragging' | 'resizing-tl' | 'resizing-tr' | 'resizing-bl' | 'resizing-br' | 'drawing';
type ResizeCorner = 'resizing-tl' | 'resizing-tr' | 'resizing-bl' | 'resizing-br';
const MIN_CAMERA_SIZE = 30;

export default function GMCanvas({ session, slug }: { session: Session; slug: string }) {
  // Canvas refs
  const canvasMapRef = useRef<HTMLCanvasElement>(null);
  const canvasBoxesRef = useRef<HTMLCanvasElement>(null);
  const canvasFogGMRef = useRef<HTMLCanvasElement>(null);
  const canvasTopRef = useRef<HTMLCanvasElement>(null);
  const canvasInterRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Offscreen fog canvas
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // State
  const [tool, setToolState] = useState<ToolName>('reveal');
  const [brushRadius, setBrushRadius] = useState(36);
  const [showGrid, setShowGrid] = useState(false);
  const [gmFogOpacity, setGmFogOpacity] = useState(session.gm_fog_opacity);
  const [gridSize, setGridSize] = useState(session.grid_size || 32);
  const [prepMessage, setPrepMessage] = useState(session.prep_message || 'Preparing next scene…');
  const [sessionName, setSessionName] = useState(session.name);
  const [boxes, setBoxes] = useState<Box[]>(session.boxes || []);
  const [tokens, setTokens] = useState<Token[]>(session.tokens || []);
  const [objects, setObjects] = useState<MapObject[]>(session.objects || []);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [editingBox, setEditingBox] = useState<Box | null>(null);
  const [boxEditorOpen, setBoxEditorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notification, setNotification] = useState('');
  const [hint, setHint] = useState('');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [measureInfo, setMeasureInfo] = useState<string | null>(null);
  const [blackoutActive, setBlackoutActive] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false, x: 0, y: 0, mapX: 0, mapY: 0, box: null, token: null,
  });
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridMenuOpen, setGridMenuOpen] = useState<{ x: number; y: number } | null>(null);
  const [drawGridMode, setDrawGridMode] = useState(false);

  // Mutable refs for interaction state
  const vpRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const customMapRef = useRef<HTMLImageElement | null>(null);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const spaceHeldRef = useRef(false);
  const paintingRef = useRef(false);
  const paintUndoPushedRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const polyPointsRef = useRef<{ x: number; y: number }[]>([]);
  const measureStartRef = useRef<MeasureState | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0, mx: 0, my: 0 });
  const dragTokenRef = useRef<Token | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const pendingTokenRef = useRef<PendingToken | null>(null);
  const undoStackRef = useRef<HTMLCanvasElement[]>([]);
  const pingsRef = useRef<Ping[]>([]);
  const torchesRef = useRef<Torch[]>([]);
  const topLoopRef = useRef(false);
  const boxNumRef = useRef(1);
  const fogThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fogSnapshotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toolRef = useRef<ToolName>('reveal');
  const boxesRef = useRef<Box[]>(session.boxes || []);
  const tokensRef = useRef<Token[]>(session.tokens || []);
  const objectsRef = useRef<MapObject[]>(session.objects || []);
  const objectImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const gridSizeRef = useRef(session.grid_size || 32);
  const gmFogOpacityRef = useRef(session.gm_fog_opacity);
  const brushRadiusRef = useRef(36);
  const showGridRef = useRef(false);
  const lastPaintPosRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<CameraViewport>({ x: 0, y: 0, w: MAP_W, h: MAP_H });
  const cameraDragRef = useRef<{ startX: number; startY: number } | null>(null);
  const cameraModeRef = useRef<CameraInteraction>('idle');
  const cameraGrabOffsetRef = useRef({ x: 0, y: 0 });
  const blackoutActiveRef = useRef(false);
  const selectedObjectIdRef = useRef<string | null>(null);
  const objectDragRef = useRef<{ objId: string; offsetX: number; offsetY: number } | null>(null);
  const objectResizeRef = useRef<{ objId: string; corner: string; startX: number; startY: number; origObj: MapObject } | null>(null);
  const snapToGridRef = useRef(false);
  const gridDrawStartRef = useRef<{ x: number; y: number } | null>(null);

  // Keep refs in sync
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { boxesRef.current = boxes; }, [boxes]);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);
  useEffect(() => { objectsRef.current = objects; }, [objects]);
  useEffect(() => { gridSizeRef.current = gridSize; }, [gridSize]);
  useEffect(() => { gmFogOpacityRef.current = gmFogOpacity; }, [gmFogOpacity]);
  useEffect(() => { brushRadiusRef.current = brushRadius; }, [brushRadius]);
  useEffect(() => { showGridRef.current = showGrid; }, [showGrid]);
  useEffect(() => { blackoutActiveRef.current = blackoutActive; }, [blackoutActive]);
  useEffect(() => { selectedObjectIdRef.current = selectedObjectId; }, [selectedObjectId]);
  useEffect(() => { snapToGridRef.current = snapToGrid; }, [snapToGrid]);

  // ── Notification ──
  const notifTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showNotif = useCallback((msg: string) => {
    setNotification(msg);
    clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotification(''), 2600);
  }, []);

  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showHint = useCallback((msg: string) => {
    setHint(msg);
    clearTimeout(hintTimer.current);
    if (msg) hintTimer.current = setTimeout(() => setHint(''), 5000);
  }, []);

  // ── API helpers ──

  const fogStrokeBatchRef = useRef<Array<{ x: number; y: number; radius: number; mode: string }>>([]);

  const sendFogPaint = useCallback(
    (x: number, y: number, radius: number, mode: 'reveal' | 'hide') => {
      fogStrokeBatchRef.current.push({ x, y, radius, mode });
      if (fogThrottleRef.current) return;
      fogThrottleRef.current = setTimeout(() => {
        fogThrottleRef.current = null;
        const strokes = fogStrokeBatchRef.current.splice(0);
        if (strokes.length === 0) return;
        fetch(`/api/sessions/${slug}/fog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strokes }),
        }).catch(() => {});
      }, 50);
    },
    [slug],
  );

  const sendFogSnapshot = useCallback(async () => {
    const fc = fogCanvasRef.current;
    if (!fc) return;
    const png = await fogToBase64(fc);
    fetch(`/api/sessions/${slug}/fog`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ png }),
    }).catch(() => {});
  }, [slug]);

  const apiBoxCreate = useCallback(
    (box: Box) => {
      fetch(`/api/sessions/${slug}/boxes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(box),
      }).catch(() => {});
    },
    [slug],
  );

  const apiBoxUpdate = useCallback(
    (box: Box) => {
      fetch(`/api/sessions/${slug}/boxes/${box.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(box),
      }).catch(() => {});
    },
    [slug],
  );

  const apiBoxDelete = useCallback(
    (id: string) => {
      fetch(`/api/sessions/${slug}/boxes/${id}`, { method: 'DELETE' }).catch(() => {});
    },
    [slug],
  );

  const apiTokenCreate = useCallback(
    (token: Token) => {
      fetch(`/api/sessions/${slug}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token),
      }).catch(() => {});
    },
    [slug],
  );

  const apiTokenMove = useCallback(
    (token: Token) => {
      fetch(`/api/sessions/${slug}/tokens/${token.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: token.x, y: token.y }),
      }).catch(() => {});
    },
    [slug],
  );

  const apiTokenDelete = useCallback(
    (id: string) => {
      fetch(`/api/sessions/${slug}/tokens/${id}`, { method: 'DELETE' }).catch(() => {});
    },
    [slug],
  );

  const apiPing = useCallback(
    (x: number, y: number) => {
      fetch(`/api/sessions/${slug}/fog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ping: { x, y } }),
      }).catch(() => {});
    },
    [slug],
  );

  const broadcastCamera = useCallback(
    (cam: CameraViewport) => {
      fetch(`/api/sessions/${slug}/fog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera: cam }),
      }).catch(() => {});
    },
    [slug],
  );

  const broadcastBlackout = useCallback(
    (active: boolean, message?: string) => {
      fetch(`/api/sessions/${slug}/fog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blackout: { active, message } }),
      }).catch(() => {});
    },
    [slug],
  );

  // ── Draw pipeline ──

  const drawMap = useCallback(() => {
    const canvas = canvasMapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    applyViewport(ctx, vpRef.current);
    if (customMapRef.current) {
      ctx.drawImage(customMapRef.current, 0, 0, MAP_W, MAP_H);
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
    if (showGridRef.current) drawGridLines(ctx, gridSizeRef.current, vpRef.current.scale);
    ctx.restore();
  }, []);

  const composeFogGM = useCallback(() => {
    const canvas = canvasFogGMRef.current;
    const fogCanvas = fogCanvasRef.current;
    if (!canvas || !fogCanvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    applyViewport(ctx, vpRef.current);
    ctx.globalAlpha = gmFogOpacityRef.current;
    ctx.drawImage(fogCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.restore();
  }, []);

  const redrawBoxes = useCallback(() => {
    const canvas = canvasBoxesRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    applyViewport(ctx, vpRef.current);
    boxesRef.current.forEach((b) => renderBox(ctx, b, vpRef.current.scale, selectedBoxId));
    ctx.restore();
  }, [selectedBoxId]);

  const drawTop = useCallback(() => {
    const canvas = canvasTopRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const vp = vpRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    applyViewport(ctx, vp);

    const now = Date.now();

    // Torches
    torchesRef.current.forEach((t) => {
      const fl = 0.9 + Math.sin(now * 0.003 + t.id) * 0.1;
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r * fl);
      g.addColorStop(0, 'rgba(255,180,60,.16)');
      g.addColorStop(0.5, 'rgba(255,90,15,.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * fl, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '18px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🕯️', t.x, t.y);
    });

    // Pings
    pingsRef.current = pingsRef.current.filter((p) => now - p.born < 2400);
    pingsRef.current.forEach((p) => {
      const age = now - p.born;
      const al = 1 - age / 2400;
      const r = 18 + (age / 2400) * 55;
      ctx.strokeStyle = `rgba(200,150,62,${al})`;
      ctx.lineWidth = 2 / vp.scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(200,150,62,${al * 0.35})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Tokens
    tokensRef.current.forEach((t) => {
      const r = 16;
      ctx.shadowColor = 'rgba(0,0,0,.7)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle =
        t === dragTokenRef.current
          ? 'rgba(255,220,80,.9)'
          : 'rgba(255,220,140,.4)';
      ctx.lineWidth = (t === dragTokenRef.current ? 2.5 : 1.5) / vp.scale;
      ctx.stroke();
      ctx.font = '13px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.emoji, t.x, t.y);
    });

    ctx.restore();

    // Screen-space overlays

    // Measurement
    const ms = measureStartRef.current;
    if (toolRef.current === 'measure' && ms) {
      const mp = mousePosRef.current;
      ctx.strokeStyle = 'rgba(200,150,62,.8)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(ms.sx, ms.sy);
      ctx.lineTo(mp.x, mp.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200,150,62,.9)';
      ctx.beginPath();
      ctx.arc(ms.sx, ms.sy, 4, 0, Math.PI * 2);
      ctx.fill();
      const dist = Math.sqrt((mp.x - ms.sx) ** 2 + (mp.y - ms.sy) ** 2) / vp.scale;
      const gs = gridSizeRef.current;
      const ft = Math.round((dist / gs) * 5);
      setMeasureInfo(`${ft} ft · ${Math.round(dist / gs)} sq`);
    } else {
      setMeasureInfo(null);
    }

    // Box draw preview (rectangle drag)
    const ds = drawStartRef.current;
    if (toolRef.current === 'box' && ds) {
      const mp = mousePosRef.current;
      ctx.save();
      applyViewport(ctx, vp);
      const gs = gridSizeRef.current;
      const bx = Math.min(ds.x, mp.mx);
      const by = Math.min(ds.y, mp.my);
      const bw = Math.abs(mp.mx - ds.x);
      const bh = Math.abs(mp.my - ds.y);
      const sx = snap(bx, gs), sy = snap(by, gs);
      const sw = Math.max(gs, snap(bw, gs)), sh = Math.max(gs, snap(bh, gs));
      ctx.strokeStyle = 'rgba(200,150,62,.75)';
      ctx.lineWidth = 2 / vp.scale;
      ctx.setLineDash([6 / vp.scale, 3 / vp.scale]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200,150,62,.05)';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.font = `${Math.min(sw, sh) * 0.09}px Cinzel,serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(200,150,62,.4)';
      ctx.fillText(`${~~(sw / gs)}×${~~(sh / gs)}sq`, sx + sw / 2, sy + sh / 2);
      ctx.restore();
    }

    // Polygon drawing preview
    const pts = polyPointsRef.current;
    if (toolRef.current === 'box' && pts.length > 0) {
      const mp = mousePosRef.current;
      const gs = gridSizeRef.current;
      ctx.save();
      applyViewport(ctx, vp);
      ctx.strokeStyle = 'rgba(200,150,62,.75)';
      ctx.lineWidth = 2 / vp.scale;
      ctx.setLineDash([6 / vp.scale, 3 / vp.scale]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Line from last point to cursor
      ctx.strokeStyle = 'rgba(200,150,62,.4)';
      ctx.lineWidth = 1.5 / vp.scale;
      ctx.setLineDash([4 / vp.scale, 3 / vp.scale]);
      ctx.beginPath();
      ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.lineTo(snap(mp.mx, gs), snap(mp.my, gs));
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw vertices
      pts.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? 'rgba(200,150,62,.9)' : 'rgba(200,150,62,.6)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / vp.scale, 0, Math.PI * 2);
        ctx.fill();
      });

      // Snap-close indicator when near first point
      if (pts.length >= 3) {
        const first = pts[0];
        const snapDist = Math.hypot(snap(mp.mx, gs) - first.x, snap(mp.my, gs) - first.y);
        if (snapDist < POLYGON_SNAP_DISTANCE) {
          ctx.strokeStyle = 'rgba(100,255,100,.6)';
          ctx.lineWidth = 2 / vp.scale;
          ctx.beginPath();
          ctx.arc(first.x, first.y, 8 / vp.scale, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    // Pending token ghost
    if (pendingTokenRef.current && toolRef.current === 'token') {
      const mp = mousePosRef.current;
      ctx.save();
      applyViewport(ctx, vp);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = pendingTokenRef.current.color;
      ctx.beginPath();
      ctx.arc(mp.mx, mp.my, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '13px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pendingTokenRef.current.emoji, mp.mx, mp.my);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Camera viewport rectangle
    const cam = cameraRef.current;
    if (cam && !(cam.x === 0 && cam.y === 0 && cam.w === MAP_W && cam.h === MAP_H)) {
      ctx.save();
      applyViewport(ctx, vp);
      // Dim outside camera
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fillRect(0, 0, MAP_W, cam.y); // top
      ctx.fillRect(0, cam.y + cam.h, MAP_W, MAP_H - cam.y - cam.h); // bottom
      ctx.fillRect(0, cam.y, cam.x, cam.h); // left
      ctx.fillRect(cam.x + cam.w, cam.y, MAP_W - cam.x - cam.w, cam.h); // right
      // Camera border – solid cyan line, distinct from room boxes
      ctx.strokeStyle = 'rgba(0,180,255,.8)';
      ctx.lineWidth = 2 / vp.scale;
      ctx.setLineDash([]);
      ctx.strokeRect(cam.x, cam.y, cam.w, cam.h);
      // Corner handles
      const hs = 6 / vp.scale;
      ctx.fillStyle = 'rgba(0,180,255,.9)';
      ctx.fillRect(cam.x - hs / 2, cam.y - hs / 2, hs, hs);
      ctx.fillRect(cam.x + cam.w - hs / 2, cam.y - hs / 2, hs, hs);
      ctx.fillRect(cam.x - hs / 2, cam.y + cam.h - hs / 2, hs, hs);
      ctx.fillRect(cam.x + cam.w - hs / 2, cam.y + cam.h - hs / 2, hs, hs);
      // Label badge
      const label = '📺 CAMERA';
      const fontSize = 12 / vp.scale;
      ctx.font = `bold ${fontSize}px Cinzel,serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const textW = ctx.measureText(label).width;
      const pad = 4 / vp.scale;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(cam.x, cam.y, textW + pad * 2, fontSize + pad * 2);
      ctx.fillStyle = 'rgba(0,200,255,.95)';
      ctx.fillText(label, cam.x + pad, cam.y + pad);
      ctx.restore();
    }

    // Selected object transform handles
    const selObjId = selectedObjectIdRef.current;
    if (selObjId) {
      const obj = objectsRef.current.find(o => o.id === selObjId);
      if (obj) {
        ctx.save();
        applyViewport(ctx, vp);
        ctx.strokeStyle = 'rgba(0,180,255,.8)';
        ctx.lineWidth = 2 / vp.scale;
        ctx.setLineDash([]);
        ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
        const hs = 8 / vp.scale;
        ctx.fillStyle = 'rgba(0,180,255,.9)';
        [[obj.x, obj.y], [obj.x + obj.w, obj.y], [obj.x, obj.y + obj.h], [obj.x + obj.w, obj.y + obj.h]].forEach(([cx, cy]) => {
          ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
        });
        const ms = 6 / vp.scale;
        [[obj.x + obj.w / 2, obj.y], [obj.x + obj.w / 2, obj.y + obj.h], [obj.x, obj.y + obj.h / 2], [obj.x + obj.w, obj.y + obj.h / 2]].forEach(([cx, cy]) => {
          ctx.fillRect(cx - ms / 2, cy - ms / 2, ms, ms);
        });
        ctx.restore();
      }
    }

    // Camera drag preview (drawing new camera)
    if (toolRef.current === 'camera' && cameraModeRef.current === 'drawing' && cameraDragRef.current) {
      const mp = mousePosRef.current;
      const ds = cameraDragRef.current;
      ctx.save();
      applyViewport(ctx, vp);
      const cx = Math.min(ds.startX, mp.mx);
      const cy = Math.min(ds.startY, mp.my);
      const cw = Math.abs(mp.mx - ds.startX);
      const ch = Math.abs(mp.my - ds.startY);
      ctx.strokeStyle = 'rgba(0,180,255,.8)';
      ctx.lineWidth = 2 / vp.scale;
      ctx.setLineDash([]);
      ctx.strokeRect(cx, cy, cw, ch);
      ctx.fillStyle = 'rgba(0,180,255,.05)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.restore();
    }

    // Animation loop
    const needs =
      torchesRef.current.length > 0 ||
      pingsRef.current.length > 0 ||
      (toolRef.current === 'box' && (drawStartRef.current || polyPointsRef.current.length > 0)) ||
      (toolRef.current === 'measure' && measureStartRef.current) ||
      (pendingTokenRef.current && toolRef.current === 'token') ||
      (toolRef.current === 'camera' && cameraDragRef.current);
    if (needs && !topLoopRef.current) {
      topLoopRef.current = true;
      requestAnimationFrame(() => {
        topLoopRef.current = false;
        drawTop();
      });
    }
  }, []);

  const redrawAll = useCallback(() => {
    drawMap();
    redrawBoxes();
    composeFogGM();
    drawTop();
  }, [drawMap, redrawBoxes, composeFogGM, drawTop]);

  // ── Fog operations ──

  const pushUndo = useCallback(() => {
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas) return;
    const snapC = document.createElement('canvas');
    snapC.width = MAP_W;
    snapC.height = MAP_H;
    snapC.getContext('2d')!.drawImage(fogCanvas, 0, 0);
    undoStackRef.current.push(snapC);
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
  }, []);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (!stack.length) {
      showNotif('Nothing to undo');
      return;
    }
    const snapC = stack.pop()!;
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas) return;
    const ctx = fogCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.drawImage(snapC, 0, 0);
    composeFogGM();
    showNotif('↩ Undone');
  }, [composeFogGM, showNotif]);

  const doRevealBox = useCallback(
    (box: Box) => {
      if (box.revealed) return;
      pushUndo();
      const fogCanvas = fogCanvasRef.current;
      if (!fogCanvas) return;
      const ctx = fogCanvas.getContext('2d')!;
      revealBoxFog(ctx, box);
      const updatedBoxes = boxesRef.current.map((b) =>
        b.id === box.id ? { ...b, revealed: true } : b,
      );
      boxesRef.current = updatedBoxes;
      setBoxes(updatedBoxes);
      composeFogGM();
      redrawBoxes();
      if (box.notes) {
        showNotif(`⚡ ${box.name}: ${box.notes.substring(0, 55)}${box.notes.length > 55 ? '…' : ''}`);
      } else {
        showNotif(`✦ ${box.name} revealed!`);
      }
      apiBoxUpdate({ ...box, revealed: true });
      sendFogSnapshot();
    },
    [pushUndo, composeFogGM, redrawBoxes, showNotif, apiBoxUpdate, sendFogSnapshot],
  );

  const doHideBox = useCallback(
    (box: Box) => {
      const fogCanvas = fogCanvasRef.current;
      if (!fogCanvas) return;
      const ctx = fogCanvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(8,7,16,.97)';
      ctx.fillRect(box.x, box.y, box.w, box.h);
      const updatedBoxes = boxesRef.current.map((b) =>
        b.id === box.id ? { ...b, revealed: false } : b,
      );
      boxesRef.current = updatedBoxes;
      setBoxes(updatedBoxes);
      composeFogGM();
      redrawBoxes();
      apiBoxUpdate({ ...box, revealed: false });
    },
    [composeFogGM, redrawBoxes, apiBoxUpdate],
  );

  const paintFog = useCallback(
    (mx: number, my: number, mode: 'reveal' | 'hide') => {
      const fogCanvas = fogCanvasRef.current;
      if (!fogCanvas) return;
      const ctx = fogCanvas.getContext('2d')!;
      const r = brushRadiusRef.current;

      if (mode === 'reveal') {
        // Box snap-reveal
        const autoBox = boxesRef.current.find(
          (b) =>
            b.type === 'autoReveal' &&
            !b.revealed &&
            mx >= b.x && mx <= b.x + b.w &&
            my >= b.y && my <= b.y + b.h,
        );
        if (autoBox) {
          doRevealBox(autoBox);
          return;
        }
        const trigBox = boxesRef.current.find(
          (b) =>
            b.type === 'trigger' &&
            !b.revealed &&
            mx >= b.x && mx <= b.x + b.w &&
            my >= b.y && my <= b.y + b.h,
        );
        if (trigBox) {
          doRevealBox(trigBox);
          return;
        }
        paintReveal(ctx, mx, my, r);
      } else {
        paintHide(ctx, mx, my, r);
      }
      composeFogGM();
      sendFogPaint(mx, my, r, mode);
    },
    [composeFogGM, sendFogPaint, doRevealBox],
  );

  const resetFog = useCallback(() => {
    pushUndo();
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas) return;
    const ctx = fogCanvas.getContext('2d')!;
    ctx.fillStyle = '#080710';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    const updatedBoxes = boxesRef.current.map((b) => ({ ...b, revealed: false }));
    boxesRef.current = updatedBoxes;
    setBoxes(updatedBoxes);
    composeFogGM();
    redrawBoxes();
    showNotif('Fog reset');
    sendFogSnapshot();
  }, [pushUndo, composeFogGM, redrawBoxes, showNotif, sendFogSnapshot]);

  // ── Tool switching ──

  const setTool = useCallback(
    (t: ToolName) => {
      setToolState(t);
      toolRef.current = t;
      showHint(TOOL_HINTS[t] || '');
      if (t !== 'token') pendingTokenRef.current = null;
      drawTop();
    },
    [showHint, drawTop],
  );

  // ── Token placement ──

  const placeToken = useCallback(
    (mx: number, my: number) => {
      const pt = pendingTokenRef.current;
      if (!pt) return;
      const newToken: Token = {
        id: uuidv4(),
        session_id: session.id,
        emoji: pt.emoji,
        color: pt.color,
        x: mx,
        y: my,
        label: pt.emoji,
      };
      const updated = [...tokensRef.current, newToken];
      tokensRef.current = updated;
      setTokens(updated);
      pendingTokenRef.current = null;
      setTool('reveal');
      drawTop();
      apiTokenCreate(newToken);
    },
    [session.id, setTool, drawTop, apiTokenCreate],
  );

  const addPing = useCallback(
    (mx: number, my: number) => {
      pingsRef.current.push({ x: mx, y: my, born: Date.now() });
      drawTop();
      showNotif('📍 Ping!');
      apiPing(mx, my);
    },
    [drawTop, showNotif, apiPing],
  );

  const addTorch = useCallback(
    (mx: number, my: number) => {
      torchesRef.current.push({ x: mx, y: my, r: 110, id: Date.now() });
      drawTop();
      showNotif('🕯 Torch placed');
    },
    [drawTop, showNotif],
  );

  // ── Box finalization ──

  const finalizeBox = useCallback(
    (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const gs = gridSizeRef.current;
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      if (w < MIN_OBJECT_SIZE || h < MIN_OBJECT_SIZE) {
        showNotif('Too small');
        return;
      }
      const sx = snap(x, gs), sy = snap(y, gs);
      const sw = Math.max(gs, snap(w, gs)), sh = Math.max(gs, snap(h, gs));
      const newBox: Box = {
        id: uuidv4(),
        session_id: session.id,
        x: sx, y: sy, w: sw, h: sh,
        name: `Room ${boxNumRef.current++}`,
        type: 'autoReveal',
        color: BOX_COLORS[boxesRef.current.length % BOX_COLORS.length],
        notes: '',
        revealed: false,
        sort_order: boxesRef.current.length,
      };
      const updated = [...boxesRef.current, newBox];
      boxesRef.current = updated;
      setBoxes(updated);
      redrawBoxes();
      setEditingBox(newBox);
      setBoxEditorOpen(true);
      apiBoxCreate(newBox);
    },
    [session.id, showNotif, redrawBoxes, apiBoxCreate],
  );

  const finalizePolygon = useCallback(
    (pts: { x: number; y: number }[]) => {
      if (pts.length < 3) { showNotif('Need at least 3 points'); return; }
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const maxX = Math.max(...xs), maxY = Math.max(...ys);
      const w = maxX - minX, h = maxY - minY;
      if (w < 10 || h < 10) { showNotif('Too small'); return; }
      const newBox: Box = {
        id: uuidv4(),
        session_id: session.id,
        x: minX, y: minY, w, h,
        name: `Room ${boxNumRef.current++}`,
        type: 'autoReveal',
        color: BOX_COLORS[boxesRef.current.length % BOX_COLORS.length],
        notes: '',
        revealed: false,
        sort_order: boxesRef.current.length,
        points: pts,
      };
      const updated = [...boxesRef.current, newBox];
      boxesRef.current = updated;
      setBoxes(updated);
      redrawBoxes();
      setEditingBox(newBox);
      setBoxEditorOpen(true);
      apiBoxCreate(newBox);
    },
    [session.id, showNotif, redrawBoxes, apiBoxCreate],
  );

  const clickSelect = useCallback(
    (mx: number, my: number) => {
      const tok = tokensRef.current.slice().reverse().find((t) => Math.hypot(t.x - mx, t.y - my) < 18);
      if (tok) return;
      const box = boxesRef.current.find(
        (b) => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h,
      );
      setSelectedBoxId(box?.id || null);
      if (box) {
        setEditingBox(box);
        setBoxEditorOpen(true);
      }
    },
    [],
  );

  // ── Resize ──

  const resize = useCallback(() => {
    const w = wrapRef.current;
    if (!w) return;
    const W = w.offsetWidth, H = w.offsetHeight;
    [canvasMapRef, canvasBoxesRef, canvasFogGMRef, canvasTopRef, canvasInterRef].forEach((ref) => {
      if (ref.current) {
        ref.current.width = W;
        ref.current.height = H;
      }
    });
    redrawAll();
  }, [redrawAll]);

  // ── Init ──

  useEffect(() => {
    fogCanvasRef.current = createFogCanvas();

    // Load existing fog if available
    if (session.map_url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        customMapRef.current = img;
        drawMap();
      };
      img.src = session.map_url;
    }

    const w = wrapRef.current;
    if (w) {
      vpRef.current = fitToContainer(MAP_W, MAP_H, w.offsetWidth, w.offsetHeight);
      setZoomPercent(Math.round(vpRef.current.scale * 100));
    }

    resize();

    const onResize = () => setTimeout(resize, 60);
    window.addEventListener('resize', onResize);

    // Periodic fog snapshot (every 10s)
    fogSnapshotTimerRef.current = setInterval(sendFogSnapshot, 10000);

    showNotif('✦ Space+drag to pan · Scroll to zoom · Right-click for menu');

    return () => {
      window.removeEventListener('resize', onResize);
      if (fogSnapshotTimerRef.current) clearInterval(fogSnapshotTimerRef.current);
      sendFogSnapshot();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw boxes layer when boxes state changes
  useEffect(() => { redrawBoxes(); }, [boxes, selectedBoxId, redrawBoxes]);
  // Redraw fog when opacity changes
  useEffect(() => { composeFogGM(); }, [gmFogOpacity, composeFogGM]);
  // Redraw map when grid toggles or gridSize changes
  useEffect(() => { drawMap(); }, [showGrid, gridSize, drawMap]);

  // ── Keyboard ──

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (e.code === 'Space' && !e.repeat && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        spaceHeldRef.current = true;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const keyMap: Record<string, ToolName> = {
        r: 'reveal', h: 'hide', b: 'box', s: 'select', t: 'token', p: 'ping', m: 'measure', c: 'camera',
      };
      const brushKeys: Record<string, number> = { '1': 15, '2': 36, '3': 70, '4': 130 };
      const k = e.key.toLowerCase();
      if (k === 'g') {
        setShowGrid((v) => { showGridRef.current = !v; return !v; });
      } else if (k === 'x') {
        const next = !blackoutActiveRef.current;
        setBlackoutActive(next);
        blackoutActiveRef.current = next;
        broadcastBlackout(next, prepMessage);
        showNotif(next ? '⬛ Blackout ON' : '▶ Blackout OFF');
      } else if (keyMap[k]) {
        setTool(keyMap[k]);
      }
      if (brushKeys[e.key]) {
        setBrushRadius(brushKeys[e.key]);
        brushRadiusRef.current = brushKeys[e.key];
      }
      if (e.key === 'Escape') {
        polyPointsRef.current = [];
        pendingTokenRef.current = null;
        setContextMenu((prev) => ({ ...prev, open: false }));
        setBoxEditorOpen(false);
        setSettingsOpen(false);
      }
      if (e.key === '+' || e.key === '=') {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const cx = wrap.offsetWidth / 2, cy = wrap.offsetHeight / 2;
        vpRef.current = zoomAt(vpRef.current, cx, cy, 1.15);
        setZoomPercent(Math.round(vpRef.current.scale * 100));
        redrawAll();
      }
      if (e.key === '-') {
        const wrap = wrapRef.current;
        if (!wrap) return;
        const cx = wrap.offsetWidth / 2, cy = wrap.offsetHeight / 2;
        vpRef.current = zoomAt(vpRef.current, cx, cy, 0.87);
        setZoomPercent(Math.round(vpRef.current.scale * 100));
        redrawAll();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeldRef.current = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [undo, setTool, redrawAll, broadcastBlackout, prepMessage, showNotif]);

  // ── Mouse handlers ──

  const getCanvasPos = useCallback((e: ReactMouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { sx: 0, sy: 0 };
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      // Middle click or space+left → pan
      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
        panningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panOriginRef.current = { x: vpRef.current.x, y: vpRef.current.y };
        return;
      }
      if (e.button === 2) return;

      const { sx, sy } = getCanvasPos(e);
      const mp = screenToMap(sx, sy, vpRef.current);

      // Draw Grid Size mode
      if (drawGridMode) {
        gridDrawStartRef.current = { x: mp.x, y: mp.y };
        return;
      }

      // Camera tool – drag, resize, or draw new
      if (toolRef.current === 'camera') {
        const cam = cameraRef.current;
        const hitRadius = 12 / vpRef.current.scale;
        const isCustomCam = cam && !(cam.x === 0 && cam.y === 0 && cam.w === MAP_W && cam.h === MAP_H);

        if (isCustomCam) {
          // Check corner handles for resize
          const corners: Array<{ cx: number; cy: number; mode: ResizeCorner }> = [
            { cx: cam.x, cy: cam.y, mode: 'resizing-tl' },
            { cx: cam.x + cam.w, cy: cam.y, mode: 'resizing-tr' },
            { cx: cam.x, cy: cam.y + cam.h, mode: 'resizing-bl' },
            { cx: cam.x + cam.w, cy: cam.y + cam.h, mode: 'resizing-br' },
          ];
          let hitCorner = false;
          for (const c of corners) {
            if (Math.abs(mp.x - c.cx) < hitRadius && Math.abs(mp.y - c.cy) < hitRadius) {
              cameraModeRef.current = c.mode;
              cameraGrabOffsetRef.current = { x: mp.x - c.cx, y: mp.y - c.cy };
              hitCorner = true;
              break;
            }
          }
          if (!hitCorner && mp.x >= cam.x && mp.x <= cam.x + cam.w && mp.y >= cam.y && mp.y <= cam.y + cam.h) {
            // Click inside camera → drag
            cameraModeRef.current = 'dragging';
            cameraGrabOffsetRef.current = { x: mp.x - cam.x, y: mp.y - cam.y };
          } else if (!hitCorner) {
            // Click outside camera → draw new
            cameraModeRef.current = 'drawing';
            cameraDragRef.current = { startX: mp.x, startY: mp.y };
          }
        } else {
          // No custom camera yet → draw new
          cameraModeRef.current = 'drawing';
          cameraDragRef.current = { startX: mp.x, startY: mp.y };
        }
        drawTop();
        return;
      }

      // Token placement
      if (toolRef.current === 'token' && pendingTokenRef.current) {
        placeToken(mp.x, mp.y);
        return;
      }

      // Object selection, drag, and resize
      if (toolRef.current === 'select') {
        const selObj = selectedObjectIdRef.current ? objectsRef.current.find(o => o.id === selectedObjectIdRef.current) : null;
        if (selObj) {
          const hs = 12 / vpRef.current.scale;
          const corners = [
            { corner: 'tl', x: selObj.x, y: selObj.y },
            { corner: 'tr', x: selObj.x + selObj.w, y: selObj.y },
            { corner: 'bl', x: selObj.x, y: selObj.y + selObj.h },
            { corner: 'br', x: selObj.x + selObj.w, y: selObj.y + selObj.h },
          ];
          const hitCorner = corners.find(c => Math.abs(mp.x - c.x) < hs && Math.abs(mp.y - c.y) < hs);
          if (hitCorner) {
            objectResizeRef.current = { objId: selObj.id, corner: hitCorner.corner, startX: mp.x, startY: mp.y, origObj: { ...selObj } };
            return;
          }
          if (mp.x >= selObj.x && mp.x <= selObj.x + selObj.w && mp.y >= selObj.y && mp.y <= selObj.y + selObj.h && !selObj.locked) {
            objectDragRef.current = { objId: selObj.id, offsetX: mp.x - selObj.x, offsetY: mp.y - selObj.y };
            return;
          }
        }
        const clickedObj = [...objectsRef.current].sort((a, b) => b.zIndex - a.zIndex).find(o =>
          o.visible && mp.x >= o.x && mp.x <= o.x + o.w && mp.y >= o.y && mp.y <= o.y + o.h
        );
        if (clickedObj) {
          setSelectedObjectId(clickedObj.id);
          drawTop();
          return;
        }
        setSelectedObjectId(null);
      }

      // Token drag
      if (toolRef.current === 'select' || toolRef.current === 'token') {
        const tok = tokensRef.current.slice().reverse().find((t) => Math.hypot(t.x - mp.x, t.y - mp.y) < 18);
        if (tok) {
          dragTokenRef.current = tok;
          dragOffsetRef.current = { x: mp.x - tok.x, y: mp.y - tok.y };
          return;
        }
      }

      if (toolRef.current === 'box') {
        const gs = gridSizeRef.current;
        const sx2 = snap(mp.x, gs), sy2 = snap(mp.y, gs);
        const polyPts = polyPointsRef.current;

        // Check if closing the polygon (click near first point)
        if (polyPts.length >= 3) {
          const first = polyPts[0];
          if (Math.hypot(sx2 - first.x, sy2 - first.y) < POLYGON_SNAP_DISTANCE) {
            finalizePolygon(polyPts);
            polyPointsRef.current = [];
            drawTop();
            return;
          }
        }

        polyPts.push({ x: sx2, y: sy2 });
        drawTop();
        return;
      }
      if (toolRef.current === 'measure') {
        measureStartRef.current = { sx, sy, mx: mp.x, my: mp.y };
        return;
      }
      if (toolRef.current === 'ping') {
        addPing(mp.x, mp.y);
        setTool('reveal');
        return;
      }
      if (toolRef.current === 'torch') {
        addTorch(mp.x, mp.y);
        return;
      }
      if (toolRef.current === 'select') {
        clickSelect(mp.x, mp.y);
        return;
      }
      if (toolRef.current === 'reveal' || toolRef.current === 'hide') {
        if (!paintUndoPushedRef.current) {
          pushUndo();
          paintUndoPushedRef.current = true;
        }
        paintingRef.current = true;
        lastPaintPosRef.current = { x: mp.x, y: mp.y };
        paintFog(mp.x, mp.y, toolRef.current);
      }
    },
    [getCanvasPos, placeToken, addPing, addTorch, setTool, clickSelect, pushUndo, paintFog, drawTop, drawGridMode, finalizePolygon],
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      const { sx, sy } = getCanvasPos(e);
      const mp = screenToMap(sx, sy, vpRef.current);
      mousePosRef.current = { x: sx, y: sy, mx: mp.x, my: mp.y };

      if (panningRef.current) {
        vpRef.current = {
          ...vpRef.current,
          x: panOriginRef.current.x + (e.clientX - panStartRef.current.x),
          y: panOriginRef.current.y + (e.clientY - panStartRef.current.y),
        };
        redrawAll();
        return;
      }

      if (objectDragRef.current) {
        const drag = objectDragRef.current;
        const obj = objectsRef.current.find(o => o.id === drag.objId);
        if (obj) {
          let newX = mp.x - drag.offsetX;
          let newY = mp.y - drag.offsetY;
          if (snapToGridRef.current) {
            const gs = gridSizeRef.current;
            const objCenterX = newX + obj.w / 2;
            const objCenterY = newY + obj.h / 2;
            newX = snap(objCenterX, gs) - obj.w / 2;
            newY = snap(objCenterY, gs) - obj.h / 2;
          }
          const updated = objectsRef.current.map(o =>
            o.id === drag.objId ? { ...o, x: newX, y: newY } : o
          );
          objectsRef.current = updated;
          setObjects(updated);
          drawMap();
          drawTop();
        }
        return;
      }
      if (objectResizeRef.current) {
        const r = objectResizeRef.current;
        const orig = r.origObj;
        let nx = orig.x, ny = orig.y, nw = orig.w, nh = orig.h;
        const dx = mp.x - r.startX, dy = mp.y - r.startY;
        if (r.corner.includes('r')) { nw = Math.max(MIN_OBJECT_SIZE, orig.w + dx); }
        if (r.corner.includes('l')) { nx = orig.x + dx; nw = Math.max(MIN_OBJECT_SIZE, orig.w - dx); }
        if (r.corner.includes('b')) { nh = Math.max(MIN_OBJECT_SIZE, orig.h + dy); }
        if (r.corner.includes('t')) { ny = orig.y + dy; nh = Math.max(MIN_OBJECT_SIZE, orig.h - dy); }
        const updated = objectsRef.current.map(o =>
          o.id === r.objId ? { ...o, x: nx, y: ny, w: nw, h: nh } : o
        );
        objectsRef.current = updated;
        setObjects(updated);
        drawMap();
        drawTop();
        return;
      }

      if (dragTokenRef.current) {
        dragTokenRef.current.x = mp.x - dragOffsetRef.current.x;
        dragTokenRef.current.y = mp.y - dragOffsetRef.current.y;
        drawTop();
        return;
      }

      if (paintingRef.current && (toolRef.current === 'reveal' || toolRef.current === 'hide')) {
        // Interpolate between last position and current position
        const lastPos = lastPaintPosRef.current;
        if (lastPos) {
          const dx = mp.x - lastPos.x;
          const dy = mp.y - lastPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const INTERPOLATION_STEP_FACTOR = 0.3; // fraction of brush radius used as step distance
          const step = brushRadiusRef.current * INTERPOLATION_STEP_FACTOR;
          if (dist > step) {
            const steps = Math.ceil(dist / step);
            for (let i = 1; i <= steps; i++) {
              const t = i / steps;
              const ix = lastPos.x + dx * t;
              const iy = lastPos.y + dy * t;
              paintFog(ix, iy, toolRef.current);
            }
          } else {
            paintFog(mp.x, mp.y, toolRef.current);
          }
        } else {
          paintFog(mp.x, mp.y, toolRef.current);
        }
        lastPaintPosRef.current = { x: mp.x, y: mp.y };
        return;
      }

      if (toolRef.current === 'camera' && cameraModeRef.current !== 'idle') {
        const cam = cameraRef.current;
        if (cameraModeRef.current === 'dragging' && cam) {
          cam.x = mp.x - cameraGrabOffsetRef.current.x;
          cam.y = mp.y - cameraGrabOffsetRef.current.y;
        } else if (cameraModeRef.current.startsWith('resizing') && cam) {
          const mode = cameraModeRef.current;
          if (mode === 'resizing-tl') {
            const right = cam.x + cam.w;
            const bottom = cam.y + cam.h;
            cam.x = Math.min(mp.x, right - MIN_CAMERA_SIZE);
            cam.y = Math.min(mp.y, bottom - MIN_CAMERA_SIZE);
            cam.w = right - cam.x;
            cam.h = bottom - cam.y;
          } else if (mode === 'resizing-tr') {
            const bottom = cam.y + cam.h;
            cam.w = Math.max(MIN_CAMERA_SIZE, mp.x - cam.x);
            cam.y = Math.min(mp.y, bottom - MIN_CAMERA_SIZE);
            cam.h = bottom - cam.y;
          } else if (mode === 'resizing-bl') {
            const right = cam.x + cam.w;
            cam.x = Math.min(mp.x, right - MIN_CAMERA_SIZE);
            cam.w = right - cam.x;
            cam.h = Math.max(MIN_CAMERA_SIZE, mp.y - cam.y);
          } else if (mode === 'resizing-br') {
            cam.w = Math.max(MIN_CAMERA_SIZE, mp.x - cam.x);
            cam.h = Math.max(MIN_CAMERA_SIZE, mp.y - cam.y);
          }
        }
        // 'drawing' mode uses cameraDragRef preview in drawTop
        drawTop();
        return;
      }

      if (['box', 'measure', 'select', 'token'].includes(toolRef.current)) {
        drawTop();
      }
    },
    [getCanvasPos, redrawAll, drawTop, drawMap, paintFog],
  );

  const handleMouseUp = useCallback(
    (e: ReactMouseEvent) => {
      if (panningRef.current) {
        panningRef.current = false;
        return;
      }
      if (objectDragRef.current) {
        objectDragRef.current = null;
        fetch(`/api/sessions/${slug}/fog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objects: objectsRef.current }),
        }).catch(() => {});
        return;
      }
      if (objectResizeRef.current) {
        objectResizeRef.current = null;
        fetch(`/api/sessions/${slug}/fog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objects: objectsRef.current }),
        }).catch(() => {});
        return;
      }
      if (dragTokenRef.current) {
        const tok = dragTokenRef.current;
        dragTokenRef.current = null;
        drawTop();
        apiTokenMove(tok);
        return;
      }
      const { sx, sy } = getCanvasPos(e);
      const mp = screenToMap(sx, sy, vpRef.current);

      // Draw Grid Size finalization
      if (drawGridMode && gridDrawStartRef.current) {
        const w = Math.abs(mp.x - gridDrawStartRef.current.x);
        const h = Math.abs(mp.y - gridDrawStartRef.current.y);
        const newSize = Math.round(Math.max(w, h));
        if (newSize > 5) {
          setGridSize(newSize);
          gridSizeRef.current = newSize;
          showNotif(`Grid size set to ${newSize}px`);
        }
        gridDrawStartRef.current = null;
        setDrawGridMode(false);
        drawTop();
        return;
      }

      // Camera tool: finalize camera operation
      if (toolRef.current === 'camera' && cameraModeRef.current !== 'idle') {
        const mode = cameraModeRef.current;
        if (mode === 'drawing' && cameraDragRef.current) {
          const ds = cameraDragRef.current;
          const cx = Math.min(ds.startX, mp.x);
          const cy = Math.min(ds.startY, mp.y);
          const cw = Math.abs(mp.x - ds.startX);
          const ch = Math.abs(mp.y - ds.startY);
          cameraDragRef.current = null;
          if (cw > MIN_CAMERA_SIZE && ch > MIN_CAMERA_SIZE) {
            const cam: CameraViewport = { x: cx, y: cy, w: cw, h: ch };
            cameraRef.current = cam;
            broadcastCamera(cam);
            showNotif('📺 Camera viewport set');
          }
        } else if (mode === 'dragging' || mode.startsWith('resizing')) {
          const cam = cameraRef.current;
          if (cam) {
            broadcastCamera(cam);
            showNotif(mode === 'dragging' ? '📺 Camera moved' : '📺 Camera resized');
          }
        }
        cameraModeRef.current = 'idle';
        drawTop();
        return;
      }

      if (toolRef.current === 'measure') {
        measureStartRef.current = null;
        drawTop();
      }
      if (paintingRef.current) {
        paintingRef.current = false;
        paintUndoPushedRef.current = false;
        lastPaintPosRef.current = null;
        sendFogSnapshot();
      }
    },
    [getCanvasPos, drawTop, drawMap, drawGridMode, apiTokenMove, sendFogSnapshot, broadcastCamera, showNotif],
  );

  const handleMouseLeave = useCallback(() => {
    panningRef.current = false;
    dragTokenRef.current = null;
    drawStartRef.current = null;
    measureStartRef.current = null;
    cameraDragRef.current = null;
    objectDragRef.current = null;
    objectResizeRef.current = null;
    if (paintingRef.current) {
      paintingRef.current = false;
      paintUndoPushedRef.current = false;
      lastPaintPosRef.current = null;
      sendFogSnapshot();
    }
    drawTop();
  }, [drawTop, sendFogSnapshot]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const { sx, sy } = getCanvasPos(e as unknown as ReactMouseEvent);
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      vpRef.current = zoomAt(vpRef.current, sx, sy, factor);
      setZoomPercent(Math.round(vpRef.current.scale * 100));
      redrawAll();
    },
    [getCanvasPos, redrawAll],
  );

  const handleContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      const { sx, sy } = getCanvasPos(e);
      const mp = screenToMap(sx, sy, vpRef.current);
      const box = boxesRef.current.find(
        (b) => mp.x >= b.x && mp.x <= b.x + b.w && mp.y >= b.y && mp.y <= b.y + b.h,
      ) || null;
      const token = tokensRef.current.slice().reverse().find(
        (t) => Math.hypot(t.x - mp.x, t.y - mp.y) < 18,
      ) || null;
      setContextMenu({
        open: true,
        x: e.clientX,
        y: e.clientY,
        mapX: mp.x,
        mapY: mp.y,
        box,
        token,
      });
    },
    [getCanvasPos],
  );

  // ── Context menu actions ──

  const handleCtxAction = useCallback(
    (action: string) => {
      setContextMenu((prev) => ({ ...prev, open: false }));
      const { mapX, mapY, box, token } = contextMenu;
      switch (action) {
        case 'reveal':
          pushUndo();
          paintFog(mapX, mapY, 'reveal');
          break;
        case 'hide':
          pushUndo();
          paintFog(mapX, mapY, 'hide');
          break;
        case 'ping':
          addPing(mapX, mapY);
          break;
        case 'torch':
          addTorch(mapX, mapY);
          break;
        case 'revealBox':
          if (box) doRevealBox(box);
          break;
        case 'hideBox':
          if (box) doHideBox(box);
          break;
        case 'editBox':
          if (box) {
            setEditingBox(box);
            setBoxEditorOpen(true);
          }
          break;
        case 'deleteBox':
          if (box) {
            const updated = boxesRef.current.filter((b) => b.id !== box.id);
            boxesRef.current = updated;
            setBoxes(updated);
            redrawBoxes();
            apiBoxDelete(box.id);
          }
          break;
        case 'deleteToken':
          if (token) {
            const updated = tokensRef.current.filter((t) => t.id !== token.id);
            tokensRef.current = updated;
            setTokens(updated);
            drawTop();
            apiTokenDelete(token.id);
          }
          break;
      }
    },
    [contextMenu, pushUndo, paintFog, addPing, addTorch, doRevealBox, doHideBox, redrawBoxes, drawTop, apiBoxDelete, apiTokenDelete],
  );

  // ── Box editor callbacks ──

  const handleBoxSave = useCallback(
    (id: string, updates: { name: string; type: BoxType; color: string; notes: string }) => {
      const updated = boxesRef.current.map((b) =>
        b.id === id ? { ...b, ...updates } : b,
      );
      boxesRef.current = updated;
      setBoxes(updated);
      setBoxEditorOpen(false);
      setEditingBox(null);
      redrawBoxes();
      const box = updated.find((b) => b.id === id);
      if (box) {
        showNotif(`Saved: ${box.name}`);
        apiBoxUpdate(box);
      }
    },
    [redrawBoxes, showNotif, apiBoxUpdate],
  );

  const handleBoxDelete = useCallback(
    (id: string) => {
      const updated = boxesRef.current.filter((b) => b.id !== id);
      boxesRef.current = updated;
      setBoxes(updated);
      setBoxEditorOpen(false);
      setEditingBox(null);
      redrawBoxes();
      apiBoxDelete(id);
    },
    [redrawBoxes, apiBoxDelete],
  );

  // ── Right panel callbacks ──

  const handleMapUpload = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
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
    },
    [drawMap, showNotif],
  );

  const broadcastObjects = useCallback(
    (objs: MapObject[]) => {
      fetch(`/api/sessions/${slug}/fog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objects: objs }),
      }).catch(() => {});
    },
    [slug],
  );

  const handleGridRightClick = useCallback((e: React.MouseEvent) => {
    setGridMenuOpen({ x: e.clientX, y: e.clientY });
  }, []);

  // Close grid context menu on click-away
  useEffect(() => {
    if (!gridMenuOpen) return;
    const close = () => setGridMenuOpen(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [gridMenuOpen]);

  const handleObjectAdd = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const id = uuidv4();
          const aspect = img.naturalWidth / img.naturalHeight;
          const w = Math.min(img.naturalWidth, 400);
          const h = w / aspect;
          const newObj: MapObject = {
            id,
            name: file.name.replace(/\.[^.]+$/, ''),
            src,
            x: 100,
            y: 100,
            w,
            h,
            zIndex: objectsRef.current.length,
            visible: true,
            locked: false,
          };
          objectImagesRef.current.set(id, img);
          const updated = [...objectsRef.current, newObj];
          objectsRef.current = updated;
          setObjects(updated);
          drawMap();
          showNotif(`Added: ${newObj.name}`);
          broadcastObjects(updated);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },
    [drawMap, showNotif, broadcastObjects],
  );

  const handleTokenUpload = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const id = uuidv4();
          const size = 48;
          const newObj: MapObject = {
            id,
            name: `Token: ${file.name.replace(/\.[^.]+$/, '')}`,
            src,
            x: MAP_W / 2 - size / 2,
            y: MAP_H / 2 - size / 2,
            w: size,
            h: size,
            zIndex: objectsRef.current.length + 100,
            visible: true,
            locked: false,
          };
          objectImagesRef.current.set(id, img);
          const updated = [...objectsRef.current, newObj];
          objectsRef.current = updated;
          setObjects(updated);
          drawMap();
          broadcastObjects(updated);
          showNotif(`Token image added: ${newObj.name}`);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },
    [drawMap, showNotif, broadcastObjects],
  );

  const handleObjectUpdate = useCallback(
    (id: string, updates: Partial<MapObject>) => {
      const updated = objectsRef.current.map((o) =>
        o.id === id ? { ...o, ...updates } : o,
      );
      objectsRef.current = updated;
      setObjects(updated);
      drawMap();
      broadcastObjects(updated);
    },
    [drawMap, broadcastObjects],
  );

  const handleObjectDelete = useCallback(
    (id: string) => {
      const updated = objectsRef.current.filter((o) => o.id !== id);
      objectsRef.current = updated;
      objectImagesRef.current.delete(id);
      setObjects(updated);
      drawMap();
      broadcastObjects(updated);
    },
    [drawMap, broadcastObjects],
  );

  const handleObjectReorder = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const sorted = [...objectsRef.current].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((o) => o.id === id);
      if (idx < 0) return;
      const swapIdx = direction === 'up' ? idx + 1 : idx - 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const tmpZ = sorted[idx].zIndex;
      sorted[idx] = { ...sorted[idx], zIndex: sorted[swapIdx].zIndex };
      sorted[swapIdx] = { ...sorted[swapIdx], zIndex: tmpZ };
      objectsRef.current = sorted;
      setObjects([...sorted]);
      drawMap();
      broadcastObjects(sorted);
    },
    [drawMap, broadcastObjects],
  );

  const handleRevealAll = useCallback(() => {
    boxesRef.current
      .filter((b) => b.type === 'autoReveal' && !b.revealed)
      .forEach((b) => doRevealBox(b));
  }, [doRevealBox]);

  const handleClearBoxes = useCallback(() => {
    boxesRef.current.forEach((b) => apiBoxDelete(b.id));
    boxesRef.current = [];
    setBoxes([]);
    redrawBoxes();
  }, [redrawBoxes, apiBoxDelete]);

  const handleQueueToken = useCallback(
    (emoji: string, color: string) => {
      pendingTokenRef.current = { emoji, color };
      setTool('token');
      showNotif(`Click map to place ${emoji}`);
    },
    [setTool, showNotif],
  );

  const handleClearTokens = useCallback(() => {
    tokensRef.current.forEach((t) => apiTokenDelete(t.id));
    tokensRef.current = [];
    setTokens([]);
    torchesRef.current = [];
    drawTop();
    showNotif('Tokens cleared');
  }, [drawTop, showNotif, apiTokenDelete]);

  const handleExport = useCallback(() => {
    const data: SessionExport = {
      version: 1,
      name: sessionName,
      boxes: boxesRef.current.map(({ id: _, session_id: _s, ...rest }) => { void _; void _s; return rest; }),
      tokens: tokensRef.current.map(({ id: _, session_id: _s, ...rest }) => { void _; void _s; return rest; }),
      objects: objectsRef.current.map(({ id: _, ...rest }) => { void _; return rest; }),
      settings: {
        gm_fog_opacity: gmFogOpacityRef.current,
        grid_size: gridSizeRef.current,
        prep_message: prepMessage,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionName || 'session'}.veilmap.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotif('Session exported');
  }, [sessionName, prepMessage, showNotif]);

  const handleImport = useCallback(
    (data: SessionExport) => {
      if (data.version !== 1) return;
      const importedBoxes: Box[] = data.boxes.map((b, i) => ({
        ...b,
        id: uuidv4(),
        session_id: session.id,
        sort_order: b.sort_order ?? i,
      }));
      const importedTokens: Token[] = data.tokens.map((t) => ({
        ...t,
        id: uuidv4(),
        session_id: session.id,
      }));
      const importedObjects: MapObject[] = (data.objects || []).map((o) => ({
        ...o,
        id: uuidv4(),
      }));
      boxesRef.current = importedBoxes;
      tokensRef.current = importedTokens;
      objectsRef.current = importedObjects;
      setBoxes(importedBoxes);
      setTokens(importedTokens);
      setObjects(importedObjects);
      // Preload object images
      importedObjects.forEach((obj) => {
        const img = new Image();
        img.onload = () => { objectImagesRef.current.set(obj.id, img); drawMap(); };
        img.src = obj.src;
      });
      if (data.settings) {
        setGmFogOpacity(data.settings.gm_fog_opacity);
        gmFogOpacityRef.current = data.settings.gm_fog_opacity;
        setGridSize(data.settings.grid_size);
        gridSizeRef.current = data.settings.grid_size;
        setPrepMessage(data.settings.prep_message);
        setSessionName(data.name);
      }
      importedBoxes.forEach((b) => apiBoxCreate(b));
      importedTokens.forEach((t) => apiTokenCreate(t));
      redrawAll();
      showNotif('Session imported');
    },
    [session.id, apiBoxCreate, apiTokenCreate, redrawAll, showNotif, drawMap],
  );

  const handleResetView = useCallback(() => {
    const w = wrapRef.current;
    if (!w) return;
    vpRef.current = fitToContainer(MAP_W, MAP_H, w.offsetWidth, w.offsetHeight);
    setZoomPercent(Math.round(vpRef.current.scale * 100));
    redrawAll();
  }, [redrawAll]);

  const handleResetFog = useCallback(() => {
    if (typeof window !== 'undefined' && !window.confirm('Reset all fog?')) return;
    resetFog();
  }, [resetFog]);

  // ── Drop map on canvas ──

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f?.type.startsWith('image/')) handleMapUpload(f);
    },
    [handleMapUpload],
  );

  // ── Render ──

  return (
    <div className="flex h-full flex-col select-none" style={{ background: '#07060c', fontFamily: "'Crimson Pro',Georgia,serif", color: '#d4c4a0' }}>
      {/* Header */}
      <header
        className="z-50 flex flex-shrink-0 items-center justify-between px-3 py-[7px]"
        style={{ background: '#100f18', borderBottom: '1px solid rgba(200,150,62,.2)' }}
      >
        <div
          className="text-[1.15rem] font-black tracking-[.08em]"
          style={{ fontFamily: "'Cinzel',serif", color: '#c8963e', textShadow: '0 0 16px rgba(200,150,62,.3)' }}
        >
          Veil<span style={{ color: '#e05c2a', fontStyle: 'normal' }}>Map</span>
        </div>
        <div className="flex items-center gap-[7px]">
          <button
            className="cursor-pointer rounded border px-2 py-0.5 text-[.68rem] font-medium tracking-[.05em] transition-all hover:border-[#c8963e] hover:text-[#c8963e]"
            style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.5)', borderColor: 'rgba(200,150,62,.15)', background: 'transparent' }}
            onClick={() => setZoomModalOpen(true)}
          >
            {zoomPercent}%
          </button>
          {blackoutActive && (
            <span
              className="px-1.5 py-0.5 text-[.62rem] tracking-[.06em] rounded"
              style={{ fontFamily: "'Cinzel',serif", background: 'rgba(224,92,42,.2)', color: '#e05c2a', border: '1px solid rgba(224,92,42,.3)' }}
            >
              ⬛ BLACKOUT
            </span>
          )}
          <HeaderBtn onClick={handleResetView}>⌂ Fit</HeaderBtn>
          <HeaderBtn onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/play/${slug}`).then(() => showNotif('Player URL copied!')).catch(() => showNotif('Copy failed — check clipboard permissions')); }}>📺 Player</HeaderBtn>
          <HeaderBtn onClick={() => setSettingsOpen(true)}>⚙</HeaderBtn>
          <HeaderBtn onClick={undo}>↩ Undo</HeaderBtn>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <Toolbar
          activeTool={tool}
          onToolChange={setTool}
          brushRadius={brushRadius}
          onBrushChange={(r) => { setBrushRadius(r); brushRadiusRef.current = r; }}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((v) => { showGridRef.current = !v; return !v; })}
          onResetFog={handleResetFog}
          onGridRightClick={handleGridRightClick}
          snapToGrid={snapToGrid}
          onSnapToGridToggle={() => { setSnapToGrid(v => { snapToGridRef.current = !v; return !v; }); }}
        />

        {/* Canvas wrapper */}
        <div
          ref={wrapRef}
          className="relative flex-1 overflow-hidden"
          style={{ background: '#040308', cursor: panningRef.current ? 'grabbing' : spaceHeldRef.current ? 'grab' : 'crosshair' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <canvas ref={canvasMapRef} className="absolute inset-0" style={{ zIndex: 1, imageRendering: 'pixelated' }} />
          <canvas ref={canvasBoxesRef} className="absolute inset-0" style={{ zIndex: 2, imageRendering: 'pixelated' }} />
          <canvas ref={canvasFogGMRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 3, imageRendering: 'pixelated' }} />
          <canvas ref={canvasTopRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5, imageRendering: 'pixelated' }} />
          <canvas
            ref={canvasInterRef}
            className="absolute inset-0"
            style={{ zIndex: 6 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
          />

          {/* Measure info */}
          {measureInfo && (
            <div
              className="pointer-events-none fixed left-1/2 top-[44px] z-[500] -translate-x-1/2 rounded border px-3 py-1 text-[.75rem] tracking-[.07em]"
              style={{
                fontFamily: "'Cinzel',serif",
                background: 'rgba(7,6,12,.95)',
                borderColor: '#c8963e',
                color: '#f0c060',
              }}
            >
              {measureInfo}
            </div>
          )}

          {/* Hint */}
          {hint && (
            <div
              className="pointer-events-none fixed bottom-[38px] left-1/2 z-[400] -translate-x-1/2 rounded border px-3 py-1 text-[.7rem] tracking-[.05em]"
              style={{
                fontFamily: "'Cinzel',serif",
                background: 'rgba(7,6,12,.88)',
                borderColor: 'rgba(200,150,62,.2)',
                color: '#c8963e',
              }}
            >
              {hint}
            </div>
          )}
        </div>

        <RightPanel
          boxes={boxes}
          tokens={tokens}
          objects={objects}
          selectedBoxId={selectedBoxId}
          selectedObjectId={selectedObjectId}
          onObjectSelect={(id) => { setSelectedObjectId(id); drawTop(); }}
          onBoxClick={(b) => { setEditingBox(b); setBoxEditorOpen(true); setSelectedBoxId(b.id); }}
          onRevealAll={handleRevealAll}
          onClearBoxes={handleClearBoxes}
          onQueueToken={handleQueueToken}
          onClearTokens={handleClearTokens}
          onMapUpload={handleMapUpload}
          onExport={handleExport}
          onImport={handleImport}
          onObjectAdd={handleObjectAdd}
          onObjectUpdate={handleObjectUpdate}
          onObjectDelete={handleObjectDelete}
          onObjectReorder={handleObjectReorder}
          onTokenUpload={handleTokenUpload}
        />
      </div>

      {/* Notification toast */}
      <div
        className="pointer-events-none fixed bottom-[14px] left-1/2 z-[9999] whitespace-nowrap rounded border px-3.5 py-1.5 text-[.75rem] tracking-[.07em] transition-transform duration-300"
        style={{
          fontFamily: "'Cinzel',serif",
          background: '#100f18',
          borderColor: '#c8963e',
          color: '#c8963e',
          transform: notification
            ? 'translateX(-50%) translateY(0)'
            : 'translateX(-50%) translateY(60px)',
        }}
      >
        {notification}
      </div>

      {/* Grid context menu */}
      {gridMenuOpen && (
        <div
          className="fixed z-[900] rounded border shadow-lg py-1"
          style={{ left: gridMenuOpen.x, top: gridMenuOpen.y, background: '#100f18', borderColor: 'rgba(200,150,62,.3)', minWidth: 180 }}
        >
          <div
            className="cursor-pointer px-3 py-1.5 text-[.68rem] transition-all hover:bg-[rgba(200,150,62,.1)]"
            style={{ fontFamily: "'Cinzel',serif", color: showGrid ? '#c8963e' : '#d4c4a0' }}
            onClick={() => { setShowGrid(v => { showGridRef.current = !v; return !v; }); setGridMenuOpen(null); }}
          >
            {showGrid ? '✓ ' : '  '}Toggle Grid
          </div>
          <div
            className="cursor-pointer px-3 py-1.5 text-[.68rem] transition-all hover:bg-[rgba(200,150,62,.1)]"
            style={{ fontFamily: "'Cinzel',serif", color: snapToGrid ? '#c8963e' : '#d4c4a0' }}
            onClick={() => { setSnapToGrid(v => { const nv = !v; snapToGridRef.current = nv; showNotif(nv ? 'Snap on' : 'Snap off'); return nv; }); setGridMenuOpen(null); }}
          >
            {snapToGrid ? '✓ ' : '  '}Snap Objects to Grid
          </div>
          <div
            className="cursor-pointer px-3 py-1.5 text-[.68rem] transition-all hover:bg-[rgba(200,150,62,.1)]"
            style={{ fontFamily: "'Cinzel',serif", color: '#d4c4a0' }}
            onClick={() => { setDrawGridMode(true); setGridMenuOpen(null); showNotif('Draw a rectangle matching a known grid cell on the map'); }}
          >
            📏 Draw Grid Size
          </div>
        </div>
      )}

      {/* Modals */}
      <BoxEditor
        box={editingBox}
        open={boxEditorOpen}
        onClose={() => { setBoxEditorOpen(false); setEditingBox(null); }}
        onSave={handleBoxSave}
        onDelete={handleBoxDelete}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        gmFogOpacity={gmFogOpacity}
        onFogOpacityChange={(v) => { setGmFogOpacity(v); gmFogOpacityRef.current = v; }}
        gridSize={gridSize}
        onGridSizeChange={(v) => { setGridSize(v); gridSizeRef.current = v; }}
        prepMessage={prepMessage}
        onPrepMessageChange={setPrepMessage}
        sessionName={sessionName}
        onSessionNameChange={setSessionName}
      />
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu((prev) => ({ ...prev, open: false }))}
        onAction={handleCtxAction}
      />
      {zoomModalOpen && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center" onClick={() => setZoomModalOpen(false)}>
          <div
            className="rounded-lg border p-5 shadow-2xl"
            style={{ background: '#100f18', borderColor: 'rgba(200,150,62,.3)', minWidth: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-center text-[.7rem] font-semibold tracking-[.1em]" style={{ fontFamily: "'Cinzel',serif", color: '#c8963e' }}>
              ZOOM
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="text-center text-[1.2rem] font-bold" style={{ color: '#c8963e', fontFamily: "'Cinzel',serif" }}>
                {zoomPercent}%
              </div>
              <input
                type="range"
                min="10"
                max="500"
                value={zoomPercent}
                onChange={(e) => {
                  const newZoom = parseInt(e.target.value, 10);
                  const wrap = wrapRef.current;
                  if (!wrap) return;
                  const cx = wrap.offsetWidth / 2, cy = wrap.offsetHeight / 2;
                  const newScale = newZoom / 100;
                  const oldScale = vpRef.current.scale;
                  const factor = newScale / oldScale;
                  vpRef.current = zoomAt(vpRef.current, cx, cy, factor);
                  setZoomPercent(Math.round(vpRef.current.scale * 100));
                  redrawAll();
                }}
                className="h-48 w-3 appearance-none rounded-full"
                style={{
                  writingMode: 'vertical-lr',
                  direction: 'rtl',
                  accentColor: '#c8963e',
                  background: 'rgba(200,150,62,.15)',
                }}
              />
              <div className="flex gap-2">
                <button
                  className="rounded border px-3 py-1 text-[.62rem] transition-all hover:bg-[rgba(200,150,62,.15)]"
                  style={{ fontFamily: "'Cinzel',serif", borderColor: 'rgba(200,150,62,.2)', color: '#c8963e' }}
                  onClick={() => {
                    const wrap = wrapRef.current;
                    if (!wrap) return;
                    vpRef.current = fitToContainer(MAP_W, MAP_H, wrap.offsetWidth, wrap.offsetHeight);
                    setZoomPercent(Math.round(vpRef.current.scale * 100));
                    redrawAll();
                  }}
                >
                  Fit
                </button>
                <button
                  className="rounded border px-3 py-1 text-[.62rem] transition-all hover:bg-[rgba(200,150,62,.15)]"
                  style={{ fontFamily: "'Cinzel',serif", borderColor: 'rgba(200,150,62,.2)', color: '#c8963e' }}
                  onClick={() => setZoomModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className="rounded border px-2.5 py-1 text-[.68rem] font-medium tracking-[.05em] transition-all hover:border-[#c8963e] hover:text-[#c8963e]"
      style={{
        fontFamily: "'Cinzel',serif",
        borderColor: 'rgba(200,150,62,.2)',
        background: 'transparent',
        color: '#d4c4a0',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function drawDefaultMap(c: CanvasRenderingContext2D) {
  c.fillStyle = '#0c0a08';
  c.fillRect(0, 0, MAP_W, MAP_H);
  // Scatter noise dots
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * MAP_W, y = Math.random() * MAP_H;
    c.fillStyle = `rgba(${100 + ~~(Math.random() * 40)},${80 + ~~(Math.random() * 30)},${55 + ~~(Math.random() * 20)},${Math.random() * 0.1})`;
    c.beginPath();
    c.arc(x, y, Math.random() * 2, 0, Math.PI * 2);
    c.fill();
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
    const nx = (-dy / l) * (hw / 2), ny = (dx / l) * (hw / 2);
    c.fillStyle = '#1a1408';
    c.beginPath();
    c.moveTo(x1 + nx, y1 + ny);
    c.lineTo(x2 + nx, y2 + ny);
    c.lineTo(x2 - nx, y2 - ny);
    c.lineTo(x1 - nx, y1 - ny);
    c.closePath();
    c.fill();
    c.strokeStyle = '#282010';
    c.lineWidth = 2;
    c.stroke();
  });
  rooms.forEach(([rx, ry, rw, rh, label]) => {
    const g = c.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, Math.max(rw, rh) / 2);
    g.addColorStop(0, '#2e2214');
    g.addColorStop(1, '#160f06');
    c.fillStyle = g;
    c.fillRect(rx, ry, rw, rh);
    c.strokeStyle = '#4e3218';
    c.lineWidth = 4;
    c.strokeRect(rx, ry, rw, rh);
    c.strokeStyle = 'rgba(0,0,0,.5)';
    c.lineWidth = 7;
    c.strokeRect(rx + 3, ry + 3, rw - 6, rh - 6);
    c.fillStyle = 'rgba(200,150,62,.15)';
    c.font = `bold ${Math.min(rw, rh) * 0.08}px Cinzel,serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label.toUpperCase(), rx + rw / 2, ry + rh / 2);
  });
  const emojis: [number, number, string][] = [
    [390, 380, '🕯️'], [280, 650, '⚰️'], [1820, 240, '👑'], [2000, 450, '🗡️'],
    [1210, 900, '🛡️'], [1900, 1050, '💎'], [400, 1100, '🔗'], [260, 1200, '💀'],
  ];
  emojis.forEach(([x, y, e]) => {
    c.font = '22px serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalAlpha = 0.4;
    c.fillText(e, x, y);
    c.globalAlpha = 1;
  });
}

function drawGridLines(c: CanvasRenderingContext2D, gridSize: number, scale: number) {
  c.strokeStyle = 'rgba(200,150,62,.07)';
  c.lineWidth = 1 / scale;
  for (let x = 0; x <= MAP_W; x += gridSize) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, MAP_H);
    c.stroke();
  }
  for (let y = 0; y <= MAP_H; y += gridSize) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(MAP_W, y);
    c.stroke();
  }
}

function renderBox(
  c: CanvasRenderingContext2D,
  b: Box,
  scale: number,
  selectedBoxId: string | null,
) {
  if (b.type === 'hidden') return;
  const col = b.color || TYPE_COLORS[b.type] || '#c8963e';
  const a = b.revealed ? 0.25 : 1;
  c.save();
  c.globalAlpha = a;

  if (b.points && b.points.length >= 3) {
    // Polygon room
    c.beginPath();
    c.moveTo(b.points[0].x, b.points[0].y);
    for (let i = 1; i < b.points.length; i++) {
      c.lineTo(b.points[i].x, b.points[i].y);
    }
    c.closePath();
    c.fillStyle = hexAlpha(col, b.revealed ? 0.03 : 0.06);
    c.fill();
    c.strokeStyle = col;
    c.lineWidth = (b.id === selectedBoxId ? 3 : 1.5) / scale;
    if (!b.revealed) c.setLineDash([8 / scale, 4 / scale]);
    c.stroke();
    c.setLineDash([]);
  } else {
    // Rectangle room (original behavior)
    c.fillStyle = hexAlpha(col, b.revealed ? 0.03 : 0.06);
    c.fillRect(b.x, b.y, b.w, b.h);
    c.strokeStyle = col;
    c.lineWidth = (b.id === selectedBoxId ? 3 : 1.5) / scale;
    if (!b.revealed) c.setLineDash([8 / scale, 4 / scale]);
    c.strokeRect(b.x, b.y, b.w, b.h);
    c.setLineDash([]);
  }

  // Hazard hatching
  if (b.type === 'hazard' && !b.revealed) {
    c.strokeStyle = hexAlpha('#e05c2a', 0.12);
    c.lineWidth = 2 / scale;
    for (let i = -b.h; i < b.w + b.h; i += 24) {
      c.beginPath();
      c.moveTo(b.x + i, b.y);
      c.lineTo(b.x + i - b.h, b.y + b.h);
      c.stroke();
    }
  }
  // Label
  if (b.w * scale > 50 && b.h * scale > 28) {
    const fs = Math.min(b.w, b.h) * 0.08;
    c.fillStyle = hexAlpha(col, b.revealed ? 0.4 : 0.65);
    c.font = `bold ${Math.max(10, fs)}px Cinzel,serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 - fs * 0.4);
    c.font = `${Math.max(7, fs * 0.65)}px Cinzel,serif`;
    c.fillStyle = hexAlpha(col, 0.35);
    c.fillText(`[${b.type}]`, b.x + b.w / 2, b.y + b.h / 2 + fs * 0.65);
  }
  c.restore();
}
