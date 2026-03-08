/**
 * Animated fog effect using simplex noise.
 * Renders realistic dark cloud/mist that drifts slowly over fogged areas.
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
 * Draws realistic dark cloud/mist in grayscale tones drifting slowly.
 * Uses compositing so the effect only shows where fog exists.
 */
export function renderAnimatedFog(
  ctx: CanvasRenderingContext2D,
  fogCanvas: HTMLCanvasElement,
  time: number,
  width: number,
  height: number,
): void {
  const CELL = 14;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);

  const mCtx = ensureMistCanvas(width, height);
  mCtx.clearRect(0, 0, width, height);

  // First draw the fog mask as the base — mist only appears where fog exists
  mCtx.globalCompositeOperation = 'source-over';
  mCtx.drawImage(fogCanvas, 0, 0);

  // Now draw mist using 'source-atop' so it only appears where the fog mask has pixels
  mCtx.globalCompositeOperation = 'source-atop';

  // Multiple slow drifting offsets for layered cloud movement
  const drift1x = time * 0.006;
  const drift1y = time * 0.003;
  const drift2x = time * -0.004;
  const drift2y = time * 0.005;
  const drift3x = time * 0.008;
  const drift3y = time * -0.002;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * CELL;
      const py = row * CELL;

      // Layer 1: large billowing clouds (low frequency, high influence)
      const n1 = fbm(col * 0.018 + drift1x, row * 0.018 + drift1y, 4);
      // Layer 2: medium wisps drifting opposite direction
      const n2 = fbm(col * 0.045 + drift2x, row * 0.045 + drift2y, 3);
      // Layer 3: fine detail turbulence
      const n3 = simplex2(col * 0.12 + drift3x, row * 0.12 + drift3y);

      // Combine: weighted blend of cloud layers
      const cloud = n1 * 0.55 + n2 * 0.30 + n3 * 0.15; // [-1, 1]

      // Map to grayscale brightness: dark fog base with lighter cloud highlights
      // cloud ~ -1 → very dark (near black), cloud ~ +1 → lighter gray wisps
      const brightness = Math.round(Math.max(0, Math.min(255, 18 + (cloud + 1) * 30))); // range ~18-78
      const alpha = 0.25 + cloud * 0.2; // ~0.05 to ~0.45

      if (alpha <= 0.03) continue;
      const a = Math.min(0.55, Math.max(0.03, alpha));

      mCtx.fillStyle = `rgba(${brightness},${brightness},${brightness + 3},${(a * 100 | 0) / 100})`;
      mCtx.fillRect(px, py, CELL, CELL);
    }
  }

  // Reset composite mode
  mCtx.globalCompositeOperation = 'source-over';

  // Draw the composed mist layer onto the main canvas
  ctx.drawImage(mistCanvas!, 0, 0);
}

/**
 * Lightweight animated fog for GM view — subtle gray variation so GM can see through.
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

  const driftX = time * 0.006;
  const driftY = time * 0.003;

  ctx.save();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * CELL;
      const py = row * CELL;

      const fogX = Math.min(px, fogCanvas.width - 1);
      const fogY = Math.min(py, fogCanvas.height - 1);
      const alphaIdx = (fogY * fogCanvas.width + fogX) * 4 + 3;
      if (fogData[alphaIdx] < 128) continue;

      const n = fbm(col * 0.025 + driftX, row * 0.025 + driftY, 2);
      const brightness = Math.round(Math.max(0, Math.min(60, 25 + n * 20)));
      ctx.fillStyle = `rgba(${brightness},${brightness},${brightness + 2},0.12)`;
      ctx.fillRect(px, py, CELL, CELL);
    }
  }
  ctx.restore();
}
