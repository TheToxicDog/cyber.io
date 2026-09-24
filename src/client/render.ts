import {
  type Application, ColorMatrixFilter, Container, Graphics, Sprite, Text, type Texture, TilingSprite,
} from 'pixi.js';
import { PLAYER_RADIUS } from '../shared/constants.js';
import { type ArenaMap, MATERIALS, type Wall } from '../shared/map.js';
import { clamp, lerp } from '../shared/math.js';
import type { AiState, LifeState, MeleePhase, NpcType } from '../shared/protocol.js';
import { STATUS } from '../shared/protocol.js';
import { WEAPONS, type WeaponId } from '../shared/weapons.js';
import { makeAsphaltTexture, makeGlowTexture, makeVignetteTexture } from './textures.js';

export interface ActorView {
  id: number;
  kind: 'player' | 'npc';
  npcType?: NpcType;
  name?: string;
  x: number;
  y: number;
  aim: number;
  color: number;
  self: boolean;
  phase: boolean;
  scale: number;
  weapon: WeaponId;
  blocking: boolean;
  melee: MeleePhase;
  crouch: boolean;
  life: LifeState;
  hp: number;
  maxHp: number;
  armor: number;
  ai?: AiState;
  awareness?: number;
  status: number;
  reviveP?: number;
  pvp?: boolean;
  hackTarget?: boolean;
}

export interface ProjView {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: WeaponId;
  enemy: boolean;
  deflected: boolean;
}

export interface NadeView {
  id: number;
  x: number;
  y: number;
  kind: 'frag' | 'emp';
  fuse: number;
}

export interface FrameView {
  actors: ActorView[];
  projectiles: ProjView[];
  nades: NadeView[];
  focusX: number;
  focusY: number;
  mouseX: number;
  mouseY: number;
  worldScale: number;
  localPhase: boolean;
  dragged: boolean;
  hacking: boolean;
  hackLines: { x0: number; y0: number; x1: number; y1: number; p: number }[];
  reticle: { spread: number; charge: number; reload: number; melee: boolean };
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  kind: 'spark' | 'blood' | 'smoke' | 'shard' | 'ring' | 'slash' | 'streak' | 'ember';
  add: boolean;
  a?: number;
  a2?: number;
  drag?: number;
  /** Real-time particle: ignores world time dilation (phase activation FX of the activator). */
  rt?: boolean;
}

interface ActorAnim {
  walk: number;
  lastX: number;
  lastY: number;
  moveDir: number;
  speed: number;
  trail: { x: number; y: number; aim: number; t: number }[];
  trailTimer: number;
  swingT: number;
  swingDur: number;
  swingHeavy: boolean;
  flash: number;
  seen: number;
}

interface DamageNumber {
  text: Text;
  x: number;
  y: number;
  vy: number;
  life: number;
}

const ENEMY_COLORS: Record<NpcType, { body: number; accent: number }> = {
  thug: { body: 0x4a2c3a, accent: 0xff7a3d },
  enforcer: { body: 0x3a4455, accent: 0xffc23d },
  operative: { body: 0x24242e, accent: 0xff4d5e },
};

/** Desaturate + tint matrix, blended toward identity by `k`. */
function timeMatrix(k: number, r: number, g: number, b: number, sat: number): number[] {
  const lr = 0.3;
  const lg = 0.59;
  const lb = 0.11;
  const s = 1 - (1 - sat) * k;
  const m = (mul: number) => lerp(1, mul, k);
  const row = (c: 0 | 1 | 2, mul: number) => {
    const base = [lr * (1 - s), lg * (1 - s), lb * (1 - s)];
    base[c]! += s;
    return [base[0]! * m(mul), base[1]! * m(mul), base[2]! * m(mul), 0, 0];
  };
  return [...row(0, r), ...row(1, g), ...row(2, b), 0, 0, 0, 1, 0];
}

export class Renderer {
  readonly world = new Container();
  private readonly scene = new Container();
  private readonly floor = new Container();
  private readonly decals = new Graphics();
  private readonly shadows = new Graphics();
  private readonly walls = new Graphics();
  private readonly neon = new Container();
  private readonly lights = new Container();
  private readonly actorsG = new Graphics();
  private readonly top = new Container();
  private readonly phaseActorsG = new Graphics();
  private readonly trailsG = new Graphics();
  private readonly projG = new Graphics();
  private readonly projGlow = new Container();
  private readonly fxAdd = new Graphics();
  private readonly fxNormal = new Graphics();
  private readonly labels = new Container();
  private readonly screen = new Container();
  private readonly screenG = new Graphics();
  private readonly rainG = new Graphics();
  private readonly vignette: Sprite;
  private readonly timeFilter = new ColorMatrixFilter();
  private readonly glowTex: Texture;
  private readonly glowPool: Sprite[] = [];
  private glowUsed = 0;
  private readonly particles: Particle[] = [];
  private readonly anims = new Map<number, ActorAnim>();
  private readonly projTrails = new Map<number, { x: number; y: number }[]>();
  private readonly names = new Map<number, Text>();
  private readonly dmgNumbers: DamageNumber[] = [];
  private readonly rain: { x: number; y: number; l: number; s: number }[] = [];
  private decalCount = 0;
  private brokenKey = '';
  private camX = 0;
  private camY = 0;
  private camInit = false;
  private zoom = 1;
  private trauma = 0;
  private flashAlpha = 0;
  private flashColor = 0xffffff;
  private chroma = 0;
  private timeK = 0;
  private timeTint: [number, number, number] = [0.85, 0.95, 1.2];
  private hitMarker = 0;
  private hitMarkerKind: 'hit' | 'head' | 'kill' = 'hit';
  private time = 0;
  showDamageNumbers = true;

  constructor(private readonly app: Application, private readonly map: ArenaMap) {
    this.glowTex = makeGlowTexture();
    this.vignette = new Sprite(makeVignetteTexture());

    this.scene.addChild(this.floor, this.decals, this.shadows, this.walls, this.lights, this.neon, this.actorsG);
    this.scene.filters = [this.timeFilter];
    this.projG.blendMode = 'add';
    this.projGlow.blendMode = 'add';
    this.fxAdd.blendMode = 'add';
    this.trailsG.blendMode = 'add';
    this.lights.blendMode = 'add';
    this.top.addChild(this.fxNormal, this.trailsG, this.phaseActorsG, this.projGlow, this.projG, this.fxAdd, this.labels);
    this.world.addChild(this.scene, this.top);
    this.screen.addChild(this.rainG, this.vignette, this.screenG);
    app.stage.addChild(this.world, this.screen);

    this.buildFloor();
    this.buildNeon();
    this.buildWalls(new Set());
    for (let i = 0; i < 220; i++) {
      this.rain.push({ x: Math.random(), y: Math.random(), l: 8 + Math.random() * 14, s: 0.7 + Math.random() * 0.6 });
    }
  }

  // ───────────────────────────── static layers ─────────────────────────────

  private buildFloor(): void {
    const m = this.map;
    const asphalt = new TilingSprite({ texture: makeAsphaltTexture(), width: m.width, height: m.height });
    this.floor.addChild(asphalt);
    const g = new Graphics();
    // Clinic floor tiles.
    g.rect(216, 216, 468, 368).fill({ color: 0x151a22 });
    for (let x = 216; x < 684; x += 36) g.moveTo(x, 216).lineTo(x, 584);
    for (let y = 216; y < 584; y += 36) g.moveTo(216, y).lineTo(684, y);
    g.stroke({ width: 1, color: 0x222a36, alpha: 0.8 });
    // Parking bay lines.
    for (let i = 0; i < 9; i++) {
      const x = 1000 + i * 120;
      g.rect(x, 1380, 4, 170).fill({ color: 0xc9a227, alpha: 0.28 });
      g.rect(x, 50, 4, 150).fill({ color: 0xc9a227, alpha: 0.28 });
    }
    // Road lane dashes.
    for (let x = 60; x < m.width - 60; x += 90) g.rect(x, 796, 44, 5).fill({ color: 0xe8e8e8, alpha: 0.12 });
    // Puddles: dark mirror with neon reflections.
    for (const p of m.puddles) {
      g.ellipse(p.x, p.y, p.rx, p.ry).fill({ color: 0x06080d, alpha: 0.75 });
      g.ellipse(p.x - p.rx * 0.2, p.y - p.ry * 0.25, p.rx * 0.55, p.ry * 0.35).fill({ color: 0x1b2a40, alpha: 0.5 });
    }
    // Manholes / drains.
    for (const [x, y] of [[1250, 420], [700, 760], [1800, 1350]] as const) {
      g.circle(x, y, 20).fill({ color: 0x0b0c10 }).stroke({ width: 2, color: 0x2a2f3a });
      for (let k = -12; k <= 12; k += 6) g.moveTo(x - 14, y + k).lineTo(x + 14, y + k);
      g.stroke({ width: 1.5, color: 0x1e222b });
    }
    this.floor.addChild(g);

    // Neon light pools on the ground (additive).
    const addLight = (x: number, y: number, color: number, r: number, a: number) => {
      const s = new Sprite(this.glowTex);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.tint = color;
      s.width = s.height = r * 2;
      s.alpha = a;
      this.lights.addChild(s);
    };
    for (const sgn of m.signs) addLight(sgn.x, sgn.y + (sgn.angle ? 0 : 50), sgn.color, 340, 0.35);
    for (const st of m.strips) {
      const steps = Math.max(1, Math.floor(Math.max(st.w, st.h) / 300));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        addLight(st.x + st.w * t, st.y + st.h * t, st.color, 160, 0.22);
      }
    }
    for (const p of m.puddles) {
      let best = m.signs[0]!;
      let bd = Infinity;
      for (const s of m.signs) {
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d < bd) { bd = d; best = s; }
      }
      addLight(p.x, p.y, best.color, p.rx * 1.1, 0.3);
    }
    // Street lamps.
    for (const [x, y] of [[1000, 700], [1650, 1000], [600, 1000], [1900, 500], [1300, 1400]] as const) {
      addLight(x, y, 0xffd9a0, 260, 0.2);
    }
  }

  private buildNeon(): void {
    for (const st of this.map.strips) {
      const g = new Graphics();
      g.rect(st.x, st.y, st.w, st.h).fill({ color: st.color });
      g.blendMode = 'add';
      const glow = new Graphics();
      glow.rect(st.x - 3, st.y - 3, st.w + 6, st.h + 6).fill({ color: st.color, alpha: 0.25 });
      glow.blendMode = 'add';
      this.neon.addChild(glow, g);
    }
    for (const s of this.map.signs) {
      const style = {
        fontFamily: 'Chakra Petch, sans-serif', fontSize: s.size, fontWeight: '700' as const,
        fill: s.color, letterSpacing: 4,
      };
      const glow = new Text({ text: s.text, style: { ...style, fill: s.color } });
      glow.anchor.set(0.5);
      glow.position.set(s.x, s.y);
      glow.rotation = s.angle ?? 0;
      glow.alpha = 0.45;
      glow.scale.set(1.04);
      glow.blendMode = 'add';
      const t = new Text({ text: s.text, style: { ...style, fill: 0xffffff } });
      t.anchor.set(0.5);
      t.position.set(s.x, s.y);
      t.rotation = s.angle ?? 0;
      t.tint = s.color;
      t.blendMode = 'add';
      this.neon.addChild(glow, t);
    }
  }

  private buildWalls(broken: ReadonlySet<number>): void {
    const g = this.walls;
    const sh = this.shadows;
    g.clear();
    sh.clear();
    const SX = 12;
    const SY = 16;
    for (const w of this.map.walls) {
      if (broken.has(w.id)) continue;
      if (w.mat !== 'glass') {
        sh.poly([w.x + w.w, w.y, w.x + w.w + SX, w.y + SY, w.x + w.w + SX, w.y + w.h + SY, w.x + SX, w.y + w.h + SY, w.x, w.y + w.h, w.x + w.w, w.y + w.h])
          .fill({ color: 0x000000, alpha: 0.45 });
      }
    }
    for (const w of this.map.walls) {
      if (broken.has(w.id)) continue;
      this.drawWall(g, w);
    }
  }

  private drawWall(g: Graphics, w: Wall): void {
    const mat = MATERIALS[w.mat];
    switch (w.mat) {
      case 'glass':
        g.rect(w.x, w.y, w.w, w.h).fill({ color: mat.color, alpha: 0.45 }).stroke({ width: 1.5, color: mat.edge, alpha: 0.8 });
        g.moveTo(w.x + 3, w.y + 3).lineTo(w.x + Math.min(w.w, 12), w.y + Math.min(w.h, 12)).stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
        break;
      case 'car': {
        g.roundRect(w.x, w.y, w.w, w.h, 14).fill({ color: mat.color }).stroke({ width: 2, color: mat.edge, alpha: 0.7 });
        const horiz = w.w > w.h;
        if (horiz) {
          g.roundRect(w.x + w.w * 0.28, w.y + 8, w.w * 0.42, w.h - 16, 8).fill({ color: 0x0c1824 }).stroke({ width: 1, color: 0x4bd5ff, alpha: 0.4 });
          g.rect(w.x + w.w - 6, w.y + 8, 4, 16).fill({ color: 0xfff3c0 });
          g.rect(w.x + w.w - 6, w.y + w.h - 24, 4, 16).fill({ color: 0xfff3c0 });
          g.rect(w.x + 2, w.y + 8, 4, 14).fill({ color: 0xff2040 });
          g.rect(w.x + 2, w.y + w.h - 22, 4, 14).fill({ color: 0xff2040 });
        } else {
          g.roundRect(w.x + 8, w.y + w.h * 0.28, w.w - 16, w.h * 0.42, 8).fill({ color: 0x0c1824 }).stroke({ width: 1, color: 0x4bd5ff, alpha: 0.4 });
          g.rect(w.x + 8, w.y + 2, 16, 4).fill({ color: 0xfff3c0 });
          g.rect(w.x + w.w - 24, w.y + 2, 16, 4).fill({ color: 0xfff3c0 });
          g.rect(w.x + 8, w.y + w.h - 6, 14, 4).fill({ color: 0xff2040 });
          g.rect(w.x + w.w - 22, w.y + w.h - 6, 14, 4).fill({ color: 0xff2040 });
        }
        break;
      }
      case 'wood': {
        g.rect(w.x, w.y, w.w, w.h).fill({ color: mat.color }).stroke({ width: 2, color: mat.edge, alpha: 0.6 });
        if (w.w <= 60 && w.h <= 60) {
          g.moveTo(w.x + 4, w.y + 4).lineTo(w.x + w.w - 4, w.y + w.h - 4)
            .moveTo(w.x + w.w - 4, w.y + 4).lineTo(w.x + 4, w.y + w.h - 4)
            .stroke({ width: 2, color: mat.edge, alpha: 0.35 });
        } else {
          for (let y = w.y + 10; y < w.y + w.h; y += 10) g.moveTo(w.x + 2, y).lineTo(w.x + w.w - 2, y);
          g.stroke({ width: 1, color: 0x000000, alpha: 0.35 });
        }
        break;
      }
      case 'steel': {
        g.rect(w.x, w.y, w.w, w.h).fill({ color: mat.color }).stroke({ width: 2, color: mat.edge, alpha: 0.7 });
        const horiz = w.w > w.h;
        const n = Math.floor((horiz ? w.w : w.h) / 14);
        for (let i = 1; i < n; i++) {
          if (horiz) g.moveTo(w.x + i * 14, w.y + 4).lineTo(w.x + i * 14, w.y + w.h - 4);
          else g.moveTo(w.x + 4, w.y + i * 14).lineTo(w.x + w.w - 4, w.y + i * 14);
        }
        g.stroke({ width: 1, color: 0x2f3d4c, alpha: 0.9 });
        break;
      }
      case 'drywall':
        g.rect(w.x, w.y, w.w, w.h).fill({ color: mat.color }).stroke({ width: 1, color: mat.edge, alpha: 0.7 });
        break;
      default:
        g.rect(w.x, w.y, w.w, w.h).fill({ color: mat.color }).stroke({ width: 2, color: mat.edge, alpha: 0.5 });
        g.rect(w.x + 4, w.y + 4, w.w - 8, w.h - 8).stroke({ width: 1, color: 0x000000, alpha: 0.3 });
    }
  }

  setBroken(broken: ReadonlySet<number>): void {
    const key = [...broken].sort((a, b) => a - b).join(',');
    if (key === this.brokenKey) return;
    this.brokenKey = key;
    this.buildWalls(broken);
  }

  // ───────────────────────────── effects API ─────────────────────────────

  private spawn(p: Particle): void {
    if (this.particles.length > 1400) this.particles.shift();
    this.particles.push(p);
  }

  muzzle(x: number, y: number, a: number, color: number, big: boolean): void {
    for (let i = 0; i < (big ? 10 : 5); i++) {
      const aa = a + (Math.random() - 0.5) * 0.6;
      const sp = 300 + Math.random() * 500;
      this.spawn({ x, y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: 0.08, max: 0.08, size: 2, color, kind: 'spark', add: true });
    }
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.06, max: 0.06, size: big ? 46 : 30, color, kind: 'ember', add: true });
    // Ejected casing.
    const ca = a + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    this.spawn({ x, y, vx: Math.cos(ca) * 160, vy: Math.sin(ca) * 160, life: 0.5, max: 0.5, size: 2, color: 0xd9b25a, kind: 'shard', add: false, drag: 4 });
    this.spawn({ x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, life: 0.5, max: 0.5, size: 10, color: 0x8a90a0, kind: 'smoke', add: false, drag: 2 });
  }

  impact(x: number, y: number, nx: number, ny: number, mat: string): void {
    const base = Math.atan2(ny || -1, nx);
    const color = mat === 'glass' ? 0x9ff4ff : mat === 'wood' ? 0xd9a066 : mat === 'car' ? 0xff9ad0 : 0xfff0c0;
    const n = mat === 'glass' ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * 2.2;
      const sp = 120 + Math.random() * 380;
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.25 + Math.random() * 0.2, max: 0.45,
        size: mat === 'glass' ? 3 : 1.8, color, kind: mat === 'glass' ? 'shard' : 'spark', add: mat !== 'glass', drag: 5,
      });
    }
    this.spawn({ x, y, vx: nx * 30, vy: ny * 30, life: 0.6, max: 0.6, size: 12, color: 0x6a6f7a, kind: 'smoke', add: false, drag: 2 });
    this.decal(x, y, 2.4, 0x050507, 0.8);
  }

  blood(x: number, y: number, dirX: number, dirY: number, armor: boolean, heavy: boolean): void {
    const base = Math.atan2(dirY, dirX);
    const n = heavy ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * 1.2;
      const sp = 100 + Math.random() * (heavy ? 500 : 300);
      if (armor) {
        this.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.2, max: 0.2, size: 2, color: 0x9fd0ff, kind: 'spark', add: true, drag: 3 });
      } else {
        this.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, max: 0.35, size: 2.5 + Math.random() * 2, color: 0xb0123a, kind: 'blood', add: false, drag: 6 });
      }
    }
    if (!armor) this.decal(x + dirX * 18, y + dirY * 18, 5 + Math.random() * 7, 0x4a0718, 0.7);
  }

  explosion(x: number, y: number, r: number, kind: 'frag' | 'emp'): void {
    const color = kind === 'emp' ? 0x5ca8ff : 0xff9a3d;
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size: r, color, kind: 'ring', add: true });
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: r * 1.6, color, kind: 'ember', add: true });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 150 + Math.random() * 600;
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.5, max: 0.8,
        size: 2 + Math.random() * 2, color: kind === 'emp' ? 0xbfe2ff : 0xffd080, kind: kind === 'emp' ? 'streak' : 'spark', add: true, drag: 3,
      });
    }
    if (kind === 'frag') {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        this.spawn({ x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 1.4, max: 1.4, size: 26 + Math.random() * 20, color: 0x2a2a30, kind: 'smoke', add: false, drag: 1.5 });
      }
      this.decal(x, y, r * 0.4, 0x050505, 0.6);
    }
  }

  wallBroken(w: Wall): void {
    const cx = w.x + w.w / 2;
    const cy = w.y + w.h / 2;
    const color = w.mat === 'glass' ? 0x9ff4ff : w.mat === 'wood' ? 0x8a5a30 : 0x6b6680;
    const n = Math.min(60, Math.floor((w.w + w.h) / 3));
    for (let i = 0; i < n; i++) {
      const x = w.x + Math.random() * w.w;
      const y = w.y + Math.random() * w.h;
      const a = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5);
      const sp = 60 + Math.random() * 300;
      this.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8, max: 0.8, size: 2 + Math.random() * 3, color, kind: 'shard', add: false, drag: 4 });
    }
    this.spawn({ x: cx, y: cy, vx: 0, vy: 0, life: 1, max: 1, size: Math.max(w.w, w.h) * 0.6, color: 0x55545e, kind: 'smoke', add: false, drag: 1 });
    // Debris decal where it stood.
    for (let i = 0; i < 8; i++) this.decal(w.x + Math.random() * w.w, w.y + Math.random() * w.h, 3 + Math.random() * 4, w.mat === 'glass' ? 0x5fb9cc : 0x2a2024, 0.5);
  }

  phaseBurst(x: number, y: number, color: number, self: boolean): void {
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 260, color, kind: 'ring', add: true, rt: true });
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 120, color: 0xffffff, kind: 'ring', add: true, rt: true });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.spawn({ x, y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.3, max: 0.3, size: 2, color, kind: 'streak', add: true, rt: true });
    }
    if (self) {
      this.chroma = 1;
      this.flash(color, 0.35);
      this.shake(0.35);
    }
  }

  phaseEnd(x: number, y: number, color: number, self: boolean): void {
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 90, color, kind: 'ring', add: true, rt: true });
    if (self) this.chroma = 0.5;
  }

  dash(x: number, y: number, dx: number, dy: number, color: number): void {
    for (let i = 0; i < 8; i++) {
      this.spawn({
        x: x - dx * i * 6, y: y - dy * i * 6, vx: -dx * 80 + (Math.random() - 0.5) * 60, vy: -dy * 80 + (Math.random() - 0.5) * 60,
        life: 0.25, max: 0.25, size: 2, color, kind: 'streak', add: true,
      });
    }
  }

  swing(id: number, heavy: boolean, scale: number): void {
    const a = this.anims.get(id);
    if (!a) return;
    a.swingT = 0;
    a.swingDur = (heavy ? 0.22 : 0.14) / Math.max(scale, 0.05);
    a.swingHeavy = heavy;
  }

  slashArc(x: number, y: number, aim: number, heavy: boolean, color: number): void {
    this.spawn({ x, y, vx: 0, vy: 0, life: heavy ? 0.22 : 0.15, max: heavy ? 0.22 : 0.15, size: heavy ? 96 : 78, color, kind: 'slash', add: true, a: aim, a2: heavy ? 2.6 : 1.9 });
  }

  parry(x: number, y: number): void {
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 50, color: 0xffffff, kind: 'ring', add: true });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({ x, y, vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, life: 0.18, max: 0.18, size: 2, color: 0xfff6a0, kind: 'streak', add: true });
    }
  }

  hackPulse(x: number, y: number): void {
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.4, max: 0.4, size: 44, color: 0x7dff9a, kind: 'ring', add: true });
    for (let i = 0; i < 10; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30, vx: 0, vy: -40 - Math.random() * 60,
        life: 0.5, max: 0.5, size: 3, color: 0x7dff9a, kind: 'shard', add: true,
      });
    }
  }

  damageNumber(x: number, y: number, n: number, head: boolean, kill: boolean): void {
    if (!this.showDamageNumbers) return;
    const t = new Text({
      text: String(n),
      style: {
        fontFamily: 'JetBrains Mono, monospace', fontSize: head || kill ? 20 : 15, fontWeight: '700',
        fill: kill ? 0xff4d5e : head ? 0xffe04a : 0xffffff, stroke: { color: 0x000000, width: 3 },
      },
    });
    t.anchor.set(0.5);
    this.labels.addChild(t);
    this.dmgNumbers.push({ text: t, x: x + (Math.random() - 0.5) * 16, y: y - 20, vy: -70, life: 0.8 });
    if (this.dmgNumbers.length > 40) {
      const old = this.dmgNumbers.shift()!;
      old.text.destroy();
    }
  }

  markHit(kind: 'hit' | 'head' | 'kill'): void {
    this.hitMarker = 1;
    if (kind === 'kill' || this.hitMarkerKind !== 'kill' || this.hitMarker <= 0) this.hitMarkerKind = kind;
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  flash(color: number, alpha: number): void {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  private decal(x: number, y: number, r: number, color: number, alpha: number): void {
    if (this.decalCount > 600) {
      this.decals.clear();
      this.decalCount = 0;
    }
    this.decals.circle(x, y, r).fill({ color, alpha });
    this.decalCount++;
  }

  // ───────────────────────────── per-frame ─────────────────────────────

  render(v: FrameView, dt: number): void {
    this.time += dt;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const visScale = v.worldScale;

    // Camera: look ahead toward the cursor (GDD §4), punch-in during Phase.
    const targetZoom = v.localPhase ? 1.07 : 1;
    this.zoom = lerp(this.zoom, targetZoom, Math.min(1, dt * 6));
    const lookX = clamp((v.mouseX - W / 2) * 0.32, -300, 300);
    const lookY = clamp((v.mouseY - H / 2) * 0.32, -220, 220);
    const tx = v.focusX + lookX;
    const ty = v.focusY + lookY;
    const follow = Math.min(1, dt * 10);
    if (!this.camInit) {
      this.camX = tx;
      this.camY = ty;
      this.camInit = true;
    }
    this.camX = lerp(this.camX, tx, follow);
    this.camY = lerp(this.camY, ty, follow);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * 16;
    const sx = (Math.random() - 0.5) * sh;
    const sy = (Math.random() - 0.5) * sh;
    this.world.scale.set(this.zoom);
    this.world.position.set(W / 2 - this.camX * this.zoom + sx, H / 2 - this.camY * this.zoom + sy);

    // Time-layer color grading (GDD §104).
    const wantK = v.localPhase ? 1 : v.dragged ? 0.65 : 0;
    this.timeK = lerp(this.timeK, wantK, Math.min(1, dt * (wantK > this.timeK ? 18 : 8)));
    if (v.localPhase) this.timeTint = [0.8, 0.95, 1.25];
    else if (v.dragged) this.timeTint = [1.15, 0.75, 1.1];
    const hackK = v.hacking ? 0.35 : 0;
    const k = Math.max(this.timeK, hackK);
    const tint = this.timeK >= hackK ? this.timeTint : ([0.8, 1.15, 0.9] as [number, number, number]);
    this.timeFilter.matrix = timeMatrix(k, tint[0], tint[1], tint[2], 0.25) as never;

    this.drawActors(v, dt);
    this.drawProjectiles(v, dt);
    this.drawNades(v);
    this.updateParticles(dt, visScale);
    this.drawScreen(v, dt, W, H);
    this.updateLabels(v, dt);
  }

  private anim(a: ActorView): ActorAnim {
    let s = this.anims.get(a.id);
    if (!s) {
      s = { walk: 0, lastX: a.x, lastY: a.y, moveDir: a.aim, speed: 0, trail: [], trailTimer: 0, swingT: 99, swingDur: 0.14, swingHeavy: false, flash: 0, seen: 0 };
      this.anims.set(a.id, s);
    }
    return s;
  }

  flashActor(id: number): void {
    const a = this.anims.get(id);
    if (a) a.flash = 1;
  }

  private drawActors(v: FrameView, dt: number): void {
    const g = this.actorsG;
    const pg = this.phaseActorsG;
    const tg = this.trailsG;
    g.clear();
    pg.clear();
    tg.clear();
    const seen = new Set<number>();

    // Dead NPCs first (corpses under everything).
    const order = [...v.actors].sort((a, b) => Number(b.life === 'dead') - Number(a.life === 'dead'));
    for (const a of order) {
      seen.add(a.id);
      const s = this.anim(a);
      const dx = a.x - s.lastX;
      const dy = a.y - s.lastY;
      const moved = Math.hypot(dx, dy);
      s.speed = lerp(s.speed, dt > 0 ? moved / dt : 0, 0.3);
      if (moved > 0.3) s.moveDir = Math.atan2(dy, dx);
      s.walk += moved * 0.09;
      s.lastX = a.x;
      s.lastY = a.y;
      s.flash = Math.max(0, s.flash - dt * 8);
      s.swingT += dt;

      // Afterimages while in the fast time layer.
      s.trailTimer -= dt;
      if (a.phase && s.trailTimer <= 0 && a.life === 'alive') {
        s.trail.push({ x: a.x, y: a.y, aim: a.aim, t: 0 });
        s.trailTimer = 0.035;
        if (s.trail.length > 10) s.trail.shift();
      }
      for (const tr of s.trail) tr.t += dt;
      s.trail = s.trail.filter((tr) => tr.t < 0.35);
      for (const tr of s.trail) {
        const al = (1 - tr.t / 0.35) * 0.35;
        this.drawBody(tg, { ...a, x: tr.x, y: tr.y, aim: tr.aim }, s, al, true);
      }

      // Actors inside the fast time layer are drawn above the graded scene in full color.
      const target = a.phase ? pg : g;
      this.drawBody(target, a, s, 1, false);
    }
    for (const id of this.anims.keys()) if (!seen.has(id)) this.anims.delete(id);
  }

  private drawBody(g: Graphics, a: ActorView, s: ActorAnim, alpha: number, ghost: boolean): void {
    const npc = a.kind === 'npc' ? ENEMY_COLORS[a.npcType ?? 'thug'] : null;
    const body = npc ? npc.body : 0x2c3850;
    const accent = npc ? npc.accent : a.color;
    const r = PLAYER_RADIUS * (a.npcType === 'enforcer' ? 1.12 : 1);
    const { x, y, aim } = a;

    if (ghost) {
      g.circle(x, y, r).fill({ color: accent, alpha: alpha * 0.6 });
      return;
    }

    if (a.life === 'dead') {
      g.ellipse(x + 3, y + 3, r * 1.3, r * 0.8).fill({ color: 0x3a0612, alpha: 0.6 });
      rotEllipse(g, x, y, r * 1.1, r * 0.55, aim + Math.PI / 2, body, 0.9);
      g.circle(x + Math.cos(aim) * 10, y + Math.sin(aim) * 10, 6).fill({ color: 0x202020 });
      return;
    }

    const crouch = a.crouch ? 0.88 : 1;
    // Long shadow + team-colored ground ring so characters always read against the busy city.
    g.ellipse(x + 6, y + 8, r * 1.05, r * 0.85).fill({ color: 0x000000, alpha: 0.45 * alpha });
    g.circle(x, y, r + 7).fill({ color: accent, alpha: 0.1 * alpha }).stroke({ width: 1, color: accent, alpha: 0.35 * alpha });

    if (a.life === 'downed') {
      rotEllipse(g, x, y, r * 1.1, r * 0.6, aim + Math.PI / 2, body, alpha);
      g.circle(x, y, r + 6).stroke({ width: 2, color: 0xff4d5e, alpha: 0.5 + 0.4 * Math.sin(this.time * 8) });
      if (a.reviveP && a.reviveP > 0) {
        arcPath(g, x, y, r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * a.reviveP).stroke({ width: 3, color: 0x7dff9a });
      }
      return;
    }

    // Legs follow movement direction, torso follows aim (GDD §103).
    const md = s.moveDir;
    const stride = Math.sin(s.walk) * Math.min(1, s.speed / 150) * 7;
    const px = -Math.sin(md);
    const py = Math.cos(md);
    const fx = Math.cos(md);
    const fy = Math.sin(md);
    for (const side of [-1, 1]) {
      const off = stride * side;
      g.circle(x + px * 6 * side + fx * off, y + py * 6 * side + fy * off, 5 * crouch).fill({ color: 0x0b0d12, alpha });
    }

    // Weapon / arms.
    this.drawWeapon(g, a, s, accent, alpha);

    // Torso.
    const torsoW = (a.npcType === 'enforcer' ? 18 : 15) * crouch;
    rotEllipse(g, x, y, torsoW, 9.5 * crouch, aim, body, alpha);
    const outline = a.pvp && !a.self ? 0xff4d5e : accent;
    rotEllipseStroke(g, x, y, torsoW, 9.5 * crouch, aim, outline, s.flash > 0 ? 3 : 1.8, alpha * 0.95);
    if (a.npcType === 'enforcer') {
      rotEllipse(g, x - Math.cos(aim) * 2, y - Math.sin(aim) * 2, 12, 6, aim, 0x3a4658, alpha);
    }
    // Head + visor.
    const hx = x + Math.cos(aim) * 1.5;
    const hy = y + Math.sin(aim) * 1.5;
    g.circle(hx, hy, 7.5 * crouch).fill({ color: a.npcType === 'operative' ? 0x15151c : 0x46505f, alpha });
    arcPath(g, hx, hy, 6.5, aim - 0.7, aim + 0.7).stroke({ width: 2.5, color: accent, alpha });
    if (s.flash > 0) g.circle(x, y, r).fill({ color: 0xffffff, alpha: s.flash * 0.5 });

    // Fast-layer emphasis: bright rim (GDD §104).
    if (a.phase) {
      g.circle(x, y, r + 5).stroke({ width: 2, color: accent, alpha: 0.9 });
      g.circle(x, y, r + 9).stroke({ width: 1, color: 0xffffff, alpha: 0.35 + 0.25 * Math.sin(this.time * 20) });
    }

    this.drawStatus(g, a, r);

    // NPC awareness meter + health.
    if (a.kind === 'npc' && a.ai) {
      const aw = a.awareness ?? 0;
      if (a.ai === 'combat' || a.ai === 'alert') {
        g.poly([x - 4, y - r - 22, x + 4, y - r - 22, x + 1.5, y - r - 11, x - 1.5, y - r - 11]).fill({ color: 0xff4d5e });
        g.circle(x, y - r - 7, 2).fill({ color: 0xff4d5e });
      } else if (aw > 0.02) {
        arcPath(g, x, y - r - 12, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * aw).stroke({ width: 2.5, color: 0xffc23d });
      }
      if (a.hp < a.maxHp) {
        const w = 34;
        g.rect(x - w / 2, y + r + 8, w, 3).fill({ color: 0x000000, alpha: 0.6 });
        g.rect(x - w / 2, y + r + 8, (w * a.hp) / a.maxHp, 3).fill({ color: 0xff3f6c });
        if (a.armor > 0) g.rect(x - w / 2, y + r + 12, Math.min(w, (w * a.armor) / 90), 2).fill({ color: 0x5ca8ff });
      }
    }
    if (a.hackTarget) {
      const k = 22 + Math.sin(this.time * 10) * 2;
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        g.moveTo(x + cx * k, y + cy * k).lineTo(x + cx * (k - 8), y + cy * k)
          .moveTo(x + cx * k, y + cy * k).lineTo(x + cx * k, y + cy * (k - 8));
      }
      g.stroke({ width: 2, color: 0x7dff9a });
    }
  }

  private drawWeapon(g: Graphics, a: ActorView, s: ActorAnim, accent: number, alpha: number): void {
    const { x, y, aim } = a;
    const def = WEAPONS[a.weapon];
    const perpX = -Math.sin(aim);
    const perpY = Math.cos(aim);
    if (def.kind === 'melee') {
      let bladeAng = aim + 1.1;
      let len = 46;
      if (a.blocking) {
        bladeAng = aim + Math.PI / 2;
        len = 40;
      } else if (s.swingT < s.swingDur) {
        const t = s.swingT / s.swingDur;
        const arc = s.swingHeavy ? 2.6 : 1.9;
        bladeAng = aim - arc / 2 + arc * easeOut(t);
      } else if (a.melee === 'charging' || a.melee === 'windup') {
        bladeAng = aim - 1.3;
      }
      const hx = x + Math.cos(aim) * 12 + perpX * 6;
      const hy = y + Math.sin(aim) * 12 + perpY * 6;
      const bx = hx + Math.cos(bladeAng) * len;
      const by = hy + Math.sin(bladeAng) * len;
      g.moveTo(x + perpX * 8, y + perpY * 8).lineTo(hx, hy).stroke({ width: 5, color: 0x11141b, alpha });
      g.moveTo(hx, hy).lineTo(bx, by).stroke({ width: 5, color: accent, alpha: 0.35 * alpha });
      g.moveTo(hx, hy).lineTo(bx, by).stroke({ width: 2, color: 0xffffff, alpha });
      if (a.melee === 'charging') g.circle(hx, hy, 5).fill({ color: accent, alpha: 0.4 + 0.4 * Math.sin(this.time * 30) });
      return;
    }
    const len = a.weapon === 'lance' ? 36 : a.weapon === 'breaker' || a.weapon === 'enforcerShotgun' ? 30 : a.weapon === 'operativeSmg' ? 26 : 20;
    const two = len > 22;
    const gx0 = x + Math.cos(aim) * 8 + perpX * (two ? 3 : 6);
    const gy0 = y + Math.sin(aim) * 8 + perpY * (two ? 3 : 6);
    const gx1 = gx0 + Math.cos(aim) * len;
    const gy1 = gy0 + Math.sin(aim) * len;
    g.moveTo(x + perpX * 9, y + perpY * 9).lineTo(gx0, gy0).stroke({ width: 4, color: 0x11141b, alpha });
    if (two) g.moveTo(x - perpX * 9, y - perpY * 9).lineTo(gx0 + Math.cos(aim) * 12, gy0 + Math.sin(aim) * 12).stroke({ width: 4, color: 0x11141b, alpha });
    g.moveTo(gx0, gy0).lineTo(gx1, gy1).stroke({ width: a.weapon === 'lance' ? 6 : 5, color: 0x0d0f14, alpha });
    g.moveTo(gx0 + Math.cos(aim) * 4, gy0 + Math.sin(aim) * 4).lineTo(gx1, gy1).stroke({ width: 1.5, color: a.weapon === 'lance' ? 0x7ff6ff : accent, alpha: 0.8 * alpha });
  }

  private drawStatus(g: Graphics, a: ActorView, r: number): void {
    const { x, y, status } = a;
    if (!status) return;
    if (status & STATUS.OPTIC_JAM) {
      for (let i = 0; i < 5; i++) {
        const ox = (Math.random() - 0.5) * 20;
        const oy = (Math.random() - 0.5) * 12;
        g.rect(x + ox, y - 4 + oy, 4, 2).fill({ color: 0x3dfcff, alpha: 0.9 });
      }
    }
    if (status & STATUS.MOTOR_LOCK) g.circle(x, y, r + 3).stroke({ width: 2, color: 0x8a5cff, alpha: 0.8 });
    if (status & STATUS.WEAPON_FAULT) {
      const gx = x + Math.cos(a.aim) * 30;
      const gy = y + Math.sin(a.aim) * 30;
      g.circle(gx, gy, 3 + Math.random() * 3).fill({ color: 0xffc23d, alpha: 0.9 });
    }
    if (status & STATUS.OVERHEAT) g.circle(x, y, r + 2 + Math.random() * 3).fill({ color: 0xff7a3d, alpha: 0.18 });
    if (status & STATUS.EMP_LOCK) {
      for (let i = 0; i < 3; i++) {
        const an = Math.random() * Math.PI * 2;
        g.moveTo(x + Math.cos(an) * r, y + Math.sin(an) * r)
          .lineTo(x + Math.cos(an + 0.3) * (r + 10), y + Math.sin(an + 0.3) * (r + 10))
          .stroke({ width: 1.5, color: 0x9fd0ff });
      }
    }
    if (status & STATUS.STAGGER) {
      for (let i = 0; i < 3; i++) {
        const an = this.time * 6 + (i * Math.PI * 2) / 3;
        g.circle(x + Math.cos(an) * 12, y - r - 6 + Math.sin(an) * 4, 2).fill({ color: 0xfff6a0 });
      }
    }
  }

  private drawProjectiles(v: FrameView, dt: number): void {
    const g = this.projG;
    g.clear();
    this.glowUsed = 0;
    const slow = v.worldScale < 1;
    const live = new Set<number>();
    for (const p of v.projectiles) {
      live.add(p.id);
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const ux = p.vx / sp;
      const uy = p.vy / sp;
      const color = p.deflected ? 0xff3fa4 : p.enemy ? 0xff4d5e : WEAPONS[p.w].kind === 'gun' ? (WEAPONS[p.w] as { color: number }).color : 0xffffff;
      const lance = p.w === 'lance';

      // Motion trail history (suspended projectiles are highly visible in slowed time).
      let trail = this.projTrails.get(p.id);
      if (!trail) {
        trail = [];
        this.projTrails.set(p.id, trail);
      }
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 6) trail.push({ x: p.x, y: p.y });
      if (trail.length > 14) trail.shift();

      const tracer = Math.min(lance ? 140 : 70, sp * v.worldScale * 0.03 + 8);
      g.moveTo(p.x - ux * tracer, p.y - uy * tracer).lineTo(p.x, p.y)
        .stroke({ width: lance ? 4 : 2.5, color, alpha: 0.9 });
      g.moveTo(p.x - ux * tracer * 0.5, p.y - uy * tracer * 0.5).lineTo(p.x, p.y)
        .stroke({ width: lance ? 2 : 1.2, color: 0xffffff, alpha: 1 });
      if (slow) {
        // Visible slug + trail.
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1]!;
          const b = trail[i]!;
          g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 1.5, color, alpha: (i / trail.length) * 0.5 });
        }
        g.circle(p.x, p.y, lance ? 4 : 3).fill({ color: 0xffffff });
        this.glow(p.x, p.y, color, lance ? 60 : 38, 0.9);
      } else {
        this.glow(p.x, p.y, color, lance ? 44 : 22, 0.5);
      }
    }
    for (const id of this.projTrails.keys()) if (!live.has(id)) this.projTrails.delete(id);
    for (let i = this.glowUsed; i < this.glowPool.length; i++) this.glowPool[i]!.visible = false;

    // Hack upload beams.
    for (const l of v.hackLines) {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 0.5) / n;
        const on = t0 <= l.p;
        g.moveTo(lerp(l.x0, l.x1, t0), lerp(l.y0, l.y1, t0)).lineTo(lerp(l.x0, l.x1, t1), lerp(l.y0, l.y1, t1))
          .stroke({ width: on ? 2 : 1, color: 0x7dff9a, alpha: on ? 0.9 : 0.3 });
      }
    }
    void dt;
  }

  private glow(x: number, y: number, color: number, size: number, alpha: number): void {
    let s = this.glowPool[this.glowUsed];
    if (!s) {
      s = new Sprite(this.glowTex);
      s.anchor.set(0.5);
      this.projGlow.addChild(s);
      this.glowPool.push(s);
    }
    this.glowUsed++;
    s.visible = true;
    s.position.set(x, y);
    s.tint = color;
    s.width = s.height = size;
    s.alpha = alpha;
  }

  private drawNades(v: FrameView): void {
    const g = this.fxNormal;
    g.clear();
    for (const n of v.nades) {
      const color = n.kind === 'emp' ? 0x5ca8ff : 0xff4d5e;
      g.ellipse(n.x + 3, n.y + 4, 6, 5).fill({ color: 0x000000, alpha: 0.5 });
      g.circle(n.x, n.y, 6).fill({ color: 0x2a2f3a }).stroke({ width: 1.5, color });
      const blink = Math.sin(this.time * (n.fuse < 0.6 ? 40 : 12)) > 0;
      if (blink) g.circle(n.x, n.y, 2.5).fill({ color });
      if (n.fuse < 0.8) {
        g.circle(n.x, n.y, n.kind === 'emp' ? 180 : 170).stroke({ width: 1, color, alpha: 0.35 });
      }
    }
  }

  private updateParticles(dt: number, scale: number): void {
    const add = this.fxAdd;
    add.clear();
    const normal = this.fxNormal;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      const pdt = p.rt ? dt : dt * scale;
      p.life -= pdt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const drag = p.drag ? Math.exp(-p.drag * pdt) : 1;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * pdt;
      p.y += p.vy * pdt;
      const t = p.life / p.max;
      const g = p.add ? add : normal;
      switch (p.kind) {
        case 'spark':
        case 'streak': {
          const l = p.kind === 'streak' ? 0.05 : 0.02;
          g.moveTo(p.x, p.y).lineTo(p.x - p.vx * l, p.y - p.vy * l).stroke({ width: p.size, color: p.color, alpha: t });
          break;
        }
        case 'blood':
          g.circle(p.x, p.y, p.size * (0.6 + 0.4 * t)).fill({ color: p.color, alpha: 0.9 * t });
          break;
        case 'shard':
          g.rect(p.x, p.y, p.size, p.size).fill({ color: p.color, alpha: t });
          break;
        case 'smoke':
          g.circle(p.x, p.y, p.size * (1.6 - t * 0.6)).fill({ color: p.color, alpha: 0.18 * t });
          break;
        case 'ember':
          g.circle(p.x, p.y, p.size * 0.5 * t).fill({ color: p.color, alpha: 0.5 * t });
          g.circle(p.x, p.y, p.size * 0.2 * t).fill({ color: 0xffffff, alpha: 0.8 * t });
          break;
        case 'ring':
          g.circle(p.x, p.y, p.size * (1 - t * t)).stroke({ width: 3 * t + 1, color: p.color, alpha: t });
          break;
        case 'slash': {
          const a0 = (p.a ?? 0) - (p.a2 ?? 2) / 2;
          const a1 = (p.a ?? 0) + (p.a2 ?? 2) / 2;
          arcPath(g, p.x, p.y, p.size, a0, a1).stroke({ width: 10 * t, color: p.color, alpha: 0.5 * t });
          arcPath(g, p.x, p.y, p.size - 4, a0, a1).stroke({ width: 2, color: 0xffffff, alpha: 0.9 * t });
          break;
        }
      }
    }
  }

  private drawScreen(v: FrameView, dt: number, W: number, H: number): void {
    const g = this.screenG;
    g.clear();
    this.vignette.width = W;
    this.vignette.height = H;

    // Rain, falling at world speed — it hangs in the air during Phase.
    const rg = this.rainG;
    rg.clear();
    const rs = v.worldScale;
    for (const d of this.rain) {
      d.y += dt * 1.6 * d.s * rs;
      d.x += dt * 0.25 * d.s * rs;
      if (d.y > 1) { d.y -= 1; d.x = Math.random(); }
      if (d.x > 1) d.x -= 1;
      const x = d.x * W;
      const y = d.y * H;
      const l = d.l * (rs < 1 ? 0.35 : 1);
      rg.moveTo(x, y).lineTo(x + l * 0.25, y + l);
    }
    rg.stroke({ width: 1, color: 0x9fb8d8, alpha: 0.22 });

    // Screen flash + chromatic split on Phase activation (GDD §59).
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.2);
    if (this.flashAlpha > 0.01) g.rect(0, 0, W, H).fill({ color: this.flashColor, alpha: this.flashAlpha });
    this.chroma = Math.max(0, this.chroma - dt * 2.5);
    if (this.chroma > 0.01) {
      const o = this.chroma * 14;
      g.rect(-o, 0, W, H).stroke({ width: 6, color: 0xff2255, alpha: this.chroma * 0.5 });
      g.rect(o, 0, W, H).stroke({ width: 6, color: 0x22ddff, alpha: this.chroma * 0.5 });
      for (let i = 0; i < 6; i++) {
        const y = Math.random() * H;
        g.rect(0, y, W, 2 + Math.random() * 3).fill({ color: i % 2 ? 0xff2255 : 0x22ddff, alpha: this.chroma * 0.25 });
      }
    }
    if (v.localPhase) {
      g.rect(0, 0, W, H).stroke({ width: 3, color: 0x3dfcff, alpha: 0.35 + 0.1 * Math.sin(this.time * 6) });
    } else if (v.dragged) {
      g.rect(0, 0, W, H).stroke({ width: 3, color: 0xff3fa4, alpha: 0.25 + 0.15 * Math.sin(this.time * 4) });
    }

    // Reticle.
    const mx = v.mouseX;
    const my = v.mouseY;
    const color = v.hacking ? 0x7dff9a : 0xffffff;
    if (v.reticle.melee) {
      g.circle(mx, my, 10).stroke({ width: 1.5, color, alpha: 0.9 });
      g.circle(mx, my, 2).fill({ color });
    } else {
      const gap = 6 + v.reticle.spread * 180;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        g.moveTo(mx + dx * gap, my + dy * gap).lineTo(mx + dx * (gap + 9), my + dy * (gap + 9));
      }
      g.stroke({ width: 2, color, alpha: 0.95 });
      g.circle(mx, my, 1.6).fill({ color });
    }
    if (v.reticle.charge > 0) {
      arcPath(g, mx, my, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v.reticle.charge)
        .stroke({ width: 3, color: v.reticle.charge >= 1 ? 0x7ff6ff : 0x3d8a99 });
    }
    if (v.reticle.reload >= 0) {
      arcPath(g, mx, my, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v.reticle.reload).stroke({ width: 2, color: 0xffc23d });
    }
    // Hit marker.
    this.hitMarker = Math.max(0, this.hitMarker - dt * 5);
    if (this.hitMarker > 0) {
      const c = this.hitMarkerKind === 'kill' ? 0xff4d5e : this.hitMarkerKind === 'head' ? 0xffe04a : 0xffffff;
      const s = 8 + (1 - this.hitMarker) * 6 + (this.hitMarkerKind === 'head' ? 3 : 0);
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
        g.moveTo(mx + dx * s, my + dy * s).lineTo(mx + dx * (s + 7), my + dy * (s + 7));
      }
      g.stroke({ width: this.hitMarkerKind === 'hit' ? 2 : 3, color: c, alpha: this.hitMarker });
    }
  }

  private updateLabels(v: FrameView, dt: number): void {
    for (let i = this.dmgNumbers.length - 1; i >= 0; i--) {
      const d = this.dmgNumbers[i]!;
      d.life -= dt;
      d.y += d.vy * dt;
      d.vy *= Math.exp(-3 * dt);
      d.text.position.set(d.x, d.y);
      d.text.alpha = Math.min(1, d.life * 3);
      if (d.life <= 0) {
        d.text.destroy();
        this.dmgNumbers.splice(i, 1);
      }
    }
    const seen = new Set<number>();
    for (const a of v.actors) {
      if (a.kind !== 'player' || a.self) continue;
      seen.add(a.id);
      let t = this.names.get(a.id);
      if (!t) {
        t = new Text({
          text: a.name ?? '',
          style: { fontFamily: 'Chakra Petch, sans-serif', fontSize: 13, fontWeight: '600', fill: a.color, stroke: { color: 0x000000, width: 3 } },
        });
        t.anchor.set(0.5, 1);
        this.labels.addChild(t);
        this.names.set(a.id, t);
      }
      t.text = `${a.name ?? ''}${a.pvp ? ' ⚔' : ''}${a.phase ? ' ◈' : ''}`;
      t.position.set(a.x, a.y - 28);
    }
    for (const [id, t] of this.names) {
      if (!seen.has(id)) {
        t.destroy();
        this.names.delete(id);
      }
    }
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.world.position.x) / this.zoom, y: (sy - this.world.position.y) / this.zoom };
  }
}

/** Pixi v8 `arc` connects from the current pen position; start a fresh sub-path at the arc's first point. */
function arcPath(g: Graphics, x: number, y: number, r: number, a0: number, a1: number): Graphics {
  return g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r).arc(x, y, r, a0, a1);
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function rotEllipsePoints(x: number, y: number, rx: number, ry: number, ang: number): number[] {
  // rx is across the shoulders (perpendicular to aim), ry along the aim.
  const pts: number[] = [];
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  for (let i = 0; i < 18; i++) {
    const t = (i / 18) * Math.PI * 2;
    const lx = Math.cos(t) * ry;
    const ly = Math.sin(t) * rx;
    pts.push(x + lx * c - ly * s, y + lx * s + ly * c);
  }
  return pts;
}

function rotEllipse(g: Graphics, x: number, y: number, rx: number, ry: number, ang: number, color: number, alpha: number): void {
  g.poly(rotEllipsePoints(x, y, rx, ry, ang)).fill({ color, alpha });
}

function rotEllipseStroke(g: Graphics, x: number, y: number, rx: number, ry: number, ang: number, color: number, width: number, alpha: number): void {
  g.poly(rotEllipsePoints(x, y, rx, ry, ang)).stroke({ width, color, alpha });
}
