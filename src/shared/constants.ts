// Global simulation constants shared by server and client.

/** Authoritative server simulation rate (GDD §96). */
export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

/** Client input sampling rate. Each input command carries its own dt. */
export const INPUT_RATE = 60;

/** Temporal scale applied to everything outside the fast time layer while any Phase Drive is active (GDD §50). */
export const PHASE_WORLD_SCALE = 0.22;

/** Interpolation delay the client renders remote entities behind server time. */
export const INTERP_DELAY_MS = 100;

export const MAX_PLAYERS = 10;

export const PLAYER_RADIUS = 16;
export const NPC_RADIUS = 16;

export const PLAYER_MAX_HP = 150;
export const PLAYER_MAX_ARMOR = 50;

/** Movement speeds in px per simulated second. */
export const SPEED = {
  run: 270,
  sprint: 390,
  crouch: 140,
  aiming: 200,
  blocking: 160,
} as const;

export const DASH = {
  speed: 1150,
  duration: 0.16,
  iframes: 0.12,
  charges: 2,
  recharge: 1.25,
} as const;

export const SLIDE = {
  speed: 620,
  duration: 0.42,
  friction: 0.86,
} as const;

/** Reflex Charge economy (GDD §58). */
export const REFLEX = {
  max: 100,
  drainPerSec: 25,
  regenPerSec: 7,
  regenDelay: 1.0,
  minToActivate: 20,
  activationDelay: 0.12,
} as const;

/** Phase Drive MK II values (GDD §57). */
export const PHASE_DRIVE = {
  name: 'PHASE DRIVE MK II',
  maxDuration: 3.0,
  cooldown: 16,
  /** Short activations only pay a fraction of the full cooldown. */
  minCooldown: 2.0,
} as const;

export const GHOST_DECK = {
  name: 'GHOST DECK v3',
  bandwidthMax: 100,
  bandwidthRegen: 9,
  queueSize: 2,
  range: 720,
} as const;

export const GRENADE = {
  carried: 3,
  rechargeTime: 14,
  fuse: 1.6,
  throwSpeed: 760,
  friction: 2.6,
  radius: 170,
  damage: 130,
} as const;

export const EMP = {
  radius: 180,
  phaseLock: 4.0,
} as const;

export const DOWNED = {
  bleedout: 12,
  reviveTime: 2.0,
  reviveRange: 64,
  reviveHpFraction: 0.4,
  respawnDelay: 3.0,
} as const;

export const REGEN = {
  delay: 5,
  perSec: 14,
} as const;

export const INJECTOR = {
  carried: 2,
  heal: 60,
  duration: 0.8,
} as const;
