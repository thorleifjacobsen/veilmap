/**
 * Animated fog effect using simplex noise.
 * Renders a slow-moving mist pattern on the fog canvas.
 * Only visible where fog exists (alpha > 0 in the fog mask).
 */

// Simple 2D simplex noise implementation (no external deps)
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const grad3 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

// Permutation table
const perm = new Uint8Array(512);
const permMod8 = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 42;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807) % 2147483647;
    const j = seed % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod8[i] = perm[i] % 8;
  }
}

function simplex2(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    t0 *= t0;
    const gi = permMod8[ii + perm[jj]];
    n0 = t0 * t0 * (grad3[gi][0] * x0 + grad3[gi][1] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    t1 *= t1;
    const gi = permMod8[ii + i1 + perm[jj + j1]];
    n1 = t1 * t1 * (grad3[gi][0] * x1 + grad3[gi][1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    t2 *= t2;
    const gi = permMod8[ii + 1 + perm[jj + 1]];
    n2 = t2 * t2 * (grad3[gi][0] * x2 + grad3[gi][1] * y2);
  }
  return 70 * (n0 + n1 + n2); // Returns [-1, 1]
}

// Fractal Brownian motion for organic look
function fbm(x: number, y: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * simplex2(x * frequency, y * frequency);
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value;
}

// Offscreen canvas for compositing the mist effect
let mistCanvas: HTMLCanvasElement | null = null;
let mistCtx: CanvasRenderingContext2D | null = null;

function ensureMistCanvas(w: number, h: number) {
  if (!mistCanvas || mistCanvas.width !== w || mistCanvas.height !== h) {
    mistCanvas = document.createElement('canvas');
    mistCanvas.width = w;
    mistCanvas.height = h;
    mistCtx = mistCanvas.getContext('2d');
  }
  return mistCtx!;
}

/**
 * Render animated fog on the player display.
 * Draws swirling mist tendrils that are clearly visible over the fog areas.
 * Uses compositing so the effect only shows where fog exists.
 *
 * @param ctx - The canvas context to draw the mist onto (already in viewport transform)
 * @param fogCanvas - The fog mask canvas (opaque = fogged, transparent = revealed)
 * @param time - Current time in seconds (for animation)
 * @param width - Map width in map coordinates
 * @param height - Map height in map coordinates
 */
export function renderAnimatedFog(
  ctx: CanvasRenderingContext2D,
  fogCanvas: HTMLCanvasElement,
  time: number,
  width: number,
  height: number,
): void {
  const CELL = 16;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);

  const mCtx = ensureMistCanvas(width, height);
  mCtx.clearRect(0, 0, width, height);

  // First draw the fog mask as the base — mist only appears where fog exists
  mCtx.globalCompositeOperation = 'source-over';
  mCtx.drawImage(fogCanvas, 0, 0);

  // Now draw mist using 'source-atop' so it only appears where the fog mask has pixels
  mCtx.globalCompositeOperation = 'source-atop';

  // Slow drifting offsets for organic movement
  const drift1 = time * 0.012;
  const drift2 = time * 0.008;
  const drift3 = time * 0.018;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * CELL;
      const py = row * CELL;

      // Layer 1: large-scale swirls (low frequency, high amplitude)
      const n1 = fbm(col * 0.025 + drift1, row * 0.025 + drift2, 3);
      // Layer 2: medium detail wisps (different direction/speed)
      const n2 = fbm(col * 0.06 - drift2 * 1.3, row * 0.06 + drift3, 2);
      // Layer 3: fine sparkle/shimmer
      const n3 = simplex2(col * 0.15 + drift3 * 2, row * 0.15 - drift1 * 1.5);

      // Combine layers: base mist color with visible variation
      // Base fog is #1a1a2e (26, 26, 46) — we create lighter wisps over it
      const mistBright = n1 * 0.4 + n2 * 0.3 + n3 * 0.1; // [-0.8, 0.8]
      const alpha = 0.15 + mistBright * 0.25; // [~0.0, ~0.35]

      if (alpha <= 0.02) continue;

      // Lighter wisps: blend from deep blue to a ghostly blue-white
      const r = Math.round(40 + mistBright * 60);  // 10-70
      const g = Math.round(40 + mistBright * 60);  // 10-70
      const b = Math.round(65 + mistBright * 80);  // 25-105
      const a = Math.min(0.6, Math.max(0.03, alpha));

      mCtx.fillStyle = `rgba(${r},${g},${b},${(a * 100 | 0) / 100})`;
      mCtx.fillRect(px, py, CELL, CELL);
    }
  }

  // Reset composite mode
  mCtx.globalCompositeOperation = 'source-over';

  // Draw the composed mist layer onto the main canvas
  ctx.drawImage(mistCanvas!, 0, 0);
}

/**
 * Lightweight animated fog for GM view — just subtle variation, not full mist.
 * The GM needs to see through the fog, so this is much more subtle.
 */
export function renderAnimatedFogGM(
  ctx: CanvasRenderingContext2D,
  fogCanvas: HTMLCanvasElement,
  time: number,
  width: number,
  height: number,
): void {
  const CELL = 20;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);

  const fogCtx = fogCanvas.getContext('2d');
  if (!fogCtx) return;
  const fogData = fogCtx.getImageData(0, 0, fogCanvas.width, fogCanvas.height).data;

  const drift = time * 0.012;

  ctx.save();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * CELL;
      const py = row * CELL;

      const fogX = Math.min(px, fogCanvas.width - 1);
      const fogY = Math.min(py, fogCanvas.height - 1);
      const alphaIdx = (fogY * fogCanvas.width + fogX) * 4 + 3;
      if (fogData[alphaIdx] < 128) continue;

      const n = fbm(col * 0.03 + drift, row * 0.03 + drift * 0.7, 2);
      const variation = n * 20;
      const r = Math.round(Math.max(0, Math.min(255, 30 + variation)));
      const g = Math.round(Math.max(0, Math.min(255, 30 + variation)));
      const b = Math.round(Math.max(0, Math.min(255, 50 + variation * 1.2)));
      ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
      ctx.fillRect(px, py, CELL, CELL);
    }
  }
  ctx.restore();
}
