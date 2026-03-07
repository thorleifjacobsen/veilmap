// lib/fog-engine.ts
// All fog operations work on an offscreen canvas at map resolution.
// GM sees fog at reduced opacity, players see it at full opacity.

export const MAP_W = 2400;
export const MAP_H = 1600;

export function createFogCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MAP_W; c.height = MAP_H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#080710';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  return c;
}

export function paintReveal(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.globalCompositeOperation = 'destination-out';
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.3, 'rgba(0,0,0,1)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.75, 'rgba(0,0,0,0.5)');
  g.addColorStop(0.9, 'rgba(0,0,0,0.15)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

export function animateReveal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  onFrame?: () => void,
) {
  const duration = 300;
  const start = performance.now();
  const steps = 6;

  function frame(now: number) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (t > progress) break;
      const r = radius * (0.3 + t * 0.7);
      const alpha = 1 - t * 0.3;
      ctx.globalCompositeOperation = 'destination-out';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(0.5, `rgba(0,0,0,${alpha * 0.7})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    if (onFrame) onFrame();
    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

export function paintHide(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.fillStyle = '#080710';
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}

export function revealBox(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }) {
  ctx.globalCompositeOperation = 'destination-out';
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const r = Math.max(box.w, box.h) * 0.78;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.8, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(box.x - 6, box.y - 6, box.w + 12, box.h + 12);
  ctx.globalCompositeOperation = 'source-over';
}

export function fogToBase64(fogCanvas: HTMLCanvasElement): Promise<string> {
  return new Promise(resolve => {
    fogCanvas.toBlob(blob => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob!);
    }, 'image/png', 0.9);
  });
}

export function loadFogFromBase64(ctx: CanvasRenderingContext2D, base64: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, MAP_W, MAP_H); ctx.drawImage(img, 0, 0); resolve(); };
    img.src = 'data:image/png;base64,' + base64;
  });
}
