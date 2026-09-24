import { DASH, PLAYER_RADIUS, SLIDE, SPEED } from './constants.js';
import { type ArenaMap, collideCircle } from './map.js';
import { normalize } from './math.js';
import { BTN, EDGE, type InputCmd, type MoveState } from './protocol.js';

export function createMoveState(x: number, y: number): MoveState {
  return {
    x, y, kvx: 0, kvy: 0,
    dashT: 0, dashDx: 0, dashDy: 0, dashCharges: DASH.charges, dashRecharge: 0,
    slideT: 0, slideDx: 0, slideDy: 0,
    iframes: 0, crouching: false, sprinting: false,
  };
}

export function cloneMoveState(m: MoveState): MoveState {
  return { ...m };
}

export interface MoveContext {
  map: ArenaMap;
  broken: ReadonlySet<number>;
  /** Status multiplier (motor lock etc). */
  moveMul: number;
  /** True when the equipped weapon is a melee weapon (ALT = block instead of aim). */
  melee: boolean;
  /** Downed or dead players cannot move. */
  canMove: boolean;
}

export interface MoveResult {
  dashed: boolean;
  slid: boolean;
}

/**
 * Advances a player's movement by one input command.
 *
 * `simDt` is the command's real dt multiplied by the player's personal temporal
 * scale (GDD §97). This function is deterministic and shared by the authoritative
 * server and client-side prediction, so any change here affects both.
 */
export function stepMovement(m: MoveState, cmd: InputCmd, simDt: number, ctx: MoveContext): MoveResult {
  const res: MoveResult = { dashed: false, slid: false };
  if (simDt <= 0) return res;

  // Timers always use simulated time.
  m.iframes = Math.max(0, m.iframes - simDt);
  if (m.dashCharges < DASH.charges) {
    m.dashRecharge -= simDt;
    if (m.dashRecharge <= 0) {
      m.dashCharges++;
      m.dashRecharge = m.dashCharges < DASH.charges ? DASH.recharge : 0;
    }
  }

  if (!ctx.canMove) {
    m.dashT = 0;
    m.slideT = 0;
    m.kvx = m.kvy = 0;
    m.sprinting = false;
    m.crouching = false;
    return res;
  }

  const input = normalize(cmd.mx, cmd.my);
  const moving = input.x !== 0 || input.y !== 0;
  const held = cmd.buttons;
  m.crouching = (held & BTN.CROUCH) !== 0;
  const alt = (held & BTN.ALT) !== 0;
  const firing = (held & BTN.FIRE) !== 0;
  m.sprinting = (held & BTN.SPRINT) !== 0 && moving && !m.crouching && !alt && !firing;

  // Dash (Space). Direction = movement input, or aim if standing still.
  if ((cmd.edges & EDGE.DASH) && m.dashCharges > 0 && m.dashT <= 0) {
    const dir = moving ? input : { x: Math.cos(cmd.aim), y: Math.sin(cmd.aim) };
    m.dashT = DASH.duration;
    m.dashDx = dir.x;
    m.dashDy = dir.y;
    m.iframes = DASH.iframes;
    if (m.dashCharges === DASH.charges) m.dashRecharge = DASH.recharge;
    m.dashCharges--;
    m.slideT = 0;
    res.dashed = true;
  }

  // Slide: press crouch while sprinting.
  if ((cmd.edges & EDGE.CROUCH) && (held & BTN.SPRINT) && moving && m.slideT <= 0 && m.dashT <= 0) {
    m.slideT = SLIDE.duration;
    m.slideDx = input.x;
    m.slideDy = input.y;
    res.slid = true;
  }

  let vx = 0;
  let vy = 0;
  if (m.dashT > 0) {
    const t = Math.min(simDt, m.dashT);
    vx = m.dashDx * DASH.speed * (t / simDt);
    vy = m.dashDy * DASH.speed * (t / simDt);
    m.dashT -= simDt;
  } else if (m.slideT > 0) {
    const f = m.slideT / SLIDE.duration;
    const sp = SLIDE.speed * (0.35 + 0.65 * f);
    vx = m.slideDx * sp + input.x * 60;
    vy = m.slideDy * sp + input.y * 60;
    m.slideT -= simDt;
  } else if (moving) {
    let speed: number = SPEED.run;
    if (m.crouching) speed = SPEED.crouch;
    else if (alt) speed = ctx.melee ? SPEED.blocking : SPEED.aiming;
    else if (m.sprinting) speed = SPEED.sprint;
    speed *= ctx.moveMul;
    vx = input.x * speed;
    vy = input.y * speed;
  }

  // External impulse (knockback) decays exponentially in simulated time.
  vx += m.kvx;
  vy += m.kvy;
  const decay = Math.exp(-9 * simDt);
  m.kvx *= decay;
  m.kvy *= decay;
  if (Math.abs(m.kvx) < 1) m.kvx = 0;
  if (Math.abs(m.kvy) < 1) m.kvy = 0;

  // Sub-step fast moves so dashes can't tunnel through thin walls.
  const dx = vx * simDt;
  const dy = vy * simDt;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (PLAYER_RADIUS * 0.75)));
  for (let i = 0; i < steps; i++) {
    m.x += dx / steps;
    m.y += dy / steps;
    collideCircle(ctx.map, ctx.broken, m, PLAYER_RADIUS);
  }

  return res;
}
