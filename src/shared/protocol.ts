import type { HackId } from './hacks.js';
import type { WeaponId } from './weapons.js';

/** Buttons held during an input command. */
export const BTN = {
  FIRE: 1 << 0,
  ALT: 1 << 1,
  SPRINT: 1 << 2,
  CROUCH: 1 << 3,
  HACK: 1 << 4,
  INTERACT: 1 << 5,
} as const;

/** Buttons pressed (edge-triggered) during an input command. */
export const EDGE = {
  FIRE: 1 << 0,
  FIRE_RELEASE: 1 << 1,
  DASH: 1 << 2,
  RELOAD: 1 << 3,
  PHASE: 1 << 4,
  GRENADE: 1 << 5,
  INJECT: 1 << 6,
  CROUCH: 1 << 7,
  ALT: 1 << 8,
} as const;

export type OsKind = 'phase' | 'ghost';

export interface InputCmd {
  seq: number;
  /** Real seconds this command covers. The server scales it by the player's temporal scale. */
  dt: number;
  mx: number;
  my: number;
  aim: number;
  buttons: number;
  edges: number;
  /** Weapon slot 0–3. */
  slot: number;
  /** 0 = none, otherwise 1-based index into HACK_ORDER pressed this frame. */
  hack: number;
  /** Entity id under the quickhack reticle, 0 if none. */
  target: number;
}

export type LabCommand = 'toggleBots' | 'spawnWave' | 'toggleOs' | 'togglePvp' | 'clearEnemies' | 'bulletCurtain';

export type ClientMsg =
  | { type: 'join'; name: string; os: OsKind }
  | { type: 'input'; cmds: InputCmd[] }
  | { type: 'lab'; cmd: LabCommand }
  | { type: 'ping'; t: number };

export interface MoveState {
  x: number;
  y: number;
  /** External (knockback / slide) velocity that decays over time. */
  kvx: number;
  kvy: number;
  dashT: number;
  dashDx: number;
  dashDy: number;
  dashCharges: number;
  dashRecharge: number;
  slideT: number;
  slideDx: number;
  slideDy: number;
  iframes: number;
  crouching: boolean;
  sprinting: boolean;
}

/** Status effect bit flags. */
export const STATUS = {
  OPTIC_JAM: 1 << 0,
  MOTOR_LOCK: 1 << 1,
  WEAPON_FAULT: 1 << 2,
  OVERHEAT: 1 << 3,
  EMP_LOCK: 1 << 4,
  STAGGER: 1 << 5,
} as const;

export type LifeState = 'alive' | 'downed' | 'dead';

export type MeleePhase = 'none' | 'charging' | 'windup' | 'active' | 'recovery';

export interface PlayerSnap {
  id: number;
  name: string;
  color: number;
  os: OsKind;
  move: MoveState;
  aim: number;
  hp: number;
  armor: number;
  life: LifeState;
  lifeT: number;
  reviveP: number;
  slot: number;
  ammo: number[];
  reloadP: number;
  chargeP: number;
  melee: MeleePhase;
  meleeHeavy: boolean;
  blocking: boolean;
  scale: number;
  phase: boolean;
  phasePending: boolean;
  phaseLeft: number;
  phaseCd: number;
  reflex: number;
  bandwidth: number;
  uploads: { hack: HackId; target: number; p: number }[];
  grenades: number;
  injectors: number;
  status: number;
  moveMul: number;
  pvp: boolean;
  kills: number;
  deaths: number;
  ack: number;
}

export type NpcType = 'thug' | 'enforcer' | 'operative';
export type AiState = 'idle' | 'suspicious' | 'investigating' | 'alert' | 'combat' | 'searching';

export interface NpcSnap {
  id: number;
  type: NpcType;
  x: number;
  y: number;
  aim: number;
  hp: number;
  maxHp: number;
  armor: number;
  ai: AiState;
  awareness: number;
  scale: number;
  phase: boolean;
  status: number;
  reloading: boolean;
  dead: boolean;
}

export interface ProjSnap {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: WeaponId;
  o: number;
  /** Deflected by a parry. */
  d: boolean;
}

export interface NadeSnap {
  id: number;
  x: number;
  y: number;
  kind: 'frag' | 'emp';
  fuse: number;
}

export type GameEvent =
  | { e: 'shot'; id: number; x: number; y: number; a: number; w: WeaponId; s: number }
  | { e: 'hit'; x: number; y: number; target: number; src: number; dmg: number; head: boolean; armor: boolean; kill: boolean; s: number }
  | { e: 'impact'; x: number; y: number; nx: number; ny: number; mat: string; s: number }
  | { e: 'pierce'; x: number; y: number; mat: string }
  | { e: 'wallBroken'; id: number }
  | { e: 'phaseStart'; id: number; t: number; duration: number }
  | { e: 'phaseEnd'; id: number; forced: boolean }
  | { e: 'phaseDenied'; id: number; reason: string }
  | { e: 'dash'; id: number; x: number; y: number; dx: number; dy: number; s: number }
  | { e: 'swing'; id: number; x: number; y: number; a: number; heavy: boolean; s: number }
  | { e: 'parry'; id: number; x: number; y: number; s: number }
  | { e: 'explosion'; x: number; y: number; r: number; kind: 'frag' | 'emp'; s: number }
  | { e: 'hackStart'; src: number; target: number; hack: HackId }
  | { e: 'hackLand'; src: number; target: number; hack: HackId }
  | { e: 'reload'; id: number; s: number }
  | { e: 'dryFire'; id: number }
  | { e: 'kill'; killer: number; victim: number; weapon: string }
  | { e: 'downed'; id: number }
  | { e: 'revived'; id: number; by: number }
  | { e: 'spawn'; id: number }
  | { e: 'notice'; text: string };

export interface SnapshotMsg {
  type: 'snap';
  /** Server real time in ms. */
  t: number;
  tick: number;
  worldScale: number;
  bots: boolean;
  players: PlayerSnap[];
  npcs: NpcSnap[];
  proj: ProjSnap[];
  nades: NadeSnap[];
  broken: number[];
  events: GameEvent[];
}

export type ServerMsg =
  | { type: 'welcome'; id: number; tickRate: number; serverTime: number }
  | { type: 'full'; reason: string }
  | SnapshotMsg
  | { type: 'pong'; t: number; st: number };
