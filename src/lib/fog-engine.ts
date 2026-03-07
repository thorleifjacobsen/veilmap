// lib/fog-engine.ts
// All fog operations work on an offscreen canvas at map resolution.
// GM sees fog at reduced opacity, players see it at full opacity.

export const MAP_W = 7200;
export const MAP_H = 4800;

export function createFogCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MAP_W; c.height = MAP_H;
  const ctx = c.getContext('2d')!;
  // Base fog color — dark with slight blue tint
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  // Add visible fog texture — subtle swirl pattern
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * MAP_W;
    const y = Math.random() * MAP_H;
    const r = Math.random() * 80 + 20;
    const a = Math.random() * 0.08 + 0.02;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(40,38,70,${a})`);
    g.addColorStop(0.5, `rgba(30,28,55,${a * 0.5})`);
    g.addColorStop(1, 'rgba(26,26,46,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

export function revealAllFog(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, MAP_W, MAP_H);
}

export function paintReveal(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.globalCompositeOperation = 'destination-out';
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.2, 'rgba(0,0,0,1)');
  g.addColorStop(0.4, 'rgba(0,0,0,0.95)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.7)');
  g.addColorStop(0.78, 'rgba(0,0,0,0.35)');
  g.addColorStop(0.9, 'rgba(0,0,0,0.1)');
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
  const ANIMATION_DURATION_MS = 350;
  const duration = ANIMATION_DURATION_MS;
  const start = performance.now();

  function frame(now: number) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic for smoother reveal
    const ease = 1 - Math.pow(1 - progress, 3);
    const r = radius * (0.15 + ease * 0.85);

    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${0.6 + ease * 0.4})`);
    g.addColorStop(0.3, `rgba(0,0,0,${0.5 + ease * 0.5})`);
    g.addColorStop(0.6, `rgba(0,0,0,${0.2 + ease * 0.4})`);
    g.addColorStop(0.85, `rgba(0,0,0,${ease * 0.15})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    if (onFrame) onFrame();
    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

export function paintHide(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, '#1a1a2e');
  g.addColorStop(0.7, '#1a1a2e');
  g.addColorStop(1, 'rgba(26,26,46,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}

export function revealBox(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number; points?: { x: number; y: number }[] }) {
  ctx.globalCompositeOperation = 'destination-out';
  if (box.points && box.points.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(box.points[0].x, box.points[0].y);
    for (let i = 1; i < box.points.length; i++) {
      ctx.lineTo(box.points[i].x, box.points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
  } else {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const r = Math.max(box.w, box.h) * 0.78;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.8, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(box.x - 6, box.y - 6, box.w + 12, box.h + 12);
  }
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
