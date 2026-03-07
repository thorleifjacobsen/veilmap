/**
 * Animated fog effect using simplex noise.
 * Renders a slow-moving mist pattern on top of the base fog color.
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
  // Fisher-Yates shuffle with fixed seed
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

// Fractal Brownian motion for more organic look
function fbm(x: number, y: number, octaves: number = 3): number {
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

/**
 * Render animated fog noise onto a canvas context.
 * Only draws where the fog mask has opaque pixels (alpha > 0).
 * @param ctx - The fog overlay canvas context to draw on
 * @param fogCanvas - The underlying fog mask canvas (to check which areas have fog)
 * @param time - Current time in seconds (for animation)
 * @param width - Canvas width
 * @param height - Canvas height
 */
export function renderAnimatedFog(
  ctx: CanvasRenderingContext2D,
  fogCanvas: HTMLCanvasElement,
  time: number,
  width: number,
  height: number,
): void {
  // Sample fog mask at lower resolution for performance
  const SAMPLE_SIZE = 12; // pixels per noise cell (larger = faster)
  const cols = Math.ceil(width / SAMPLE_SIZE);
  const rows = Math.ceil(height / SAMPLE_SIZE);

  // Get fog mask pixel data at once (much faster than per-pixel getImageData)
  const fogCtx = fogCanvas.getContext('2d');
  if (!fogCtx) return;
  const fogData = fogCtx.getImageData(0, 0, fogCanvas.width, fogCanvas.height).data;

  // Slow drift
  const drift = time * 0.015;

  ctx.save();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const px = col * SAMPLE_SIZE;
      const py = row * SAMPLE_SIZE;

      // Check if fog exists at this position (sample center of cell in fog canvas)
      const fogX = Math.min(px, fogCanvas.width - 1);
      const fogY = Math.min(py, fogCanvas.height - 1);
      const alphaIdx = (fogY * fogCanvas.width + fogX) * 4 + 3;
      if (fogData[alphaIdx] < 128) continue; // No fog here, skip

      // Generate noise value
      const nx = col * 0.04 + drift;
      const ny = row * 0.04 + drift * 0.7;
      const noise = fbm(nx, ny, 2); // 2 octaves for perf

      // Map noise to subtle brightness variation
      // Base fog is #1a1a2e (26, 26, 46)
      // We add a subtle variation of ±15 brightness
      const variation = noise * 15;
      const r = Math.max(0, Math.min(255, 26 + variation));
      const g = Math.max(0, Math.min(255, 26 + variation));
      const b = Math.max(0, Math.min(255, 46 + variation * 1.2));

      ctx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},0.3)`;
      ctx.fillRect(px, py, SAMPLE_SIZE, SAMPLE_SIZE);
    }
  }
  ctx.restore();
}
