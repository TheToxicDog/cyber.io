import { NPC_RADIUS } from '../shared/constants.js';
import { collideCircle } from '../shared/map.js';
import { dist, normalize, wrapAngle } from '../shared/math.js';
import { type GunDef, WEAPONS } from '../shared/weapons.js';
import type { Npc, Player } from './entities.js';
import { togglePhase } from './phase.js';
import type { World } from './world.js';

const FOV = (115 * Math.PI) / 180;

/**
 * Enemy behaviour: Idle → Suspicious → Investigating → Alert → Combat → Searching (GDD §70).
 * `dt` is already scaled by the NPC's temporal scale, so every timer and every
 * movement here slows correctly while a Phase Drive is active.
 */
export function updateNpc(world: World, n: Npc, dt: number): void {
  if (dt <= 0) return;
  const s = n.stats;
  const gun = WEAPONS[s.weapon] as GunDef;

  n.fireCd -= dt;
  n.empCd -= dt;
  n.dashCd -= dt;
  n.stateT += dt;

  if (n.reloadT >= 0) {
    n.reloadT -= dt;
    if (n.reloadT < 0) {
      n.ammo = gun.magSize;
      n.reloadT = -1;
    }
  }

  // Knockback always applies, even while staggered.
  let mvx = n.kvx;
  let mvy = n.kvy;
  const decay = Math.exp(-8 * dt);
  n.kvx *= decay;
  n.kvy *= decay;

  const staggered = n.status.stagger > 0;
  const blind = n.status.optic > 0;
  const speedMul = n.status.motor > 0 ? 0.4 : 1;

  // ── Perception ──
  const seen = blind ? null : findVisibleTarget(world, n);
  if (seen) {
    const d = dist(n.x, n.y, seen.x, seen.y);
    const crouchMul = seen.move.crouching ? 0.55 : 1;
    const range = s.visionRange * crouchMul;
    if (n.ai === 'combat' || n.ai === 'alert') {
      n.awareness = 1;
    } else {
      const rate = (1 - d / range) * 2.6 + 0.35;
      n.awareness = Math.min(1, n.awareness + rate * dt);
    }
    n.lastKnown = { x: seen.x, y: seen.y };
    n.unseenT = 0;
    if (n.awareness >= 1 && n.ai !== 'combat' && n.ai !== 'alert') {
      n.ai = 'alert';
      n.reactT = s.reaction;
      n.target = seen.id;
      n.stateT = 0;
    } else if (n.ai === 'idle' && n.awareness > 0.25) {
      n.ai = 'suspicious';
      n.stateT = 0;
    }
  } else {
    n.unseenT += dt;
    if (n.ai !== 'combat' && n.ai !== 'alert') n.awareness = Math.max(0, n.awareness - 0.18 * dt);
  }

  let moveX = 0;
  let moveY = 0;
  let speed = s.speed;
  let wantAim: number | null = null;

  switch (n.ai) {
    case 'idle': {
      const pt = world.map.patrolPoints[n.patrolIdx]!;
      if (dist(n.x, n.y, pt.x, pt.y) < 40) {
        n.patrolIdx = Math.floor(world.rng() * world.map.patrolPoints.length);
      }
      const dir = normalize(pt.x - n.x, pt.y - n.y);
      moveX = dir.x;
      moveY = dir.y;
      speed = 85;
      wantAim = Math.atan2(dir.y, dir.x);
      break;
    }
    case 'suspicious': {
      if (n.lastKnown) wantAim = Math.atan2(n.lastKnown.y - n.y, n.lastKnown.x - n.x);
      if (n.awareness > 0.6) {
        n.ai = 'investigating';
        n.stateT = 0;
      } else if (n.awareness <= 0.02 && n.stateT > 2) {
        n.ai = 'idle';
      }
      break;
    }
    case 'investigating': {
      if (!n.lastKnown) {
        n.ai = 'idle';
        break;
      }
      const d = dist(n.x, n.y, n.lastKnown.x, n.lastKnown.y);
      const dir = normalize(n.lastKnown.x - n.x, n.lastKnown.y - n.y);
      wantAim = Math.atan2(dir.y, dir.x);
      if (d > 50) {
        moveX = dir.x;
        moveY = dir.y;
        speed = s.speed * 0.6;
      } else {
        n.ai = 'searching';
        n.stateT = 0;
      }
      if (n.stateT > 10) {
        n.ai = 'searching';
        n.stateT = 0;
      }
      break;
    }
    case 'alert': {
      if (n.lastKnown) wantAim = Math.atan2(n.lastKnown.y - n.y, n.lastKnown.x - n.x);
      n.reactT -= dt;
      if (n.reactT <= 0) {
        n.ai = 'combat';
        n.stateT = 0;
      }
      break;
    }
    case 'combat': {
      const target = world.players.get(n.target);
      if (!target || !target.alive) {
        n.target = 0;
        n.ai = 'searching';
        n.stateT = 0;
        break;
      }
      const visible = seen?.id === target.id;
      const aimAt = visible ? target : n.lastKnown;
      if (!aimAt) break;
      const dx = aimAt.x - n.x;
      const dy = aimAt.y - n.y;
      const d = Math.hypot(dx, dy);
      wantAim = Math.atan2(dy, dx);
      const toward = normalize(dx, dy);

      if (!visible) {
        if (n.unseenT > 3) {
          n.ai = 'searching';
          n.stateT = 0;
          break;
        }
        moveX = toward.x;
        moveY = toward.y;
        break;
      }

      // Keep preferred range and strafe so bullets can be dodged / weaved.
      n.strafeT -= dt;
      if (n.strafeT <= 0) {
        n.strafeDir = world.rng() < 0.5 ? -1 : 1;
        n.strafeT = 0.8 + world.rng() * 1.4;
      }
      const rangeErr = d - s.preferredRange;
      const radial = Math.abs(rangeErr) > 60 ? Math.sign(rangeErr) : 0;
      moveX = toward.x * radial + -toward.y * n.strafeDir * 0.8;
      moveY = toward.y * radial + toward.x * n.strafeDir * 0.8;
      speed = s.speed * 0.8;

      // Reflex Operative: enter the fast time layer (GDD §71).
      if (n.phase && !n.phase.active && n.phase.pendingT < 0 && d < 650 && n.phase.cooldown <= 0 &&
          n.phase.charge >= 70 && n.status.emp <= 0 && world.rng() < 0.9 * dt) {
        togglePhase(n.phase);
      }
      // Operatives dash to flank while phased.
      if (n.type === 'operative' && n.dashCd <= 0 && (n.inPhase || world.rng() < 0.4 * dt)) {
        n.dashT = 0.16;
        const side = n.strafeDir;
        const dd = normalize(-toward.y * side + toward.x * 0.3, toward.x * side + toward.y * 0.3);
        n.dashDx = dd.x;
        n.dashDy = dd.y;
        n.dashCd = n.inPhase ? 0.7 : 3;
        world.emit({ e: 'dash', id: n.id, x: n.x, y: n.y, dx: dd.x, dy: dd.y, s: world.scaleOf(n) });
      }
      // Enforcer: EMP grenade counters Phase users (GDD §60).
      if (n.type === 'enforcer' && n.empCd <= 0 && d < 520 && (target.inPhase || world.rng() < 0.25 * dt)) {
        world.throwGrenade(n, wantAim, 'emp', 'enemy', Math.min(760, d * 2.3));
        n.empCd = 12 + world.rng() * 6;
      }

      // Fire when roughly on target.
      const err = Math.abs(wrapAngle(wantAim - n.aim));
      if (!staggered && n.fireCd <= 0 && n.reloadT < 0 && err < 0.18 && d < s.visionRange) {
        if (n.status.fault > 0) {
          n.fireCd = 0.5;
        } else if (n.ammo <= 0) {
          n.reloadT = gun.reloadTime;
          world.emit({ e: 'reload', id: n.id, s: world.scaleOf(n) });
        } else if (!world.segmentBlocked(n.x, n.y, target.x, target.y, false)) {
          n.ammo--;
          n.fireCd = gun.fireInterval * (gun.auto ? 1 : 1 + world.rng() * 0.6);
          world.fireGun(n, gun, s.weapon, n.aim, false, 'enemy');
          if (n.ammo <= 0) {
            n.reloadT = gun.reloadTime;
            world.emit({ e: 'reload', id: n.id, s: world.scaleOf(n) });
          }
        }
      }
      break;
    }
    case 'searching': {
      if (n.lastKnown && dist(n.x, n.y, n.lastKnown.x, n.lastKnown.y) > 40) {
        const dir = normalize(n.lastKnown.x - n.x, n.lastKnown.y - n.y);
        moveX = dir.x;
        moveY = dir.y;
        speed = s.speed * 0.55;
        wantAim = Math.atan2(dir.y, dir.x);
      } else {
        n.lastKnown = {
          x: Math.max(80, Math.min(world.map.width - 80, n.x + (world.rng() - 0.5) * 500)),
          y: Math.max(80, Math.min(world.map.height - 80, n.y + (world.rng() - 0.5) * 500)),
        };
      }
      if (n.stateT > 7) {
        n.ai = 'idle';
        n.awareness = 0;
        n.target = 0;
      }
      break;
    }
  }

  if (blind) {
    // Optic Jam: stumble around, no aiming.
    moveX = Math.cos(n.stateT * 2 + n.id) * 0.5;
    moveY = Math.sin(n.stateT * 1.7 + n.id) * 0.5;
    wantAim = null;
    n.aim += dt * 2.5;
  }
  if (staggered) {
    moveX = moveY = 0;
  }

  if (wantAim !== null) {
    const diff = wrapAngle(wantAim - n.aim);
    const maxTurn = s.turnRate * dt;
    n.aim = wrapAngle(n.aim + Math.max(-maxTurn, Math.min(maxTurn, diff)));
  }

  if (n.dashT > 0) {
    n.dashT -= dt;
    mvx += n.dashDx * 1000;
    mvy += n.dashDy * 1000;
  } else {
    const dir = normalize(moveX, moveY);
    const mag = Math.min(1, Math.hypot(moveX, moveY));
    mvx += dir.x * speed * speedMul * mag;
    mvy += dir.y * speed * speedMul * mag;
  }

  const steps = Math.max(1, Math.ceil((Math.hypot(mvx, mvy) * dt) / (NPC_RADIUS * 0.75)));
  for (let i = 0; i < steps; i++) {
    n.x += (mvx * dt) / steps;
    n.y += (mvy * dt) / steps;
    collideCircle(world.map, world.broken, n, n.radius);
  }

  // Unstick: if we wanted to move but didn't, pick a new strafe / patrol point.
  const moved = dist(n.x, n.y, n.lastX, n.lastY);
  if ((moveX || moveY) && moved < speed * dt * 0.2) {
    n.stuckT += dt;
    if (n.stuckT > 0.6) {
      n.strafeDir *= -1;
      n.strafeT = 1;
      n.patrolIdx = Math.floor(world.rng() * world.map.patrolPoints.length);
      n.kvx += (world.rng() - 0.5) * 300;
      n.kvy += (world.rng() - 0.5) * 300;
      n.stuckT = 0;
    }
  } else {
    n.stuckT = 0;
  }
  n.lastX = n.x;
  n.lastY = n.y;
}

function findVisibleTarget(world: World, n: Npc): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  const s = n.stats;
  for (const p of world.players.values()) {
    if (!p.alive) continue;
    const d = dist(n.x, n.y, p.x, p.y);
    const range = s.visionRange * (p.move.crouching ? 0.55 : 1);
    if (d > range) continue;
    // Peripheral awareness very close, cone otherwise. Combat NPCs track all around.
    const inCone = Math.abs(wrapAngle(Math.atan2(p.y - n.y, p.x - n.x) - n.aim)) < FOV / 2;
    if (!inCone && d > 110 && n.ai !== 'combat') continue;
    if (world.segmentBlocked(n.x, n.y, p.x, p.y, false)) continue;
    if (n.target === p.id) return p;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
