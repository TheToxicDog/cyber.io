/**
 * Weapon definitions for the first playable build (GDD §106):
 * three guns (one per technology family) and one sword, plus NPC-only guns.
 * All times are simulated seconds and are scaled by the wielder's temporal scale.
 */

export type WeaponFamily = 'ballistic' | 'smart' | 'electromagnetic' | 'melee';
export type Tier = 'Cheap' | 'Standard' | 'Professional' | 'Military' | 'Prototype';

export interface GunDef {
  kind: 'gun';
  id: string;
  name: string;
  family: WeaponFamily;
  tier: Tier;
  damage: number;
  pellets: number;
  /** Seconds between shots. */
  fireInterval: number;
  auto: boolean;
  magSize: number;
  reloadTime: number;
  /** Projectile speed in px per simulated second. */
  speed: number;
  /** Half-angle of the spread cone, in radians, when hip-firing / aiming. */
  spreadHip: number;
  spreadAim: number;
  /** Remaining material resistance a projectile can pass through. */
  penetration: number;
  lifetime: number;
  knockback: number;
  /** Charge time (electromagnetic weapons). */
  chargeTime?: number;
  /** Noise radius for stealth AI. */
  noise: number;
  color: number;
}

export interface MeleeDef {
  kind: 'melee';
  id: string;
  name: string;
  family: 'melee';
  tier: Tier;
  light: { damage: number; windup: number; active: number; recovery: number; range: number; arc: number };
  heavy: { damage: number; charge: number; windup: number; active: number; recovery: number; range: number; arc: number };
  /** Window at the start of a block in which incoming melee is parried and projectiles are deflected. */
  parryWindow: number;
  blockReduction: number;
  color: number;
}

export type WeaponDef = GunDef | MeleeDef;

const DEFS = {
  kestrel: {
    kind: 'gun', id: 'kestrel', name: 'M-9 KESTREL', family: 'ballistic', tier: 'Standard',
    damage: 30, pellets: 1, fireInterval: 0.15, auto: false, magSize: 12, reloadTime: 1.1,
    speed: 1600, spreadHip: 0.035, spreadAim: 0.01, penetration: 1, lifetime: 0.9, knockback: 40,
    noise: 700, color: 0xffe28a,
  },
  breaker: {
    kind: 'gun', id: 'breaker', name: 'BREAKER-12', family: 'ballistic', tier: 'Professional',
    damage: 14, pellets: 9, fireInterval: 0.62, auto: false, magSize: 6, reloadTime: 1.8,
    speed: 1300, spreadHip: 0.17, spreadAim: 0.12, penetration: 0, lifetime: 0.42, knockback: 55,
    noise: 900, color: 0xffb347,
  },
  lance: {
    kind: 'gun', id: 'lance', name: 'LANCE EM-4', family: 'electromagnetic', tier: 'Military',
    damage: 105, pellets: 1, fireInterval: 0.2, auto: false, magSize: 4, reloadTime: 2.1,
    speed: 3400, spreadHip: 0.02, spreadAim: 0.0, penetration: 5, lifetime: 0.8, knockback: 160,
    chargeTime: 0.55, noise: 1000, color: 0x7ff6ff,
  },
  veilEdge: {
    kind: 'melee', id: 'veilEdge', name: 'VEIL EDGE MONOBLADE', family: 'melee', tier: 'Prototype',
    light: { damage: 44, windup: 0.06, active: 0.1, recovery: 0.16, range: 78, arc: 1.9 },
    heavy: { damage: 95, charge: 0.35, windup: 0.08, active: 0.14, recovery: 0.32, range: 96, arc: 2.6 },
    parryWindow: 0.18, blockReduction: 0.75, color: 0xff3fa4,
  },

  // NPC weapons
  thugPistol: {
    kind: 'gun', id: 'thugPistol', name: 'STREET 9MM', family: 'ballistic', tier: 'Cheap',
    damage: 11, pellets: 1, fireInterval: 0.5, auto: false, magSize: 10, reloadTime: 1.6,
    speed: 1250, spreadHip: 0.08, spreadAim: 0.08, penetration: 0, lifetime: 1.0, knockback: 20,
    noise: 700, color: 0xffd08a,
  },
  enforcerShotgun: {
    kind: 'gun', id: 'enforcerShotgun', name: 'ENFORCER 10-GA', family: 'ballistic', tier: 'Standard',
    damage: 8, pellets: 7, fireInterval: 1.25, auto: false, magSize: 5, reloadTime: 2.2,
    speed: 1150, spreadHip: 0.2, spreadAim: 0.2, penetration: 0, lifetime: 0.45, knockback: 50,
    noise: 900, color: 0xffa060,
  },
  operativeSmg: {
    kind: 'gun', id: 'operativeSmg', name: 'AXIOM VX SMG', family: 'ballistic', tier: 'Military',
    damage: 7, pellets: 1, fireInterval: 0.11, auto: true, magSize: 20, reloadTime: 1.6,
    speed: 1450, spreadHip: 0.11, spreadAim: 0.11, penetration: 1, lifetime: 0.8, knockback: 15,
    noise: 800, color: 0xff6b6b,
  },
} as const satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof DEFS;

export const WEAPONS: Record<WeaponId, WeaponDef> = DEFS;

/** Player loadout in slots 1–4 (GDD §38). */
export const PLAYER_LOADOUT: WeaponId[] = ['kestrel', 'breaker', 'lance', 'veilEdge'];

export function weaponDef(id: WeaponId): WeaponDef {
  return WEAPONS[id] as WeaponDef;
}
