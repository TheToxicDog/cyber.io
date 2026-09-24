import { type Rect, resolveCircleRect } from './math.js';

/**
 * Cover materials (GDD §45). `resistance` is compared against a projectile's
 * remaining penetration. Anything >= 99 is effectively impenetrable.
 */
export type Material = 'glass' | 'drywall' | 'wood' | 'car' | 'concrete' | 'steel';

export const MATERIALS: Record<Material, { resistance: number; color: number; edge: number }> = {
  glass: { resistance: 0, color: 0x1b3a4a, edge: 0x7fe9ff },
  drywall: { resistance: 1, color: 0x2a2833, edge: 0x6b6680 },
  wood: { resistance: 2, color: 0x3a2a1c, edge: 0xb07a3f },
  car: { resistance: 3, color: 0x1d1f2b, edge: 0xff3fa4 },
  concrete: { resistance: 99, color: 0x22252c, edge: 0x4a505e },
  steel: { resistance: 99, color: 0x1a2129, edge: 0x5c7890 },
};

export interface Wall extends Rect {
  id: number;
  mat: Material;
  /** Destructible walls have hit points (GDD §46). */
  hp?: number;
}

export interface NeonSign {
  x: number;
  y: number;
  text: string;
  color: number;
  size: number;
  angle?: number;
}

export interface NeonStrip extends Rect {
  color: number;
}

export interface Puddle {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface ArenaMap {
  name: string;
  width: number;
  height: number;
  walls: Wall[];
  playerSpawns: { x: number; y: number }[];
  enemySpawns: { x: number; y: number }[];
  patrolPoints: { x: number; y: number }[];
  signs: NeonSign[];
  strips: NeonStrip[];
  puddles: Puddle[];
}

let nextId = 1;
const w = (x: number, y: number, ww: number, h: number, mat: Material, hp?: number): Wall => ({
  id: nextId++, x, y, w: ww, h, mat, ...(hp !== undefined ? { hp } : {}),
});

/**
 * COMBAT LAB — a rain-soaked Stacks parking lot behind a clinic (GDD §105 Phase 1).
 * One room, every cover material, a few destructibles, room for a Phase duel.
 */
export const ARENA: ArenaMap = {
  name: 'THE STACKS — LOT 17 (COMBAT LAB)',
  width: 2400,
  height: 1600,
  walls: [
    // Outer shell
    w(0, 0, 2400, 40, 'concrete'),
    w(0, 1560, 2400, 40, 'concrete'),
    w(0, 0, 40, 1600, 'concrete'),
    w(2360, 0, 40, 1600, 'concrete'),

    // Clinic back office: drywall, a glass window and a doorway
    w(200, 200, 500, 16, 'drywall', 220),
    w(200, 200, 16, 400, 'drywall', 220),
    w(200, 584, 300, 16, 'drywall', 220),
    w(600, 584, 100, 16, 'drywall', 220),
    w(684, 216, 16, 160, 'glass', 25),
    w(684, 376, 16, 224, 'drywall', 220),
    w(300, 300, 130, 50, 'wood', 160), // desk
    w(520, 470, 40, 90, 'wood', 120), // cabinet

    // Street cars
    w(1080, 720, 210, 92, 'car'),
    w(1520, 470, 92, 200, 'car'),
    w(560, 1060, 92, 200, 'car'),

    // Concrete pillars of the elevated highway overhead
    w(880, 380, 64, 64, 'concrete'),
    w(880, 1140, 64, 64, 'concrete'),
    w(1720, 1100, 64, 64, 'concrete'),
    w(1880, 330, 64, 64, 'concrete'),

    // Steel shipping containers
    w(1860, 760, 290, 112, 'steel'),
    w(260, 1150, 112, 290, 'steel'),

    // Wooden crates (destructible)
    w(720, 880, 48, 48, 'wood', 110),
    w(768, 880, 48, 48, 'wood', 110),
    w(720, 928, 48, 48, 'wood', 110),
    w(1320, 1250, 48, 48, 'wood', 110),
    w(2060, 1320, 48, 48, 'wood', 110),
    w(1360, 300, 48, 48, 'wood', 110),

    // Glass bus shelter + a drywall partition
    w(1040, 1000, 150, 12, 'glass', 25),
    w(1560, 1200, 16, 210, 'drywall', 220),

    // Jersey barriers
    w(600, 1380, 170, 30, 'concrete'),
    w(2040, 560, 30, 150, 'concrete'),
  ],
  playerSpawns: [
    { x: 130, y: 780 },
    { x: 130, y: 880 },
    { x: 230, y: 830 },
    { x: 230, y: 730 },
    { x: 130, y: 980 },
    { x: 230, y: 930 },
  ],
  enemySpawns: [
    { x: 2260, y: 180 },
    { x: 2260, y: 1440 },
    { x: 2240, y: 960 },
    { x: 1300, y: 140 },
    { x: 1400, y: 1470 },
  ],
  patrolPoints: [
    { x: 1250, y: 560 },
    { x: 1700, y: 900 },
    { x: 1250, y: 1150 },
    { x: 2000, y: 1200 },
    { x: 2050, y: 250 },
    { x: 1000, y: 250 },
    { x: 900, y: 800 },
  ],
  signs: [
    { x: 450, y: 170, text: 'RIPPERDOC · 24H', color: 0x3dfcff, size: 22 },
    { x: 1200, y: 70, text: 'AXIOM MERIDIAN — WE ALREADY KNOW', color: 0xff3fa4, size: 30 },
    { x: 2320, y: 800, text: 'NORTHSTAR FREIGHT', color: 0xffc23d, size: 22, angle: Math.PI / 2 },
    { x: 1200, y: 1530, text: 'CIVIC MESH · YOU ARE CONNECTED', color: 0x8a5cff, size: 22 },
  ],
  strips: [
    { x: 200, y: 196, w: 500, h: 4, color: 0x3dfcff },
    { x: 1860, y: 756, w: 290, h: 4, color: 0xffc23d },
    { x: 260, y: 1146, w: 112, h: 4, color: 0x8a5cff },
    { x: 40, y: 40, w: 2320, h: 3, color: 0xff3fa4 },
    { x: 40, y: 1557, w: 2320, h: 3, color: 0x3dfcff },
  ],
  puddles: [
    { x: 1000, y: 600, rx: 120, ry: 50 },
    { x: 1450, y: 900, rx: 170, ry: 70 },
    { x: 780, y: 1250, rx: 110, ry: 45 },
    { x: 1950, y: 1050, rx: 140, ry: 60 },
    { x: 1700, y: 250, rx: 100, ry: 40 },
    { x: 450, y: 800, rx: 90, ry: 40 },
  ],
};

export function wallById(map: ArenaMap, id: number): Wall | undefined {
  return map.walls.find((x) => x.id === id);
}

/**
 * Moves a circle out of all solid walls. Shared by server and client prediction
 * so both resolve collisions identically.
 */
export function collideCircle(
  map: ArenaMap,
  broken: ReadonlySet<number>,
  p: { x: number; y: number },
  radius: number,
): boolean {
  let hit = false;
  for (let iter = 0; iter < 3; iter++) {
    let any = false;
    for (const wall of map.walls) {
      if (broken.has(wall.id)) continue;
      if (resolveCircleRect(p, radius, wall)) any = true;
    }
    hit ||= any;
    if (!any) break;
  }
  return hit;
}
