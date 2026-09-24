import { PHASE_DRIVE, REFLEX } from '../shared/constants.js';

/**
 * PHASE DRIVE state (GDD §48–60). Used by players with the Phase OS and by
 * Reflex Operative enemies. Every timer here advances in the owner's
 * simulated time; the owner is at scale 1.0 while active.
 */
export interface PhaseDrive {
  active: boolean;
  /** Activation delay remaining (GDD §59), or -1 when not activating. */
  pendingT: number;
  elapsed: number;
  cooldown: number;
  charge: number;
  regenDelay: number;
  /** EMP lockout remaining (GDD §60). */
  lockT: number;
  maxDuration: number;
  cooldownFull: number;
}

export function createPhaseDrive(extraCooldown = 0): PhaseDrive {
  return {
    active: false,
    pendingT: -1,
    elapsed: 0,
    cooldown: 0,
    charge: REFLEX.max,
    regenDelay: 0,
    lockT: 0,
    maxDuration: PHASE_DRIVE.maxDuration,
    cooldownFull: PHASE_DRIVE.cooldown + extraCooldown,
  };
}

export type PhaseSignal = 'started' | 'ended' | 'expired' | null;

export type ToggleResult = 'activating' | 'deactivated' | 'cooldown' | 'charge' | 'locked' | 'busy';

/** Request activation or voluntary early deactivation (F key). */
export function togglePhase(pd: PhaseDrive): ToggleResult {
  if (pd.active) {
    endPhase(pd);
    return 'deactivated';
  }
  if (pd.pendingT >= 0) return 'busy';
  if (pd.lockT > 0) return 'locked';
  if (pd.cooldown > 0) return 'cooldown';
  if (pd.charge < REFLEX.minToActivate) return 'charge';
  pd.pendingT = REFLEX.activationDelay;
  return 'activating';
}

/** Ends an active Phase. Short activations pay a proportional cooldown so users can chain bursts (GDD §58). */
export function endPhase(pd: PhaseDrive): void {
  if (!pd.active) {
    pd.pendingT = -1;
    return;
  }
  pd.active = false;
  pd.pendingT = -1;
  const used = pd.elapsed / pd.maxDuration;
  pd.cooldown = Math.max(PHASE_DRIVE.minCooldown, pd.cooldownFull * used);
  pd.regenDelay = REFLEX.regenDelay;
}

/** Forced shutdown from EMP / synapse drain. */
export function forcePhaseOff(pd: PhaseDrive, lock: number): boolean {
  const was = pd.active || pd.pendingT >= 0;
  if (pd.active) endPhase(pd);
  pd.pendingT = -1;
  pd.lockT = Math.max(pd.lockT, lock);
  return was;
}

/**
 * Advances the drive by `dt` simulated seconds of the owner's time.
 */
export function updatePhase(pd: PhaseDrive, dt: number): PhaseSignal {
  pd.lockT = Math.max(0, pd.lockT - dt);

  if (pd.pendingT >= 0) {
    pd.pendingT -= dt;
    if (pd.pendingT < 0) {
      pd.pendingT = -1;
      pd.active = true;
      pd.elapsed = 0;
      return 'started';
    }
    return null;
  }

  if (pd.active) {
    pd.elapsed += dt;
    pd.charge = Math.max(0, pd.charge - REFLEX.drainPerSec * dt);
    if (pd.charge <= 0 || pd.elapsed >= pd.maxDuration) {
      endPhase(pd);
      return 'expired';
    }
    return null;
  }

  pd.cooldown = Math.max(0, pd.cooldown - dt);
  if (pd.regenDelay > 0) pd.regenDelay -= dt;
  else pd.charge = Math.min(REFLEX.max, pd.charge + REFLEX.regenPerSec * dt);
  return null;
}

export function phaseTimeLeft(pd: PhaseDrive): number {
  if (!pd.active) return 0;
  return Math.max(0, Math.min(pd.maxDuration - pd.elapsed, pd.charge / REFLEX.drainPerSec));
}
