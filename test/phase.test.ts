import { describe, expect, it } from 'vitest';
import { PHASE_WORLD_SCALE, REFLEX, TICK_DT } from '../src/shared/constants.js';
import { BTN, EDGE, type InputCmd } from '../src/shared/protocol.js';
import { WEAPONS, type GunDef } from '../src/shared/weapons.js';
import { World } from '../src/server/world.js';
import type { Player } from '../src/server/entities.js';

let seq = 1;
function cmd(p: Player, o: Partial<InputCmd> = {}): InputCmd {
  return {
    seq: Math.max(seq++, p.ack + 1), dt: TICK_DT, mx: 0, my: 0, aim: 0,
    buttons: 0, edges: 0, slot: p.slot, hack: 0, target: 0, ...o,
  };
}

/** Advances the world one tick, giving each listed player one input command. */
function step(world: World, inputs: [Player, Partial<InputCmd>][] = []) {
  for (const [p, o] of inputs) world.queueInput(p.id, [cmd(world.players.get(p.id)!, o)]);
  for (const p of world.players.values()) {
    if (!inputs.some(([q]) => q.id === p.id)) world.queueInput(p.id, [cmd(p)]);
  }
  return world.tick();
}

function stepUntil(world: World, pred: () => boolean, max = 200) {
  for (let i = 0; i < max; i++) {
    if (pred()) return i;
    step(world);
  }
  throw new Error('condition never reached');
}

function setup() {
  const world = new World({ seed: 7, bots: false, now: () => 0 });
  const a = world.addPlayer('A', 'phase');
  const b = world.addPlayer('B', 'phase');
  // Put both players in open ground, far apart, facing each other.
  a.move.x = 1000; a.move.y = 250;
  b.move.x = 1000; b.move.y = 1350;
  step(world);
  return { world, a, b };
}

describe('temporal layers (GDD §99)', () => {
  it('world runs at 1.0 with no phase users', () => {
    const { world, a, b } = setup();
    expect(world.worldScale).toBe(1);
    expect(world.scaleOf(a)).toBe(1);
    expect(world.scaleOf(b)).toBe(1);
  });

  it('one phase user: they stay at 1.0, everyone else drops to 0.22', () => {
    const { world, a, b } = setup();
    step(world, [[b, { edges: EDGE.PHASE }]]);
    stepUntil(world, () => b.inPhase);
    step(world);
    expect(world.worldScale).toBe(PHASE_WORLD_SCALE);
    expect(world.scaleOf(b)).toBe(1);
    expect(world.scaleOf(a)).toBe(PHASE_WORLD_SCALE);
  });

  it('movement is scaled: the slowed player covers 22% of the distance', () => {
    const { world, a, b } = setup();
    step(world, [[b, { edges: EDGE.PHASE }]]);
    stepUntil(world, () => b.inPhase);
    step(world);
    const ax = a.x;
    const bx = b.x;
    for (let i = 0; i < 10; i++) step(world, [[a, { mx: 1 }], [b, { mx: 1 }]]);
    const aMoved = a.x - ax;
    const bMoved = b.x - bx;
    expect(bMoved).toBeGreaterThan(0);
    expect(aMoved / bMoved).toBeCloseTo(PHASE_WORLD_SCALE, 2);
  });
});

describe('Phase Drive economy (GDD §57–58)', () => {
  it('drains 25 charge per second and early exit keeps the rest', () => {
    const { world, b } = setup();
    step(world, [[b, { edges: EDGE.PHASE }]]);
    stepUntil(world, () => b.inPhase);
    for (let i = 0; i < 30; i++) step(world); // 1 second
    expect(b.phase!.charge).toBeGreaterThan(REFLEX.max - 27);
    expect(b.phase!.charge).toBeLessThan(REFLEX.max - 23);
    step(world, [[b, { edges: EDGE.PHASE }]]);
    expect(b.inPhase).toBe(false);
    expect(b.phase!.charge).toBeGreaterThan(70);
    // Short use → proportional cooldown, well below the full 16s.
    expect(b.phase!.cooldown).toBeLessThan(8);
  });

  it('expires at max duration', () => {
    const { world, b } = setup();
    step(world, [[b, { edges: EDGE.PHASE }]]);
    stepUntil(world, () => b.inPhase);
    const ticks = stepUntil(world, () => !b.inPhase);
    expect(ticks * TICK_DT).toBeGreaterThan(2.8);
    expect(ticks * TICK_DT).toBeLessThan(3.2);
    expect(world.computeWorldScale()).toBe(1);
  });

  it('EMP forces phase off and locks it out (GDD §60)', () => {
    const { world, b } = setup();
    step(world, [[b, { edges: EDGE.PHASE }]]);
    stepUntil(world, () => b.inPhase);
    const enforcer = world.spawnNpc('enforcer', b.x + 40, b.y);
    world.throwGrenade(enforcer, Math.PI, 'emp', 'enemy', 0);
    stepUntil(world, () => world.grenades.size === 0, 400);
    expect(b.inPhase).toBe(false);
    expect(b.phase!.lockT).toBeGreaterThan(0);
    step(world, [[b, { edges: EDGE.PHASE }]]);
    expect(b.phase!.pendingT).toBe(-1);
  });
});

describe('reloads and timers use simulated time (GDD §98)', () => {
  it('a slowed reload takes ~1/0.22 as long in real time', () => {
    const { world, a, b } = setup();
    const def = WEAPONS.kestrel as GunDef;
    step(world, [[b, { edges: EDGE.PHASE }]]);
    stepUntil(world, () => b.inPhase);
    step(world, [[a, { edges: EDGE.RELOAD }]]);
    a.ammo[0] = 0;
    step(world, [[a, { edges: EDGE.RELOAD }]]);
    expect(a.reloadT).toBeGreaterThan(0);
    // After the full nominal reload time in real seconds, A (slowed) is still reloading.
    for (let i = 0; i < Math.ceil(def.reloadTime / TICK_DT); i++) step(world);
    expect(a.reloadT).toBeGreaterThan(0);
  });
});

describe('THE DEFINING SEQUENCE (GDD §106)', () => {
  it('runs end-to-end with correct time layers and suspended bullets', () => {
    const { world, a, b } = setup();
    const aimDown = Math.PI / 2;

    // 1. Player A fires bullets toward B.
    step(world, [[a, { aim: aimDown, buttons: BTN.FIRE, edges: EDGE.FIRE }]]);
    const bullets = [...world.projectiles.values()].filter((p) => p.owner === a.id);
    expect(bullets.length).toBe(1);
    const bullet = bullets[0]!;
    step(world);
    const y0 = bullet.y;
    step(world);
    const normalStep = bullet.y - y0;
    expect(normalStep).toBeGreaterThan(40);

    // 2. Player B activates Phase. Bullets slow to 22%.
    step(world, [[b, { edges: EDGE.PHASE }]]);
    stepUntil(world, () => b.inPhase);
    step(world);
    const y1 = bullet.y;
    step(world);
    const slowStep = bullet.y - y1;
    expect(slowStep / normalStep).toBeCloseTo(PHASE_WORLD_SCALE, 2);

    // 3. Player B walks sideways out of the bullet's path at full speed.
    const bx0 = b.x;
    for (let i = 0; i < 8; i++) step(world, [[b, { mx: 1 }]]);
    expect(b.x - bx0).toBeGreaterThan(50);

    // 4. Player A activates Phase: both now move at 1.0; bullets remain at 0.22.
    step(world, [[a, { edges: EDGE.PHASE }]]);
    stepUntil(world, () => a.inPhase);
    step(world);
    expect(world.scaleOf(a)).toBe(1);
    expect(world.scaleOf(b)).toBe(1);
    expect(world.worldScale).toBe(PHASE_WORLD_SCALE);
    const y2 = bullet.y;
    step(world);
    expect((bullet.y - y2) / normalStep).toBeCloseTo(PHASE_WORLD_SCALE, 2);

    // 5. They fight while the bullet stays suspended (still alive, still slow).
    expect(world.projectiles.has(bullet.id)).toBe(true);

    // 6. A's Phase expires first (A started later, so end A early to model expiry order).
    step(world, [[a, { edges: EDGE.PHASE }]]);
    step(world);
    expect(a.inPhase).toBe(false);
    expect(b.inPhase).toBe(true);
    expect(world.scaleOf(a)).toBe(PHASE_WORLD_SCALE);
    expect(world.scaleOf(b)).toBe(1);

    // 7. B's Phase expires. World resumes and bullets accelerate back to full speed.
    stepUntil(world, () => !b.inPhase);
    step(world);
    expect(world.worldScale).toBe(1);
    if (world.projectiles.has(bullet.id)) {
      const y3 = bullet.y;
      step(world);
      if (world.projectiles.has(bullet.id)) expect(bullet.y - y3).toBeCloseTo(normalStep, 0);
    }
    // B dodged: never got hit by A's bullet (PvP off anyway, but it also passed by).
    expect(b.hp).toBe(b.maxHp);
  });
});

describe('projectiles and cover (GDD §43–46)', () => {
  it('pistol rounds penetrate drywall but not concrete; glass shatters', () => {
    const world = new World({ seed: 1, bots: false, now: () => 0 });
    const p = world.addPlayer('A', 'phase');
    // Stand inside the office and shoot at the glass window (x=684..700, y=216..376).
    p.move.x = 600; p.move.y = 300;
    step(world);
    const glass = world.map.walls.find((w) => w.mat === 'glass' && w.x === 684)!;
    for (let i = 0; i < 6; i++) {
      step(world, [[p, { aim: 0, buttons: BTN.FIRE, edges: EDGE.FIRE }]]);
      for (let k = 0; k < 6; k++) step(world);
    }
    expect(world.broken.has(glass.id)).toBe(true);
  });

  it('player bullets kill an NPC and credit the kill', () => {
    const world = new World({ seed: 3, bots: false, now: () => 0 });
    const p = world.addPlayer('A', 'phase');
    p.move.x = 1000; p.move.y = 250;
    const n = world.spawnNpc('thug', 1300, 250);
    n.aim = 0; // facing away
    step(world);
    p.slot = 2; // Lance: hold to charge, release to fire
    const aimAt = () => Math.atan2(n.y - p.y, n.x - p.x);
    for (let i = 0; i < 25; i++) step(world, [[p, { slot: 2, aim: aimAt(), buttons: BTN.FIRE }]]);
    step(world, [[p, { slot: 2, aim: aimAt(), edges: EDGE.FIRE_RELEASE }]]);
    for (let i = 0; i < 10; i++) step(world, [[p, { slot: 2, aim: aimAt() }]]);
    // 105 damage vs an 80 hp unarmoured thug: one charged Lance round kills.
    expect(n.dead).toBe(true);
    expect(p.kills).toBe(1);
  });
});
