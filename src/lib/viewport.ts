// lib/viewport.ts — pan/zoom math

export interface Viewport { x: number; y: number; scale: number; }

export function screenToMap(sx: number, sy: number, vp: Viewport) {
  return { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
}

export function mapToScreen(mx: number, my: number, vp: Viewport) {
  return { x: mx * vp.scale + vp.x, y: my * vp.scale + vp.y };
}

export function zoomAt(vp: Viewport, sx: number, sy: number, factor: number, min = 0.1, max = 8): Viewport {
  const newScale = Math.min(max, Math.max(min, vp.scale * factor));
  return {
    scale: newScale,
    x: sx - (sx - vp.x) * (newScale / vp.scale),
    y: sy - (sy - vp.y) * (newScale / vp.scale),
  };
}

export function fitToContainer(mapW: number, mapH: number, cW: number, cH: number): Viewport {
  const scale = Math.min(cW / mapW, cH / mapH) * 0.92;
  return { scale, x: (cW - mapW * scale) / 2, y: (cH - mapH * scale) / 2 };
}

export function applyViewport(ctx: CanvasRenderingContext2D, vp: Viewport) {
  ctx.setTransform(vp.scale, 0, 0, vp.scale, vp.x, vp.y);
}
