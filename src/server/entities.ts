import {
  GHOST_DECK, GRENADE, INJECTOR, NPC_RADIUS, PLAYER_MAX_ARMOR, PLAYER_MAX_HP, PLAYER_RADIUS,
} from '../shared/constants.js';
import type { HackId } from '../shared/hacks.js';
import { createMoveState } from '../shared/movement.js';
import type {
  AiState, InputCmd, LifeState, MeleePhase, MoveState, NpcType, OsKind,
} from '../shared/protocol.js';
import { PLAYER_LOADOUT, type WeaponId, WEAPONS } from '../shared/weapons.js';
import { createPhaseDrive, type PhaseDrive } from './phase.js';

/** Status effect timers, in the owner's simulated seconds. */
export interface Statuses {
  optic: number;
  motor: number;
  fault: number;
  overheat: number;
  overheatSrc: number;
  emp: number;
  stagger: number;
}

export const createStatuses = (): Statuses => ({
  optic: 0, motor: 0, fault: 0, overheat: 0, overheatSrc: 0, emp: 0, stagger: 0,
});

export interface Upload {
  hack: HackId;
  target: number;
  t: number;
  total: number;
}

export interface MeleeState {
  phase: MeleePhase;
  t: number;
  heavy: boolean;
  dashAttack: boolean;
  hit: Set<number>;
}

export const EMPTY_CMD: InputCmd = {
  seq: 0, dt: 0, mx: 0, my: 0, aim: 0, buttons: 0, edges: 0, slot: 0, hack: 0, target: 0,
};

export class Player {
  readonly kind = 'player' as const;
  readonly radius = PLAYER_RADIUS;
  move: MoveState;
  aim = 0;
  hp = PLAYER_MAX_HP;
  maxHp = PLAYER_MAX_HP;
  armor = PLAYER_MAX_ARMOR;
  life: LifeState = 'alive';
  lifeT = 0;
  reviveP = 0;

  slot = 0;
  ammo: number[];
  reloadT = -1;
  fireCd = 0;
  fireBuffer = 0;
  chargeT = 0;
  melee: MeleeState = { phase: 'none', t: 0, heavy: false, dashAttack: false, hit: new Set() };
  blockT = -1;
  sinceDash = 99;

  os: OsKind;
  phase: PhaseDrive | null;
  bandwidth: number = GHOST_DECK.bandwidthMax;
  uploads: Upload[] = [];

  grenades: number = GRENADE.carried;
  grenadeRecharge = 0;
  injectors: number = INJECTOR.carried;
  healT = 0;

  status = createStatuses();
  sinceHurt = 99;
  pvp = false;
  kills = 0;
  deaths = 0;

  cmdQueue: InputCmd[] = [];
  lastCmd: InputCmd = { ...EMPTY_CMD };
  pendingEdges = 0;
  pendingHack: { idx: number; target: number } | null = null;
  ack = 0;

  constructor(
    readonly id: number,
    public name: string,
    readonly color: number,
    os: OsKind,
    x: number,
    y: number,
  ) {
    this.move = createMoveState(x, y);
    this.ammo = PLAYER_LOADOUT.map((w) => {
      const def = WEAPONS[w];
      return def.kind === 'gun' ? def.magSize : 0;
    });
    this.os = os;
    this.phase = os === 'phase' ? createPhaseDrive() : null;
  }

  get x(): number { return this.move.x; }
  get y(): number { return this.move.y; }
  get weaponId(): WeaponId { return PLAYER_LOADOUT[this.slot]!; }
  get alive(): boolean { return this.life === 'alive'; }
  get inPhase(): boolean { return this.phase?.active ?? false; }

  setOs(os: OsKind): void {
    this.os = os;
    this.phase = os === 'phase' ? createPhaseDrive() : null;
    this.bandwidth = GHOST_DECK.bandwidthMax;
    this.uploads = [];
  }
}

export interface NpcStats {
  hp: number;
  armor: number;
  speed: number;
  weapon: WeaponId;
  turnRate: number;
  reaction: number;
  preferredRange: number;
  visionRange: number;
  augmented: boolean;
}

export const NPC_STATS: Record<NpcType, NpcStats> = {
  thug: {
    hp: 80, armor: 0, speed: 205, weapon: 'thugPistol', turnRate: 3.6, reaction: 0.45,
    preferredRange: 360, visionRange: 760, augmented: false,
  },
  enforcer: {
    hp: 150, armor: 90, speed: 170, weapon: 'enforcerShotgun', turnRate: 2.8, reaction: 0.4,
    preferredRange: 190, visionRange: 700, augmented: false,
  },
  operative: {
    hp: 120, armor: 30, speed: 280, weapon: 'operativeSmg', turnRate: 6.5, reaction: 0.22,
    preferredRange: 280, visionRange: 850, augmented: true,
  },
};

export class Npc {
  readonly kind = 'npc' as const;
  readonly radius = NPC_RADIUS;
  hp: number;
  maxHp: number;
  armor: number;
  aim: number;
  kvx = 0;
  kvy = 0;
  ammo: number;
  reloadT = -1;
  fireCd = 0;
  ai: AiState = 'idle';
  awareness = 0;
  target = 0;
  lastKnown: { x: number; y: number } | null = null;
  stateT = 0;
  reactT = 0;
  unseenT = 0;
  patrolIdx: number;
  strafeDir = 1;
  strafeT = 0;
  empCd = 6;
  dashT = 0;
  dashDx = 0;
  dashDy = 0;
  dashCd = 0;
  phase: PhaseDrive | null;
  status = createStatuses();
  dead = false;
  deadT = 0;
  lastX: number;
  lastY: number;
  stuckT = 0;

  constructor(
    readonly id: number,
    readonly type: NpcType,
    public x: number,
    public y: number,
    patrolIdx: number,
  ) {
    const s = NPC_STATS[type];
    this.hp = this.maxHp = s.hp;
    this.armor = s.armor;
    this.aim = Math.PI;
    const w = WEAPONS[s.weapon];
    this.ammo = w.kind === 'gun' ? w.magSize : 0;
    this.phase = type === 'operative' ? createPhaseDrive(8) : null;
    this.patrolIdx = patrolIdx;
    this.lastX = x;
    this.lastY = y;
  }

  get stats(): NpcStats { return NPC_STATS[this.type]; }
  get alive(): boolean { return !this.dead; }
  get inPhase(): boolean { return this.phase?.active ?? false; }
}

export type Actor = Player | Npc;

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number;
  team: 'player' | 'enemy';
  damage: number;
  pen: number;
  life: number;
  weapon: WeaponId;
  knockback: number;
  deflected: boolean;
  hit: Set<number>;
}

export interface Grenade {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fuse: number;
  owner: number;
  team: 'player' | 'enemy';
  kind: 'frag' | 'emp';
}
