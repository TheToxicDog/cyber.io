/** Combat quickhacks available on the Ghost Deck (GDD §36). Times are simulated seconds. */

export interface HackDef {
  id: HackId;
  name: string;
  cost: number;
  upload: number;
  duration: number;
  description: string;
  color: number;
}

export type HackId = 'opticJam' | 'motorLock' | 'weaponFault' | 'systemSpike' | 'overheat' | 'synapseDrain';

export const HACKS: Record<HackId, HackDef> = {
  opticJam: {
    id: 'opticJam', name: 'OPTIC JAM', cost: 25, upload: 0.35, duration: 4,
    description: 'Blinds the target', color: 0x3dfcff,
  },
  motorLock: {
    id: 'motorLock', name: 'MOTOR LOCK', cost: 20, upload: 0.3, duration: 4,
    description: 'Movement slowed 60%', color: 0x8a5cff,
  },
  weaponFault: {
    id: 'weaponFault', name: 'WEAPON FAULT', cost: 30, upload: 0.45, duration: 3.5,
    description: 'Firearm jams', color: 0xffc23d,
  },
  systemSpike: {
    id: 'systemSpike', name: 'SYSTEM SPIKE', cost: 35, upload: 0.5, duration: 0,
    description: 'Cyber damage, more vs augmented targets', color: 0xff3fa4,
  },
  overheat: {
    id: 'overheat', name: 'OVERHEAT', cost: 30, upload: 0.4, duration: 4,
    description: 'Burning damage over time', color: 0xff7a3d,
  },
  synapseDrain: {
    id: 'synapseDrain', name: 'SYNAPSE DRAIN', cost: 40, upload: 0.55, duration: 0,
    description: 'Drains Reflex Charge, forces Phase exit', color: 0x7dff9a,
  },
};

/** Order bound to keys 1–6 while Q is held. */
export const HACK_ORDER: HackId[] = ['opticJam', 'motorLock', 'weaponFault', 'systemSpike', 'overheat', 'synapseDrain'];

export const SYSTEM_SPIKE_DAMAGE = 45;
export const OVERHEAT_DPS = 14;
