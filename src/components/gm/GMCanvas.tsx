'use client';

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Session, Box, BoxType, SessionExport, MapObject, CameraViewport, AssetLibraryItem } from '@/types';
import {
  MAP_W,
  MAP_H,
  createFogCanvas,
  paintReveal,
  paintHide,
  revealAllFog,
  revealBox as revealBoxFog,
  revealGridCell,
  fogToBase64,
  loadFogFromBase64,
} from '@/lib/fog-engine';
import {
  screenToMap,
  zoomAt,
  fitToContainer,
  applyViewport,
  clampViewport,
  clampToMap,
  hexToRgba,
  type Viewport,
} from '@/lib/viewport';
import Toolbar from './Toolbar';
import RightPanel from './RightPanel';
import BoxEditor from './BoxEditor';
import SettingsModal from './SettingsModal';
import ContextMenu, { type ContextMenuState } from './ContextMenu';

// ── Types ──

type ToolName = 'reveal' | 'hide' | 'gridReveal' | 'box' | 'select' | 'ping' | 'measure' | 'camera';

interface Ping { x: number; y: number; born: number }
interface MeasureState { sx: number; sy: number; mx: number; my: number }

type UndoType =
  | 'fog-paint'
  | 'fog-grid-reveal'
  | 'fog-reset'
  | 'fog-revealall'
  | 'object-add'
  | 'object-move'
  | 'object-resize'
  | 'object-rotate'
  | 'object-visibility'
  | 'box-create'
  | 'box-reveal'
  | 'box-hide'
  | 'box-delete';

interface UndoEntry {
  type: UndoType;
  label: string;
  fogBefore?: HTMLCanvasElement;
  fogAfter?: HTMLCanvasElement;
  objectsBefore?: MapObject[];
  objectsAfter?: MapObject[];
  boxesBefore?: Box[];
  boxesAfter?: Box[];
}

const BOX_COLORS = ['#c8963e', '#e05c2a', '#6a4fc8', '#2a8a4a', '#c8300a', '#2a6a9a', '#888'];
const TYPE_COLORS: Record<string, string> = {
  autoReveal: '#c8963e', trigger: '#a080e0', hazard: '#e05c2a', note: '#5aba6a', hidden: '#555',
};
const MAX_UNDO = 50;
const POLYGON_SNAP_DISTANCE = 15; // px — how close to first vertex to close a polygon
const MIN_OBJECT_SIZE = 20; // px — minimum object width/height when resizing
const TOOL_HINTS: Partial<Record<ToolName, string>> = {
  box: 'Click to place polygon vertices (Shift=snap), click near first to close',
  select: 'Click to select · Drag to resize · Hold Shift for free scale',
  measure: 'Drag to measure distance in feet & squares',
  ping: 'Click to ping a location on player display',
  camera: 'Drag to set camera viewport for player display',
  gridReveal: 'Click or drag to reveal fog one grid cell at a time',
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

/** Snap a value to the center of the nearest grid cell */
function snapCenter(v: number, gridSize: number) {
  return Math.floor(v / gridSize) * gridSize + gridSize / 2;
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
  const [showGrid, setShowGrid] = useState(session.show_grid ?? false);
  const [gmFogOpacity, setGmFogOpacity] = useState(session.gm_fog_opacity);
  const [gridSize, setGridSize] = useState(session.grid_size || 32);
  const [gridColor, setGridColor] = useState(session.grid_color || '#c8963e');
  const [gridOpacity, setGridOpacity] = useState(session.grid_opacity ?? 0.25);
  const [prepMessage, setPrepMessage] = useState(session.prep_message || 'Preparing next scene…');
  const [sessionName, setSessionName] = useState(session.name);
  const [boxes, setBoxes] = useState<Box[]>(session.boxes || []);
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
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<AssetLibraryItem[]>([]);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridMenuOpen, setGridMenuOpen] = useState<{ x: number; y: number } | null>(null);
  const [drawGridMode, setDrawGridMode] = useState(false);
  const [canvasCursor, setCanvasCursor] = useState<string>('crosshair');
  const [htmlVpTransform, setHtmlVpTransform] = useState('translate(0px,0px) scale(1)');

  // Mutable refs for interaction state
  const vpRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const customMapRef = useRef<HTMLImageElement | null>(null);
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const spaceHeldRef = useRef(false);
  const ctrlHeldRef = useRef(false);
  const shiftHeldRef = useRef(false);
  const paintingRef = useRef(false);
  const paintUndoPushedRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const polyPointsRef = useRef<{ x: number; y: number }[]>([]);
  const measureStartRef = useRef<MeasureState | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0, mx: 0, my: 0 });
  const undoStackRef = useRef<UndoEntry[]>([]);
  const pingsRef = useRef<Ping[]>([]);
  const topLoopRef = useRef(false);
  const boxNumRef = useRef(1);
  const fogThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fogSnapshotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toolRef = useRef<ToolName>('reveal');
  const boxesRef = useRef<Box[]>(session.boxes || []);
  const objectsRef = useRef<MapObject[]>(session.objects || []);
  const objectImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const gridSizeRef = useRef(session.grid_size || 32);
  const gridColorRef = useRef(session.grid_color || '#c8963e');
  const gridOpacityRef = useRef(session.grid_opacity ?? 0.25);
  const gmFogOpacityRef = useRef(session.gm_fog_opacity);
  const brushRadiusRef = useRef(36);
  const showGridRef = useRef(session.show_grid ?? false);
  const lastPaintPosRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<CameraViewport>(
    session.camera_x != null && session.camera_y != null && session.camera_w != null && session.camera_h != null
      ? { x: session.camera_x, y: session.camera_y, w: session.camera_w, h: session.camera_h }
      : { x: 0, y: 0, w: MAP_W, h: MAP_H }
  );
  const cameraDragRef = useRef<{ startX: number; startY: number } | null>(null);
  const cameraModeRef = useRef<CameraInteraction>('idle');
  const cameraGrabOffsetRef = useRef({ x: 0, y: 0 });
  const blackoutActiveRef = useRef(false);
  const selectedObjectIdRef = useRef<string | null>(null);
  const objectDragRef = useRef<{ objId: string; offsetX: number; offsetY: number } | null>(null);
  const objectResizeRef = useRef<{ objId: string; corner: string; startX: number; startY: number; origObj: MapObject } | null>(null);
  const objectUndoBeforeRef = useRef<MapObject | null>(null);
  const snapToGridRef = useRef(false);
  const gridDrawStartRef = useRef<{ x: number; y: number } | null>(null);
  const gridRevealCellsRef = useRef<Set<string>>(new Set());

  // Keep refs in sync
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { boxesRef.current = boxes; }, [boxes]);
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
      fetch(`/api/sessions/${slug}/boxes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId: id }),
      }).catch(() => {});
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
      // Clean slate: just a dark background — user uploads their base map as an object
      ctx.fillStyle = '#0c0a08';
      ctx.fillRect(0, 0, MAP_W, MAP_H);
    }
    // Objects are rendered in the HTML layer — no canvas drawing here
    ctx.restore();
    // Sync HTML object layer transform with viewport
    const vp = vpRef.current;
    setHtmlVpTransform(`translate(${vp.x}px,${vp.y}px) scale(${vp.scale})`);
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

    // Grid overlay (above fog, above objects)
    if (showGridRef.current) drawGridLines(ctx, gridSizeRef.current, vp.scale, gridColorRef.current, gridOpacityRef.current);

    const now = Date.now();

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

    // Brush cursor (reveal/hide tool — show radius circle)
    if (toolRef.current === 'reveal' || toolRef.current === 'hide') {
      const mp = mousePosRef.current;
      const r = brushRadiusRef.current;
      ctx.strokeStyle = 'rgba(200,150,62,.5)';
      ctx.lineWidth = 1.5 / vp.scale;
      ctx.setLineDash([6 / vp.scale, 4 / vp.scale]);
      ctx.beginPath();
      ctx.arc(mp.mx, mp.my, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Grid reveal cursor (highlight hovered grid cell)
    if (toolRef.current === 'gridReveal') {
      const mp = mousePosRef.current;
      const gs = gridSizeRef.current;
      const cellX = Math.floor(mp.mx / gs) * gs;
      const cellY = Math.floor(mp.my / gs) * gs;
      ctx.strokeStyle = 'rgba(200,150,62,.6)';
      ctx.lineWidth = 2 / vp.scale;
      ctx.setLineDash([4 / vp.scale, 3 / vp.scale]);
      ctx.strokeRect(cellX, cellY, gs, gs);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200,150,62,.08)';
      ctx.fillRect(cellX, cellY, gs, gs);
    }

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
      const useSnap = shiftHeldRef.current;
      const bx = Math.min(ds.x, mp.mx);
      const by = Math.min(ds.y, mp.my);
      const bw = Math.abs(mp.mx - ds.x);
      const bh = Math.abs(mp.my - ds.y);
      const sx = useSnap ? snap(bx, gs) : bx;
      const sy = useSnap ? snap(by, gs) : by;
      const sw = useSnap ? Math.max(gs, snap(bw, gs)) : bw;
      const sh = useSnap ? Math.max(gs, snap(bh, gs)) : bh;
      ctx.strokeStyle = 'rgba(200,150,62,.75)';
      ctx.lineWidth = 2 / vp.scale;
      ctx.setLineDash([6 / vp.scale, 3 / vp.scale]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(200,150,62,.05)';
      ctx.fillRect(sx, sy, sw, sh);
      if (gs > 0 && useSnap) {
        ctx.font = `${Math.min(sw, sh) * 0.09}px Cinzel,serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(200,150,62,.4)';
        ctx.fillText(`${~~(sw / gs)}×${~~(sh / gs)}sq`, sx + sw / 2, sy + sh / 2);
      }
      ctx.restore();
    }

    // Polygon drawing preview
    const pts = polyPointsRef.current;
    if (toolRef.current === 'box' && pts.length > 0) {
      const mp = mousePosRef.current;
      const gs = gridSizeRef.current;
      const useSnap = shiftHeldRef.current;
      const cursorX = useSnap ? snap(mp.mx, gs) : mp.mx;
      const cursorY = useSnap ? snap(mp.my, gs) : mp.my;
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
      ctx.lineTo(cursorX, cursorY);
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
        const snapDist = Math.hypot(cursorX - first.x, cursorY - first.y);
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
        const hs = 9 / vp.scale;
        ctx.fillStyle = 'rgba(0,180,255,.9)';
        [[obj.x, obj.y], [obj.x + obj.w, obj.y], [obj.x, obj.y + obj.h], [obj.x + obj.w, obj.y + obj.h]].forEach(([cx, cy]) => {
          ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
        });
        const ms = 7 / vp.scale;
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

    // Draw Grid Size preview rectangle
    if (gridDrawStartRef.current) {
      const mp = mousePosRef.current;
      const ds = gridDrawStartRef.current;
      ctx.save();
      applyViewport(ctx, vp);
      const gx = Math.min(ds.x, mp.mx);
      const gy = Math.min(ds.y, mp.my);
      const gw = Math.abs(mp.mx - ds.x);
      const gh = Math.abs(mp.my - ds.y);
      ctx.strokeStyle = 'rgba(0,255,120,.8)';
      ctx.lineWidth = 2 / vp.scale;
      ctx.setLineDash([6 / vp.scale, 3 / vp.scale]);
      ctx.strokeRect(gx, gy, gw, gh);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,255,120,.06)';
      ctx.fillRect(gx, gy, gw, gh);
      // Show size text
      const sizeText = `${Math.round(Math.max(gw, gh))}px`;
      const fontSize = 14 / vp.scale;
      ctx.font = `bold ${fontSize}px Cinzel,serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,255,120,.9)';
      ctx.fillText(sizeText, gx + gw / 2, gy + gh / 2);
      ctx.restore();
    }

    // Animation loop
    const needs =
      pingsRef.current.length > 0 ||
      (toolRef.current === 'box' && (drawStartRef.current || polyPointsRef.current.length > 0)) ||
      (toolRef.current === 'measure' && measureStartRef.current) ||
      (toolRef.current === 'camera' && cameraDragRef.current) ||
      gridDrawStartRef.current;
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

  const snapFog = useCallback((): HTMLCanvasElement | null => {
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas) return null;
    const snapC = document.createElement('canvas');
    snapC.width = MAP_W;
    snapC.height = MAP_H;
    snapC.getContext('2d')!.drawImage(fogCanvas, 0, 0);
    return snapC;
  }, []);

  const pushUndoEntry = useCallback((entry: UndoEntry) => {
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
  }, []);

  /** Legacy fog-only push — captures fog before state for later completion */
  const pushUndo = useCallback(() => {
    const snap = snapFog();
    if (!snap) return;
    // Store as a fog-paint entry; the "after" state will be captured on mouseUp
    pushUndoEntry({ type: 'fog-paint', label: 'fog paint', fogBefore: snap });
  }, [snapFog, pushUndoEntry]);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (!stack.length) {
      showNotif('Nothing to undo');
      return;
    }
    const entry = stack.pop()!;

    // Restore fog state if present
    if (entry.fogBefore) {
      const fogCanvas = fogCanvasRef.current;
      if (fogCanvas) {
        const ctx = fogCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, MAP_W, MAP_H);
        ctx.drawImage(entry.fogBefore, 0, 0);
        composeFogGM();
      }
    }

    // Restore objects state if present
    if (entry.objectsBefore) {
      objectsRef.current = entry.objectsBefore;
      setObjects(entry.objectsBefore);
      // Preload images for restored objects
      entry.objectsBefore.forEach((obj) => {
        if (!objectImagesRef.current.has(obj.id)) {
          const img = new Image();
          img.onload = () => { objectImagesRef.current.set(obj.id, img); drawMap(); };
          img.src = obj.src;
        }
      });
      drawMap();
      drawTop();
      // Broadcast restored objects
      fetch(`/api/sessions/${slug}/fog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objects: entry.objectsBefore }),
      }).catch(() => {});
    }

    // Restore boxes state if present
    if (entry.boxesBefore) {
      boxesRef.current = entry.boxesBefore;
      setBoxes(entry.boxesBefore);
      redrawBoxes();
    }

    showNotif(`↩ Undone: ${entry.label}`);
  }, [composeFogGM, showNotif, drawMap, drawTop, redrawBoxes, slug]);

  const doRevealBox = useCallback(
    (box: Box) => {
      if (box.revealed) return;
      const fogSnap = snapFog();
      const beforeBoxes = [...boxesRef.current];
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
      if (fogSnap) {
        pushUndoEntry({ type: 'box-reveal', label: `${box.name} revealed`, fogBefore: fogSnap, boxesBefore: beforeBoxes, boxesAfter: [...updatedBoxes] });
      }
    },
    [snapFog, pushUndoEntry, composeFogGM, redrawBoxes, showNotif, apiBoxUpdate, sendFogSnapshot],
  );

  const doHideBox = useCallback(
    (box: Box) => {
      const fogSnap = snapFog();
      const beforeBoxes = [...boxesRef.current];
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
      if (fogSnap) {
        pushUndoEntry({ type: 'box-hide', label: `${box.name} hidden`, fogBefore: fogSnap, boxesBefore: beforeBoxes, boxesAfter: [...updatedBoxes] });
      }
    },
    [snapFog, pushUndoEntry, composeFogGM, redrawBoxes, apiBoxUpdate],
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

  const paintGridRevealCell = useCallback(
    (mx: number, my: number) => {
      const fogCanvas = fogCanvasRef.current;
      if (!fogCanvas) return;
      const gs = gridSizeRef.current;
      const cellX = Math.floor(mx / gs) * gs;
      const cellY = Math.floor(my / gs) * gs;
      const cellKey = `${cellX},${cellY}`;
      if (gridRevealCellsRef.current.has(cellKey)) return;
      gridRevealCellsRef.current.add(cellKey);
      const ctx = fogCanvas.getContext('2d')!;
      revealGridCell(ctx, cellX, cellY, gs);
      composeFogGM();
      // Send as a reveal stroke centered on the cell
      sendFogPaint(cellX + gs / 2, cellY + gs / 2, gs / 2, 'reveal');
    },
    [composeFogGM, sendFogPaint],
  );

  const resetFog = useCallback(() => {
    pushUndo();
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas) return;
    const ctx = fogCanvas.getContext('2d')!;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    const updatedBoxes = boxesRef.current.map((b) => ({ ...b, revealed: false }));
    boxesRef.current = updatedBoxes;
    setBoxes(updatedBoxes);
    composeFogGM();
    redrawBoxes();
    showNotif('Fog reset');
    // Broadcast reset event for immediate player update
    fetch(`/api/sessions/${slug}/fog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    }).catch(() => {});
    sendFogSnapshot();
  }, [pushUndo, composeFogGM, redrawBoxes, showNotif, sendFogSnapshot, slug]);

  const revealAll = useCallback(() => {
    pushUndo();
    const fogCanvas = fogCanvasRef.current;
    if (!fogCanvas) return;
    const ctx = fogCanvas.getContext('2d')!;
    revealAllFog(ctx);
    const updatedBoxes = boxesRef.current.map((b) => ({ ...b, revealed: true }));
    boxesRef.current = updatedBoxes;
    setBoxes(updatedBoxes);
    composeFogGM();
    redrawBoxes();
    showNotif('All fog revealed');
    // Broadcast revealall event for immediate player update
    fetch(`/api/sessions/${slug}/fog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revealall: true }),
    }).catch(() => {});
    sendFogSnapshot();
  }, [pushUndo, composeFogGM, redrawBoxes, showNotif, sendFogSnapshot, slug]);

  // ── Tool switching ──

  const setTool = useCallback(
    (t: ToolName) => {
      setToolState(t);
      toolRef.current = t;
      showHint(TOOL_HINTS[t] || '');
      drawTop();
    },
    [showHint, drawTop],
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

  // ── Box finalization ──

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const finalizeBox = useCallback(
    (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const gs = gridSizeRef.current;
      const useSnap = shiftHeldRef.current;
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      if (w < MIN_OBJECT_SIZE || h < MIN_OBJECT_SIZE) {
        showNotif('Too small');
        return;
      }
      const sx = useSnap ? snap(x, gs) : x;
      const sy = useSnap ? snap(y, gs) : y;
      const sw = useSnap ? Math.max(gs, snap(w, gs)) : w;
      const sh = useSnap ? Math.max(gs, snap(h, gs)) : h;
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
      const beforeBoxes = [...boxesRef.current];
      const updated = [...boxesRef.current, newBox];
      boxesRef.current = updated;
      setBoxes(updated);
      redrawBoxes();
      setEditingBox(newBox);
      setBoxEditorOpen(true);
      apiBoxCreate(newBox);
      pushUndoEntry({ type: 'box-create', label: `room created`, boxesBefore: beforeBoxes, boxesAfter: [...updated] });
    },
    [session.id, showNotif, redrawBoxes, apiBoxCreate, pushUndoEntry],
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
      const beforeBoxes = [...boxesRef.current];
      const updated = [...boxesRef.current, newBox];
      boxesRef.current = updated;
      setBoxes(updated);
      redrawBoxes();
      setEditingBox(newBox);
      setBoxEditorOpen(true);
      apiBoxCreate(newBox);
      pushUndoEntry({ type: 'box-create', label: `room created`, boxesBefore: beforeBoxes, boxesAfter: [...updated] });
    },
    [session.id, showNotif, redrawBoxes, apiBoxCreate, pushUndoEntry],
  );

  const clickSelect = useCallback(
    (mx: number, my: number) => {
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

    // Load fog from DB if available
    fetch(`/api/sessions/${slug}/fog`).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.png && fogCanvasRef.current) {
        const ctx = fogCanvasRef.current.getContext('2d');
        if (ctx) loadFogFromBase64(ctx, data.png).then(() => { composeFogGM(); drawMap(); });
      }
    }).catch(() => {});

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

    // Preload object images from DB
    if (session.objects && session.objects.length > 0) {
      session.objects.forEach((obj) => {
        const img = new Image();
        img.onload = () => { objectImagesRef.current.set(obj.id, img); drawMap(); };
        img.src = obj.src;
      });
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

    // Broadcast DB-stored camera on mount so player gets it immediately
    if (session.camera_x != null && session.camera_y != null && session.camera_w != null && session.camera_h != null) {
      const cam = { x: session.camera_x, y: session.camera_y, w: session.camera_w, h: session.camera_h };
      fetch(`/api/sessions/${slug}/fog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera: cam }),
      }).catch(() => {});
    }

    // Broadcast DB-stored objects on mount so player gets them
    if (session.objects && session.objects.length > 0) {
      fetch(`/api/sessions/${slug}/fog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objects: session.objects }),
      }).catch(() => {});
    }

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
  // Redraw map when grid toggles or gridSize/color/opacity changes
  useEffect(() => { drawMap(); }, [showGrid, gridSize, gridColor, gridOpacity, drawMap]);

  // Persist showGrid/gridSize/gridColor/gridOpacity and broadcast to player when they change
  useEffect(() => {
    fetch(`/api/sessions/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show_grid: showGrid, grid_size: gridSize, grid_color: gridColor, grid_opacity: gridOpacity }),
    }).catch(() => {});
    // Broadcast grid state to players
    fetch(`/api/sessions/${slug}/fog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grid: { show: showGrid, size: gridSize, color: gridColor, opacity: gridOpacity } }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGrid, gridSize, gridColor, gridOpacity, slug]);

  // ── Keyboard ──

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (e.code === 'Space' && !e.repeat && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        spaceHeldRef.current = true;
        setCanvasCursor('grab');
      }
      if (e.ctrlKey || e.metaKey) ctrlHeldRef.current = true;
      if (e.shiftKey) shiftHeldRef.current = true;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const keyMap: Record<string, ToolName> = {
        r: 'reveal', h: 'hide', v: 'gridReveal', b: 'box', s: 'select', p: 'ping', m: 'measure', c: 'camera',
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
        // Undo last polygon point; cancel entirely only if 0-1 points left
        if (polyPointsRef.current.length > 1) {
          polyPointsRef.current.pop();
          drawTop();
        } else {
          polyPointsRef.current = [];
          drawTop();
        }
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
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        setCanvasCursor('crosshair');
      }
      if (!e.ctrlKey && !e.metaKey) ctrlHeldRef.current = false;
      if (!e.shiftKey) shiftHeldRef.current = false;
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [undo, setTool, redrawAll, broadcastBlackout, prepMessage, showNotif, drawTop]);

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
        setCanvasCursor('grabbing');
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

      // Object selection, drag, and resize
      if (toolRef.current === 'select') {
        const selObj = selectedObjectIdRef.current ? objectsRef.current.find(o => o.id === selectedObjectIdRef.current) : null;
        if (selObj) {
          const hs = 14 / vpRef.current.scale;
          const corners = [
            { corner: 'tl', x: selObj.x, y: selObj.y },
            { corner: 'tr', x: selObj.x + selObj.w, y: selObj.y },
            { corner: 'bl', x: selObj.x, y: selObj.y + selObj.h },
            { corner: 'br', x: selObj.x + selObj.w, y: selObj.y + selObj.h },
          ];
          const hitCorner = corners.find(c => Math.abs(mp.x - c.x) < hs && Math.abs(mp.y - c.y) < hs);
          if (hitCorner && !selObj.locked) {
            objectResizeRef.current = { objId: selObj.id, corner: hitCorner.corner, startX: mp.x, startY: mp.y, origObj: { ...selObj } };
            objectUndoBeforeRef.current = { ...selObj };
            return;
          }
          if (mp.x >= selObj.x && mp.x <= selObj.x + selObj.w && mp.y >= selObj.y && mp.y <= selObj.y + selObj.h && !selObj.locked) {
            objectDragRef.current = { objId: selObj.id, offsetX: mp.x - selObj.x, offsetY: mp.y - selObj.y };
            objectUndoBeforeRef.current = { ...selObj };
            return;
          }
        }
        const clickedObj = [...objectsRef.current].sort((a, b) => b.zIndex - a.zIndex).find(o =>
          o.visible && !o.locked && mp.x >= o.x && mp.x <= o.x + o.w && mp.y >= o.y && mp.y <= o.y + o.h
        );
        if (clickedObj) {
          setSelectedObjectId(clickedObj.id);
          drawTop();
          return;
        }
        setSelectedObjectId(null);
      }

      if (toolRef.current === 'box') {
        const gs = gridSizeRef.current;
        const useSnap = shiftHeldRef.current;
        const sx2 = useSnap ? snap(mp.x, gs) : mp.x;
        const sy2 = useSnap ? snap(mp.y, gs) : mp.y;
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
      if (toolRef.current === 'gridReveal') {
        if (!paintUndoPushedRef.current) {
          pushUndo();
          paintUndoPushedRef.current = true;
        }
        paintingRef.current = true;
        gridRevealCellsRef.current.clear();
        paintGridRevealCell(mp.x, mp.y);
      }
    },
    [getCanvasPos, addPing, setTool, clickSelect, pushUndo, paintFog, paintGridRevealCell, drawTop, drawGridMode, finalizePolygon],
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      const { sx, sy } = getCanvasPos(e);
      const mp = screenToMap(sx, sy, vpRef.current);
      mousePosRef.current = { x: sx, y: sy, mx: mp.x, my: mp.y };

      if (panningRef.current) {
        const wrap = wrapRef.current;
        const newVp = {
          ...vpRef.current,
          x: panOriginRef.current.x + (e.clientX - panStartRef.current.x),
          y: panOriginRef.current.y + (e.clientY - panStartRef.current.y),
        };
        vpRef.current = wrap
          ? clampViewport(newVp, MAP_W, MAP_H, wrap.offsetWidth, wrap.offsetHeight)
          : newVp;
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
            newX = snapCenter(objCenterX, gs) - obj.w / 2;
            newY = snapCenter(objCenterY, gs) - obj.h / 2;
          }
          // Clamp object position to canvas bounds
          newX = clampToMap(newX, obj.w, MAP_W);
          newY = clampToMap(newY, obj.h, MAP_H);
          const updated = objectsRef.current.map(o =>
            o.id === drag.objId ? { ...o, x: newX, y: newY } : o
          );
          objectsRef.current = updated;
          setObjects(updated);
          drawMap();
          drawTop();
          // Throttle object broadcast during drag for real-time player updates
          if (!objectThrottleRef.current) {
            objectThrottleRef.current = setTimeout(() => {
              objectThrottleRef.current = null;
              broadcastObjects(objectsRef.current);
            }, 150);
          }
        }
        return;
      }
      if (objectResizeRef.current) {
        const r = objectResizeRef.current;
        const orig = r.origObj;
        let nx = orig.x, ny = orig.y, nw = orig.w, nh = orig.h;
        const dx = mp.x - r.startX, dy = mp.y - r.startY;
        const freeScale = shiftHeldRef.current;
        if (freeScale) {
          // Shift held: free scaling in any direction
          if (r.corner.includes('r')) { nw = Math.max(MIN_OBJECT_SIZE, orig.w + dx); }
          if (r.corner.includes('l')) { nx = orig.x + dx; nw = Math.max(MIN_OBJECT_SIZE, orig.w - dx); }
          if (r.corner.includes('b')) { nh = Math.max(MIN_OBJECT_SIZE, orig.h + dy); }
          if (r.corner.includes('t')) { ny = orig.y + dy; nh = Math.max(MIN_OBJECT_SIZE, orig.h - dy); }
        } else {
          // Default: aspect ratio locked — scale proportionally from dragged corner
          const aspect = orig.w / orig.h;
          // Use the axis with larger movement to determine scale
          let scale: number;
          if (r.corner === 'br') {
            scale = Math.max(MIN_OBJECT_SIZE / orig.w, Math.max(MIN_OBJECT_SIZE / orig.h, Math.max((orig.w + dx) / orig.w, (orig.h + dy) / orig.h)));
            nw = orig.w * scale; nh = orig.h * scale;
          } else if (r.corner === 'bl') {
            scale = Math.max(MIN_OBJECT_SIZE / orig.w, Math.max(MIN_OBJECT_SIZE / orig.h, Math.max((orig.w - dx) / orig.w, (orig.h + dy) / orig.h)));
            nw = orig.w * scale; nh = orig.h * scale;
            nx = orig.x + orig.w - nw;
          } else if (r.corner === 'tr') {
            scale = Math.max(MIN_OBJECT_SIZE / orig.w, Math.max(MIN_OBJECT_SIZE / orig.h, Math.max((orig.w + dx) / orig.w, (orig.h - dy) / orig.h)));
            nw = orig.w * scale; nh = orig.h * scale;
            ny = orig.y + orig.h - nh;
          } else { // tl
            scale = Math.max(MIN_OBJECT_SIZE / orig.w, Math.max(MIN_OBJECT_SIZE / orig.h, Math.max((orig.w - dx) / orig.w, (orig.h - dy) / orig.h)));
            nw = orig.w * scale; nh = orig.h * scale;
            nx = orig.x + orig.w - nw;
            ny = orig.y + orig.h - nh;
          }
        }
        const updated = objectsRef.current.map(o =>
          o.id === r.objId ? { ...o, x: nx, y: ny, w: nw, h: nh } : o
        );
        objectsRef.current = updated;
        setObjects(updated);
        drawMap();
        drawTop();
        // Throttle object broadcast during resize for real-time player updates
        if (!objectThrottleRef.current) {
          objectThrottleRef.current = setTimeout(() => {
            objectThrottleRef.current = null;
            broadcastObjects(objectsRef.current);
          }, 150);
        }
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

      if (paintingRef.current && toolRef.current === 'gridReveal') {
        paintGridRevealCell(mp.x, mp.y);
        return;
      }

      if (toolRef.current === 'camera' && cameraModeRef.current !== 'idle') {
        const cam = cameraRef.current;
        if (cameraModeRef.current === 'dragging' && cam) {
          cam.x = clampToMap(mp.x - cameraGrabOffsetRef.current.x, cam.w, MAP_W);
          cam.y = clampToMap(mp.y - cameraGrabOffsetRef.current.y, cam.h, MAP_H);
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
        // Throttle camera broadcasts during drag for real-time player updates
        if (cameraModeRef.current !== 'drawing' && cam) {
          if (!cameraThrottleRef.current) {
            cameraThrottleRef.current = setTimeout(() => {
              cameraThrottleRef.current = null;
              const c = cameraRef.current;
              if (c) broadcastCamera(c);
            }, 100);
          }
        }
        drawTop();
        return;
      }

      if (['box', 'measure', 'select', 'reveal', 'hide', 'gridReveal'].includes(toolRef.current) || gridDrawStartRef.current) {
        drawTop();
      }
    },
    [getCanvasPos, redrawAll, drawTop, drawMap, paintFog],
  );

  const handleMouseUp = useCallback(
    (e: ReactMouseEvent) => {
      if (panningRef.current) {
        panningRef.current = false;
        setCanvasCursor(spaceHeldRef.current ? 'grab' : 'crosshair');
        return;
      }
      if (objectDragRef.current) {
        const dragObjId = objectDragRef.current.objId;
        objectDragRef.current = null;
        // Record undo entry for object move
        if (objectUndoBeforeRef.current) {
          const afterObj = objectsRef.current.find(o => o.id === dragObjId);
          if (afterObj) {
            pushUndoEntry({
              type: 'object-move',
              label: 'object moved',
              objectsBefore: objectsRef.current.map(o => o.id === dragObjId ? objectUndoBeforeRef.current! : o),
              objectsAfter: [...objectsRef.current],
            });
          }
          objectUndoBeforeRef.current = null;
        }
        fetch(`/api/sessions/${slug}/fog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objects: objectsRef.current }),
        }).catch(() => {});
        return;
      }
      if (objectResizeRef.current) {
        const resizeObjId = objectResizeRef.current.objId;
        objectResizeRef.current = null;
        // Record undo entry for object resize
        if (objectUndoBeforeRef.current) {
          const afterObj = objectsRef.current.find(o => o.id === resizeObjId);
          if (afterObj) {
            pushUndoEntry({
              type: 'object-resize',
              label: 'object resized',
              objectsBefore: objectsRef.current.map(o => o.id === resizeObjId ? objectUndoBeforeRef.current! : o),
              objectsAfter: [...objectsRef.current],
            });
          }
          objectUndoBeforeRef.current = null;
        }
        fetch(`/api/sessions/${slug}/fog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objects: objectsRef.current }),
        }).catch(() => {});
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
          // Persist grid_size to DB and broadcast to players
          fetch(`/api/sessions/${slug}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grid_size: newSize }),
          }).catch(() => {});
          fetch(`/api/sessions/${slug}/fog`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grid: { show: showGridRef.current, size: newSize, color: gridColorRef.current, opacity: gridOpacityRef.current } }),
          }).catch(() => {});
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
    [getCanvasPos, drawTop, drawGridMode, sendFogSnapshot, broadcastCamera, showNotif, slug],
  );

  const handleMouseLeave = useCallback(() => {
    panningRef.current = false;
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
      const token = null;
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
      const { mapX, mapY, box } = contextMenu;
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
            const beforeBoxes = [...boxesRef.current];
            const updated = boxesRef.current.filter((b) => b.id !== box.id);
            boxesRef.current = updated;
            setBoxes(updated);
            redrawBoxes();
            apiBoxDelete(box.id);
            pushUndoEntry({ type: 'box-delete', label: `room "${box.name}" deleted`, boxesBefore: beforeBoxes, boxesAfter: [...updated] });
          }
          break;
      }
    },
    [contextMenu, pushUndo, paintFog, addPing, doRevealBox, doHideBox, redrawBoxes, apiBoxDelete, pushUndoEntry],
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
      const beforeBoxes = [...boxesRef.current];
      const updated = boxesRef.current.filter((b) => b.id !== id);
      boxesRef.current = updated;
      setBoxes(updated);
      setBoxEditorOpen(false);
      setEditingBox(null);
      redrawBoxes();
      apiBoxDelete(id);
      pushUndoEntry({ type: 'box-delete', label: 'room deleted', boxesBefore: beforeBoxes, boxesAfter: [...updated] });
    },
    [redrawBoxes, apiBoxDelete, pushUndoEntry],
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

  const openLibrary = useCallback(async () => {
    try {
      const res = await fetch('/api/library');
      if (res.ok) {
        const assets = await res.json();
        setLibraryAssets(assets);
      } else {
        showNotif('Failed to load library');
      }
    } catch {
      showNotif('Failed to load library');
    }
    setShowLibrary(true);
  }, [showNotif]);

  // Close grid context menu on click-away
  useEffect(() => {
    if (!gridMenuOpen) return;
    const close = () => setGridMenuOpen(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [gridMenuOpen]);

  const handleObjectAdd = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return;
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/uploads', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        const { url } = await res.json();
        const name = file.name.replace(/\.[^.]+$/, '');
        // Auto-add to library for future use
        fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, url, category: 'object' }),
        }).catch(() => {});
        const img = new Image();
        img.onload = () => {
          const id = uuidv4();
          const aspect = img.naturalWidth / img.naturalHeight;
          const w = Math.min(img.naturalWidth, 400);
          const h = w / aspect;
          // Place at center of current GM viewport
          const wrap = wrapRef.current;
          const vp = vpRef.current;
          let cx = MAP_W / 2 - w / 2, cy = MAP_H / 2 - h / 2;
          if (wrap) {
            const center = screenToMap(wrap.offsetWidth / 2, wrap.offsetHeight / 2, vp);
            cx = center.x - w / 2;
            cy = center.y - h / 2;
          }
          const newObj: MapObject = {
            id,
            name: file.name.replace(/\.[^.]+$/, ''),
            src: url,
            x: cx,
            y: cy,
            w,
            h,
            rotation: 0,
            zIndex: objectsRef.current.length,
            visible: true,
            playerVisible: false,
            locked: false,
          };
          objectImagesRef.current.set(id, img);
          const beforeObjects = [...objectsRef.current];
          const updated = [...objectsRef.current, newObj];
          objectsRef.current = updated;
          setObjects(updated);
          drawMap();
          showNotif(`Added: ${newObj.name}`);
          broadcastObjects(updated);
          pushUndoEntry({
            type: 'object-add',
            label: `added ${newObj.name}`,
            objectsBefore: beforeObjects,
            objectsAfter: [...updated],
          });
        };
        img.src = url;
      } catch {
        showNotif('Upload failed — check file size and type');
      }
    },
    [drawMap, showNotif, broadcastObjects],
  );

  const handleObjectUpdate = useCallback(
    (id: string, updates: Partial<MapObject>) => {
      const before = [...objectsRef.current];
      const updated = objectsRef.current.map((o) =>
        o.id === id ? { ...o, ...updates } : o,
      );
      objectsRef.current = updated;
      setObjects(updated);
      drawMap();
      broadcastObjects(updated);
      // Determine undo type from updates
      let undoType: UndoType = 'object-visibility';
      let label = 'object updated';
      if ('rotation' in updates) { undoType = 'object-rotate'; label = 'object rotated'; }
      else if ('visible' in updates || 'playerVisible' in updates) { undoType = 'object-visibility'; label = 'visibility toggled'; }
      pushUndoEntry({ type: undoType, label, objectsBefore: before, objectsAfter: [...updated] });
    },
    [drawMap, broadcastObjects, pushUndoEntry],
  );

  const handleObjectDelete = useCallback(
    (id: string) => {
      const before = [...objectsRef.current];
      const updated = objectsRef.current.filter((o) => o.id !== id);
      objectsRef.current = updated;
      // Don't delete from objectImagesRef to allow undo
      setObjects(updated);
      drawMap();
      broadcastObjects(updated);
      pushUndoEntry({ type: 'object-add', label: 'object deleted', objectsBefore: before, objectsAfter: [...updated] });
    },
    [drawMap, broadcastObjects, pushUndoEntry],
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

  const handleExport = useCallback(() => {
    const data: SessionExport = {
      version: 1,
      name: sessionName,
      boxes: boxesRef.current.map(({ id: _, session_id: _s, ...rest }) => { void _; void _s; return rest; }),
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
      const importedObjects: MapObject[] = (data.objects || []).map((o) => ({
        ...o,
        id: uuidv4(),
        rotation: (o as MapObject).rotation ?? 0,
        playerVisible: (o as MapObject).playerVisible ?? true,
      }));
      boxesRef.current = importedBoxes;
      objectsRef.current = importedObjects;
      setBoxes(importedBoxes);
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
      broadcastObjects(importedObjects);
      redrawAll();
      showNotif('Session imported');
    },
    [session.id, apiBoxCreate, broadcastObjects, redrawAll, showNotif, drawMap],
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

  const handleRevealAllFog = useCallback(() => {
    if (typeof window !== 'undefined' && !window.confirm('Reveal all fog?')) return;
    revealAll();
  }, [revealAll]);

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

  /** Prevent browser context menu everywhere except on canvas elements (which have custom context menus) */
  const handleGlobalContextMenu = useCallback((e: React.MouseEvent) => {
    if (!(e.target instanceof HTMLCanvasElement)) e.preventDefault();
  }, []);

  return (
    <div className="flex h-full flex-col select-none" style={{ background: '#07060c', fontFamily: "'Crimson Pro',Georgia,serif", color: '#d4c4a0' }} onContextMenu={handleGlobalContextMenu}>
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
          onRevealAllFog={handleRevealAllFog}
          onGridRightClick={handleGridRightClick}
          snapToGrid={snapToGrid}
          onSnapToGridToggle={() => { setSnapToGrid(v => { snapToGridRef.current = !v; return !v; }); }}
        />

        {/* Canvas wrapper */}
        <div
          ref={wrapRef}
          className="relative flex-1 overflow-hidden"
          style={{ background: '#040308', cursor: canvasCursor }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <canvas ref={canvasMapRef} className="absolute inset-0" style={{ zIndex: 1, imageRendering: 'pixelated' }} />
          {/* HTML object layer — GIFs animate, images render as DOM elements */}
          <div
            className="absolute pointer-events-none"
            style={{
              zIndex: 2,
              transformOrigin: '0 0',
              transform: htmlVpTransform,
              width: MAP_W,
              height: MAP_H,
              overflow: 'hidden',
            }}
          >
            {[...objects].sort((a, b) => a.zIndex - b.zIndex).map((obj) => {
              if (!obj.visible) return null;
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
          <canvas ref={canvasBoxesRef} className="absolute inset-0" style={{ zIndex: 3, imageRendering: 'pixelated' }} />
          <canvas ref={canvasFogGMRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 4, imageRendering: 'pixelated' }} />
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
          objects={objects}
          selectedBoxId={selectedBoxId}
          selectedObjectId={selectedObjectId}
          onObjectSelect={(id) => { setSelectedObjectId(id); drawTop(); }}
          onBoxClick={(b) => { setEditingBox(b); setBoxEditorOpen(true); setSelectedBoxId(b.id); }}
          onRevealAll={handleRevealAll}
          onClearBoxes={handleClearBoxes}
          onMapUpload={handleMapUpload}
          onExport={handleExport}
          onImport={handleImport}
          onObjectAdd={handleObjectAdd}
          onObjectUpdate={handleObjectUpdate}
          onObjectDelete={handleObjectDelete}
          onObjectReorder={handleObjectReorder}
          onLibraryOpen={openLibrary}
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
          <div className="border-t border-[rgba(200,150,62,.15)] my-1" />
          <div className="px-3 py-1.5 text-[.6rem]" style={{ fontFamily: "'Cinzel',serif", color: '#8a7a5a' }}>Grid Color</div>
          <div className="flex items-center gap-2 px-3 pb-1" onClick={e => e.stopPropagation()}>
            {['#c8963e', '#ffffff', '#888888', '#4a90d9', '#d94a4a', '#4ad97a'].map(c => (
              <div
                key={c}
                className="w-5 h-5 rounded cursor-pointer border"
                style={{ background: c, borderColor: gridColor === c ? '#fff' : 'rgba(200,150,62,.3)' }}
                onClick={() => { setGridColor(c); gridColorRef.current = c; }}
              />
            ))}
          </div>
          <div className="px-3 py-1.5 text-[.6rem]" style={{ fontFamily: "'Cinzel',serif", color: '#8a7a5a' }}>Grid Opacity</div>
          <div className="flex items-center gap-2 px-3 pb-1.5" onClick={e => e.stopPropagation()}>
            <input
              type="range"
              min="0.05"
              max="0.8"
              step="0.05"
              value={gridOpacity}
              onChange={e => { const v = parseFloat(e.target.value); setGridOpacity(v); gridOpacityRef.current = v; }}
              className="w-full accent-[#c8963e]"
              style={{ height: 4 }}
            />
            <span className="text-[.6rem] text-[#8a7a5a] w-8 text-right">{Math.round(gridOpacity * 100)}%</span>
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
      {showLibrary && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center" onClick={() => setShowLibrary(false)}>
          <div
            className="rounded-lg border p-5 shadow-2xl"
            style={{ background: '#100f18', borderColor: 'rgba(200,150,62,.3)', minWidth: 400, maxWidth: 600, maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[.7rem] font-semibold tracking-[.1em]" style={{ fontFamily: "'Cinzel',serif", color: '#c8963e' }}>
                ASSET LIBRARY
              </div>
              <div className="flex gap-2">
                <label
                  className="cursor-pointer rounded border px-2 py-0.5 text-[.6rem] transition-all hover:bg-[rgba(200,150,62,.15)]"
                  style={{ fontFamily: "'Cinzel',serif", borderColor: 'rgba(200,150,62,.2)', color: '#c8963e' }}
                >
                  📤 Upload
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await fetch('/api/uploads', { method: 'POST', body: formData });
                        if (!res.ok) throw new Error('Upload failed');
                        const { url } = await res.json();
                        const name = file.name.replace(/\.[^.]+$/, '');
                        // Add to library
                        await fetch('/api/library', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name, url, category: 'object' }),
                        });
                        // Refresh library assets
                        const libRes = await fetch('/api/library');
                        if (libRes.ok) setLibraryAssets(await libRes.json());
                        showNotif(`Uploaded: ${name}`);
                      } catch {
                        showNotif('Upload failed');
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  className="cursor-pointer rounded border px-2 py-0.5 text-[.6rem] transition-all hover:bg-[rgba(200,150,62,.15)]"
                  style={{ fontFamily: "'Cinzel',serif", borderColor: 'rgba(200,150,62,.2)', color: '#c8963e' }}
                  onClick={() => setShowLibrary(false)}
                >
                  Close
                </button>
              </div>
            </div>
            {libraryAssets.length === 0 ? (
              <div className="py-6 text-center text-[.65rem]" style={{ color: 'rgba(212,196,160,.4)' }}>
                No assets yet. Click Upload to add your first asset.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 overflow-y-auto" style={{ maxHeight: '60vh' }}>
                {libraryAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="group cursor-pointer rounded border p-1 transition-all hover:border-[#c8963e] hover:bg-[rgba(200,150,62,.05)]"
                    style={{ borderColor: 'rgba(200,150,62,.15)' }}
                    onClick={() => {
                      const img = new Image();
                      img.onload = () => {
                        const id = uuidv4();
                        const aspect = img.naturalWidth / img.naturalHeight;
                        const w = Math.min(img.naturalWidth, 400);
                        const h = w / aspect;
                        // Place at center of current GM viewport
                        const wrap = wrapRef.current;
                        const vp = vpRef.current;
                        let cx = MAP_W / 2 - w / 2, cy = MAP_H / 2 - h / 2;
                        if (wrap) {
                          const center = screenToMap(wrap.offsetWidth / 2, wrap.offsetHeight / 2, vp);
                          cx = center.x - w / 2;
                          cy = center.y - h / 2;
                        }
                        const newObj: MapObject = {
                          id,
                          name: asset.name,
                          src: asset.url,
                          x: cx,
                          y: cy,
                          w,
                          h,
                          rotation: 0,
                          zIndex: objectsRef.current.length,
                          visible: true,
                          playerVisible: false,
                          locked: false,
                        };
                        objectImagesRef.current.set(id, img);
                        const updated = [...objectsRef.current, newObj];
                        objectsRef.current = updated;
                        setObjects(updated);
                        drawMap();
                        broadcastObjects(updated);
                        showNotif(`Added: ${asset.name}`);
                        setShowLibrary(false);
                      };
                      img.src = asset.url;
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.url} alt={asset.name} className="h-[60px] w-full rounded object-cover" />
                    <div className="mt-0.5 truncate text-[.55rem]" style={{ color: 'rgba(212,196,160,.6)' }}>
                      {asset.name}
                    </div>
                    {asset.is_global && (
                      <div className="text-[.45rem]" style={{ color: 'rgba(212,196,160,.3)' }}>Global</div>
                    )}
                  </div>
                ))}
              </div>
            )}
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

function drawGridLines(c: CanvasRenderingContext2D, gridSize: number, scale: number, color: string, opacity: number) {
  c.strokeStyle = hexToRgba(color, opacity);
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
