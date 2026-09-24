export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const len = (x: number, y: number): number => Math.hypot(x, y);
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

export function normalize(x: number, y: number): Vec2 {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

/**
 * Earliest intersection of segment p0→p1 with a circle. Returns t in [0,1] or -1.
 */
export function segmentCircle(
  x0: number, y0: number, x1: number, y1: number,
  cx: number, cy: number, r: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; // starts inside
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/** Closest distance from point to the segment p0→p1. */
export function pointSegmentDistance(
  px: number, py: number, x0: number, y0: number, x1: number, y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

/**
 * Slab test: segment p0→p1 against an AABB. Returns entry t in [0,1] and the hit normal, or null.
 */
export function segmentRect(
  x0: number, y0: number, x1: number, y1: number, r: Rect,
): { t: number; nx: number; ny: number } | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tmin = 0;
  let tmax = 1;
  let nx = 0;
  let ny = 0;

  if (Math.abs(dx) < 1e-9) {
    if (x0 < r.x || x0 > r.x + r.w) return null;
  } else {
    let t1 = (r.x - x0) / dx;
    let t2 = (r.x + r.w - x0) / dx;
    let n = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = n; ny = 0; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  if (Math.abs(dy) < 1e-9) {
    if (y0 < r.y || y0 > r.y + r.h) return null;
  } else {
    let t1 = (r.y - y0) / dy;
    let t2 = (r.y + r.h - y0) / dy;
    let n = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = n; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }

  return { t: tmin, nx, ny };
}

/** Pushes a circle out of a rect. Returns true if it collided. Mutates p. */
export function resolveCircleRect(p: Vec2, radius: number, r: Rect): boolean {
  const cx = clamp(p.x, r.x, r.x + r.w);
  const cy = clamp(p.y, r.y, r.y + r.h);
  let dx = p.x - cx;
  let dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * radius;
    p.y = cy + (dy / d) * radius;
    return true;
  }
  // Center is inside the rect: push out along the axis of least penetration.
  const left = p.x - r.x;
  const right = r.x + r.w - p.x;
  const top = p.y - r.y;
  const bottom = r.y + r.h - p.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) p.x = r.x - radius;
  else if (m === right) p.x = r.x + r.w + radius;
  else if (m === top) p.y = r.y - radius;
  else p.y = r.y + r.h + radius;
  dx = dy = 0;
  return true;
}

/** Small deterministic PRNG (mulberry32) so simulation randomness can be seeded in tests. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
