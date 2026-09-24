import {
  DOWNED, EMP, GHOST_DECK, GRENADE, INJECTOR, PHASE_WORLD_SCALE, PLAYER_MAX_ARMOR,
  PLAYER_RADIUS, REGEN, TICK_DT,
} from '../shared/constants.js';
import { HACK_ORDER, HACKS, type HackId, OVERHEAT_DPS, SYSTEM_SPIKE_DAMAGE } from '../shared/hacks.js';
import { ARENA, type ArenaMap, collideCircle, MATERIALS, type Wall } from '../shared/map.js';
import {
  dist, dist2, makeRng, pointSegmentDistance, segmentCircle, segmentRect, wrapAngle,
} from '../shared/math.js';
import { stepMovement } from '../shared/movement.js';
import {
  BTN, EDGE, type GameEvent, type InputCmd, type LabCommand, type NpcType, type OsKind,
  type PlayerSnap, type SnapshotMsg, STATUS,
} from '../shared/protocol.js';
import { type GunDef, type MeleeDef, WEAPONS, type WeaponId, weaponDef } from '../shared/weapons.js';
import { updateNpc } from './ai.js';
import {
  type Actor, EMPTY_CMD, type Grenade, Npc, Player, type Projectile, type Statuses,
} from './entities.js';
import { endPhase, forcePhaseOff, phaseTimeLeft, togglePhase, updatePhase } from './phase.js';

const PLAYER_COLORS = [0x3dfcff, 0xff3fa4, 0xffc23d, 0x7dff9a, 0x8a5cff, 0xff7a3d, 0xffffff, 0x5ca8ff, 0xff5c5c, 0xc0ff3d];
const MAX_QUEUED_CMDS = 12;
const MAX_CMDS_PER_TICK = 6;

export interface WorldOptions {
  seed?: number;
  bots?: boolean;
  map?: ArenaMap;
  now?: () => number;
}

/**
 * The authoritative simulation. Everything here advances in *simulated* time:
 * each actor's dt is TICK_DT × its personal temporal scale (GDD §97–99).
 */
export class World {
  readonly map: ArenaMap;
  readonly rng: () => number;
  readonly players = new Map<number, Player>();
  readonly npcs = new Map<number, Npc>();
  readonly projectiles = new Map<number, Projectile>();
  readonly grenades = new Map<number, Grenade>();
  readonly broken = new Set<number>();
  readonly wallHp = new Map<number, number>();
  events: GameEvent[] = [];
  tickCount = 0;
  bots: boolean;
  worldScale = 1;
  waveTimer = 2;
  wave = 0;

  private nextActorId = 1;
  private nextProjId = 1;
  private readonly now: () => number;

  constructor(opts: WorldOptions = {}) {
    this.map = opts.map ?? ARENA;
    this.rng = makeRng(opts.seed ?? Date.now());
    this.bots = opts.bots ?? true;
    this.now = opts.now ?? (() => Date.now());
    for (const w of this.map.walls) if (w.hp !== undefined) this.wallHp.set(w.id, w.hp);
  }

  // ───────────────────────────────── time layers ─────────────────────────────────

  /** GDD §99: any active Phase user drops the world to 0.22. */
  computeWorldScale(): number {
    for (const p of this.players.values()) if (p.inPhase) return PHASE_WORLD_SCALE;
    for (const n of this.npcs.values()) if (n.inPhase && !n.dead) return PHASE_WORLD_SCALE;
    return 1;
  }

  /** Personal temporal scale: 1.0 inside the fast time layer, world scale otherwise. */
  scaleOf(a: Actor): number {
    return a.inPhase ? 1 : this.worldScale;
  }

  // ───────────────────────────────── players ─────────────────────────────────

  addPlayer(name: string, os: OsKind): Player {
    const id = this.nextActorId++;
    const spawn = this.pickPlayerSpawn();
    const color = PLAYER_COLORS[(id - 1) % PLAYER_COLORS.length]!;
    const p = new Player(id, name.slice(0, 16) || `Merc-${id}`, color, os, spawn.x, spawn.y);
    this.players.set(id, p);
    this.emit({ e: 'notice', text: `${p.name} jacked in` });
    this.emit({ e: 'spawn', id });
    return p;
  }

  removePlayer(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.emit({ e: 'notice', text: `${p.name} disconnected` });
  }

  queueInput(id: number, cmds: InputCmd[]): void {
    const p = this.players.get(id);
    if (!p) return;
    for (const c of cmds) {
      if (!Number.isFinite(c.seq) || c.seq <= p.ack) continue;
      if (p.cmdQueue.length && c.seq <= p.cmdQueue[p.cmdQueue.length - 1]!.seq) continue;
      p.cmdQueue.push(sanitizeCmd(c));
    }
    // A client that falls far behind drops its oldest commands instead of lagging forever.
    while (p.cmdQueue.length > MAX_QUEUED_CMDS) p.cmdQueue.shift();
  }

  labCommand(id: number, cmd: LabCommand): void {
    const p = this.players.get(id);
    if (!p) return;
    switch (cmd) {
      case 'toggleBots':
        this.bots = !this.bots;
        if (!this.bots) this.npcs.clear();
        else this.waveTimer = 1;
        this.emit({ e: 'notice', text: `Enemies ${this.bots ? 'ENABLED' : 'DISABLED'} by ${p.name}` });
        break;
      case 'spawnWave':
        this.spawnWave();
        break;
      case 'clearEnemies':
        this.npcs.clear();
        this.waveTimer = 6;
        break;
      case 'toggleOs':
        if (p.inPhase || (p.phase && p.phase.pendingT >= 0)) return;
        p.setOs(p.os === 'phase' ? 'ghost' : 'phase');
        this.emit({ e: 'notice', text: `${p.name} swapped OS → ${p.os === 'phase' ? 'PHASE DRIVE' : 'GHOST DECK'}` });
        break;
      case 'togglePvp':
        p.pvp = !p.pvp;
        this.emit({ e: 'notice', text: `${p.name} PvP ${p.pvp ? 'ON' : 'OFF'}` });
        break;
      case 'bulletCurtain':
        this.bulletCurtain(p);
        break;
    }
  }

  // ───────────────────────────────── main loop ─────────────────────────────────

  tick(): SnapshotMsg {
    this.tickCount++;
    this.worldScale = this.computeWorldScale();

    // 1. Movement from queued input commands (shared deterministic code).
    for (const p of this.players.values()) this.processCommands(p);

    // 2. Player actions (weapons, melee, hacks, Phase Drive...).
    for (const p of this.players.values()) this.updatePlayer(p, TICK_DT * this.scaleOf(p));

    // 3. NPCs.
    for (const n of this.npcs.values()) {
      const dt = TICK_DT * this.scaleOf(n);
      if (n.dead) {
        n.deadT += dt;
        if (n.deadT > 6) this.npcs.delete(n.id);
        continue;
      }
      this.updateStatuses(n, n.status, dt);
      if (n.phase) {
        const sig = updatePhase(n.phase, dt);
        if (sig === 'started') this.emit({ e: 'phaseStart', id: n.id, t: this.now(), duration: n.phase.maxDuration });
        else if (sig === 'expired') this.emit({ e: 'phaseEnd', id: n.id, forced: false });
      }
      if (!n.dead) updateNpc(this, n, dt);
    }
    this.separateActors();

    // 4. Projectiles and grenades live in the world time layer (GDD §52).
    const pdt = TICK_DT * this.worldScale;
    for (const pr of this.projectiles.values()) {
      if (!this.stepProjectile(pr, pdt)) this.projectiles.delete(pr.id);
    }
    for (const g of this.grenades.values()) {
      if (!this.stepGrenade(g, pdt)) this.grenades.delete(g.id);
    }

    // 5. Waves.
    if (this.bots && this.players.size > 0) {
      const alive = [...this.npcs.values()].filter((n) => !n.dead).length;
      if (alive === 0) {
        this.waveTimer -= TICK_DT * this.worldScale;
        if (this.waveTimer <= 0) {
          this.spawnWave();
          this.waveTimer = 5;
        }
      }
    }

    const snap = this.snapshot();
    this.events = [];
    return snap;
  }

  emit(ev: GameEvent): void {
    this.events.push(ev);
  }

  private processCommands(p: Player): void {
    const scale = this.scaleOf(p);
    const canMove = p.alive && p.status.stagger <= 0;
    let n = 0;
    while (p.cmdQueue.length && n < MAX_CMDS_PER_TICK) {
      const cmd = p.cmdQueue.shift()!;
      n++;
      const res = stepMovement(p.move, cmd, cmd.dt * scale, {
        map: this.map,
        broken: this.broken,
        moveMul: this.moveMulOf(p),
        melee: WEAPONS[p.weaponId].kind === 'melee',
        canMove,
      });
      if (res.dashed) {
        p.sinceDash = 0;
        this.emit({ e: 'dash', id: p.id, x: p.x, y: p.y, dx: p.move.dashDx, dy: p.move.dashDy, s: scale });
      }
      p.pendingEdges |= cmd.edges;
      if (cmd.hack > 0) p.pendingHack = { idx: cmd.hack, target: cmd.target };
      p.lastCmd = cmd;
      p.ack = cmd.seq;
    }
  }

  moveMulOf(p: Player): number {
    return p.status.motor > 0 ? 0.4 : 1;
  }

  // ───────────────────────────────── player update ─────────────────────────────────

  private updatePlayer(p: Player, dt: number): void {
    const cmd = p.lastCmd ?? EMPTY_CMD;
    const edges = p.pendingEdges;
    p.pendingEdges = 0;
    const hack = p.pendingHack;
    p.pendingHack = null;

    if (p.life === 'downed') {
      p.lifeT -= dt;
      if (p.lifeT <= 0) this.killPlayer(p);
      this.updateRevive(p, dt);
      return;
    }
    if (p.life === 'dead') {
      p.lifeT -= TICK_DT; // respawn timer is a menu timer, not gameplay (it's real time on purpose)
      if (p.lifeT <= 0) this.respawnPlayer(p);
      return;
    }

    p.aim = cmd.aim;
    p.sinceDash += dt;
    p.sinceHurt += dt;
    this.updateStatuses(p, p.status, dt);

    // Phase Drive (F).
    if (p.phase) {
      if (edges & EDGE.PHASE) {
        const r = togglePhase(p.phase);
        if (r === 'deactivated') this.emit({ e: 'phaseEnd', id: p.id, forced: false });
        else if (r !== 'activating') this.emit({ e: 'phaseDenied', id: p.id, reason: r });
      }
      const sig = updatePhase(p.phase, dt);
      if (sig === 'started') {
        this.emit({ e: 'phaseStart', id: p.id, t: this.now(), duration: phaseTimeLeft(p.phase) });
      } else if (sig === 'expired') {
        this.emit({ e: 'phaseEnd', id: p.id, forced: false });
      }
    }

    // Ghost Deck bandwidth + uploads.
    if (p.os === 'ghost') {
      p.bandwidth = Math.min(GHOST_DECK.bandwidthMax, p.bandwidth + GHOST_DECK.bandwidthRegen * dt);
      if (hack && (cmd.buttons & BTN.HACK)) this.startHack(p, hack.idx, hack.target);
      this.updateUploads(p, dt);
    }

    // Regeneration outside combat + trauma injector.
    if (p.sinceHurt > REGEN.delay) {
      p.hp = Math.min(p.maxHp, p.hp + REGEN.perSec * dt);
      p.armor = Math.min(PLAYER_MAX_ARMOR, p.armor + REGEN.perSec * 0.5 * dt);
    }
    if ((edges & EDGE.INJECT) && p.injectors > 0 && p.healT <= 0 && p.hp < p.maxHp) {
      p.injectors--;
      p.healT = INJECTOR.duration;
    }
    if (p.healT > 0) {
      const h = Math.min(dt, p.healT);
      p.healT -= dt;
      p.hp = Math.min(p.maxHp, p.hp + (INJECTOR.heal / INJECTOR.duration) * h);
    }

    // Grenades.
    if (p.grenades < GRENADE.carried) {
      p.grenadeRecharge -= dt;
      if (p.grenadeRecharge <= 0) {
        p.grenades++;
        p.grenadeRecharge = GRENADE.rechargeTime;
      }
    }
    if ((edges & EDGE.GRENADE) && p.grenades > 0) {
      if (p.grenades === GRENADE.carried) p.grenadeRecharge = GRENADE.rechargeTime;
      p.grenades--;
      this.throwGrenade(p, p.aim, 'frag', 'player');
    }

    // Weapon switching cancels reloads, charges and swings.
    const slot = Math.max(0, Math.min(3, cmd.slot | 0));
    if (slot !== p.slot) {
      p.slot = slot;
      p.reloadT = -1;
      p.chargeT = 0;
      p.melee.phase = 'none';
      p.blockT = -1;
      p.fireCd = Math.max(p.fireCd, 0.18);
    }

    const def = weaponDef(p.weaponId);
    if (p.status.stagger > 0) {
      p.chargeT = 0;
      return;
    }
    if (def.kind === 'gun') this.updateGun(p, def, cmd, edges, dt);
    else this.updateMelee(p, def, cmd, edges, dt);
  }

  private updateGun(p: Player, def: GunDef, cmd: InputCmd, edges: number, dt: number): void {
    p.blockT = -1;
    p.fireCd -= dt;
    p.fireBuffer -= dt;
    const firing = (cmd.buttons & BTN.FIRE) !== 0;
    if (edges & EDGE.FIRE) p.fireBuffer = 0.12;

    if (p.reloadT >= 0) {
      p.reloadT -= dt;
      if (p.reloadT < 0) {
        p.ammo[p.slot] = def.magSize;
        p.reloadT = -1;
      }
      return;
    }

    const ammo = p.ammo[p.slot]!;
    if ((edges & EDGE.RELOAD) && ammo < def.magSize) {
      this.startReload(p, def);
      return;
    }

    if (def.chargeTime) {
      // Electromagnetic: hold to charge, release to fire (GDD §42).
      if (firing && ammo > 0 && p.fireCd <= 0) p.chargeT += dt;
      const released = (edges & EDGE.FIRE_RELEASE) || (!firing && p.chargeT > 0);
      if (released) {
        if (p.chargeT >= def.chargeTime && p.status.fault <= 0) {
          this.fireFromPlayer(p, def, cmd);
        } else if (p.status.fault > 0 && p.chargeT > 0) {
          this.emit({ e: 'dryFire', id: p.id });
        }
        p.chargeT = 0;
      }
      if (ammo <= 0 && (edges & EDGE.FIRE)) this.startReload(p, def);
      return;
    }

    const wantFire = def.auto ? firing : p.fireBuffer > 0;
    if (wantFire && p.fireCd <= 0) {
      if (ammo <= 0) {
        this.startReload(p, def);
      } else if (p.status.fault > 0) {
        this.emit({ e: 'dryFire', id: p.id });
        p.fireCd = 0.3;
        p.fireBuffer = 0;
      } else {
        this.fireFromPlayer(p, def, cmd);
      }
    }
  }

  private startReload(p: Player, def: GunDef): void {
    p.reloadT = def.reloadTime;
    p.chargeT = 0;
    this.emit({ e: 'reload', id: p.id, s: this.scaleOf(p) });
  }

  private fireFromPlayer(p: Player, def: GunDef, cmd: InputCmd): void {
    p.ammo[p.slot]!--;
    p.fireCd = def.fireInterval;
    p.fireBuffer = 0;
    const aiming = (cmd.buttons & BTN.ALT) !== 0;
    this.fireGun(p, def, p.weaponId, p.aim, aiming, 'player');
    if (p.ammo[p.slot] === 0) this.startReload(p, def);
  }

  private updateMelee(p: Player, def: MeleeDef, cmd: InputCmd, edges: number, dt: number): void {
    const m = p.melee;
    const held = (cmd.buttons & BTN.FIRE) !== 0;
    const blocking = (cmd.buttons & BTN.ALT) !== 0 && (m.phase === 'none' || m.phase === 'charging');

    if (blocking) {
      if (p.blockT < 0) p.blockT = 0;
      else p.blockT += dt;
      m.phase = 'none';
      return;
    }
    p.blockT = -1;

    switch (m.phase) {
      case 'none':
        if (edges & EDGE.FIRE) {
          m.phase = 'charging';
          m.t = 0;
        }
        break;
      case 'charging': {
        m.t += dt;
        const release = !held || (edges & EDGE.FIRE_RELEASE);
        if (release || m.t >= def.heavy.charge + 0.15) {
          m.heavy = m.t >= def.heavy.charge;
          m.dashAttack = !m.heavy && (p.move.dashT > 0 || p.sinceDash < 0.2);
          m.phase = 'windup';
          m.t = 0;
          m.hit.clear();
        }
        break;
      }
      case 'windup': {
        m.t += dt;
        const spec = m.heavy ? def.heavy : def.light;
        if (m.t >= spec.windup) {
          m.phase = 'active';
          m.t = 0;
          this.emit({ e: 'swing', id: p.id, x: p.x, y: p.y, a: p.aim, heavy: m.heavy, s: this.scaleOf(p) });
          this.makeNoise(p.x, p.y, 200);
        }
        break;
      }
      case 'active': {
        const spec = m.heavy ? def.heavy : def.light;
        this.meleeSweep(p, def);
        m.t += dt;
        if (m.t >= spec.active) {
          m.phase = 'recovery';
          m.t = 0;
        }
        break;
      }
      case 'recovery': {
        const spec = m.heavy ? def.heavy : def.light;
        m.t += dt;
        if (m.t >= spec.recovery) m.phase = 'none';
        // Allow a buffered light attack to chain out of the tail of recovery.
        if ((edges & EDGE.FIRE) && m.t >= spec.recovery * 0.5) {
          m.phase = 'charging';
          m.t = 0;
        }
        break;
      }
    }
  }

  private meleeSweep(p: Player, def: MeleeDef): void {
    const m = p.melee;
    const spec = m.heavy ? def.heavy : def.light;
    const range = spec.range + (m.dashAttack ? 24 : 0);
    const targets: Actor[] = [...this.npcs.values(), ...this.players.values()];
    for (const t of targets) {
      if (t === p || m.hit.has(t.id)) continue;
      if (t.kind === 'npc' ? t.dead : !t.alive) continue;
      if (t.kind === 'player' && !(p.pvp && t.pvp)) continue;
      const d = dist(p.x, p.y, t.x, t.y);
      if (d > range + t.radius) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(t.y - p.y, t.x - p.x) - p.aim));
      if (ang > spec.arc / 2 && d > t.radius * 1.5) continue;
      if (this.segmentBlocked(p.x, p.y, t.x, t.y, false)) continue;
      m.hit.add(t.id);

      // Players blocking/parrying in PvP.
      if (t.kind === 'player' && t.blockT >= 0 && this.facing(t, p.x, p.y)) {
        if (t.blockT <= (WEAPONS.veilEdge as MeleeDef).parryWindow) {
          p.status.stagger = 0.7;
          p.melee.phase = 'none';
          this.emit({ e: 'parry', id: t.id, x: t.x, y: t.y, s: this.scaleOf(t) });
          return;
        }
      }

      let dmg = spec.damage * (m.dashAttack ? 1.4 : 1);
      const finisher = t.status.stagger > 0 || t.status.optic > 0;
      if (finisher) dmg *= 2.2;
      if (t.kind === 'player' && t.blockT >= 0 && this.facing(t, p.x, p.y)) {
        dmg *= 1 - (WEAPONS.veilEdge as MeleeDef).blockReduction;
      }
      const kx = Math.cos(p.aim);
      const ky = Math.sin(p.aim);
      this.damage(t, dmg, p.id, p.weaponId, {
        head: finisher,
        pierceArmor: true,
        kbx: kx * (m.heavy ? 520 : 220),
        kby: ky * (m.heavy ? 520 : 220),
        stagger: m.heavy ? 0.6 : 0.18,
        hx: t.x - kx * t.radius,
        hy: t.y - ky * t.radius,
      });
    }

    // Blades cut through destructible cover.
    for (const w of this.map.walls) {
      if (this.broken.has(w.id) || w.hp === undefined || m.hit.has(-w.id)) continue;
      const cx = Math.max(w.x, Math.min(p.x + Math.cos(p.aim) * range * 0.6, w.x + w.w));
      const cy = Math.max(w.y, Math.min(p.y + Math.sin(p.aim) * range * 0.6, w.y + w.h));
      if (dist(p.x + Math.cos(p.aim) * range * 0.6, p.y + Math.sin(p.aim) * range * 0.6, cx, cy) < range * 0.5) {
        m.hit.add(-w.id);
        this.damageWall(w, spec.damage * 1.5);
      }
    }
  }

  private facing(a: Actor, x: number, y: number): boolean {
    return Math.abs(wrapAngle(Math.atan2(y - a.y, x - a.x) - a.aim)) < 1.25;
  }

  private updateRevive(p: Player, dt: number): void {
    let reviver: Player | null = null;
    for (const o of this.players.values()) {
      if (o === p || !o.alive) continue;
      if ((o.lastCmd.buttons & BTN.INTERACT) && dist(o.x, o.y, p.x, p.y) < DOWNED.reviveRange) {
        reviver = o;
        break;
      }
    }
    if (reviver) {
      p.reviveP += (TICK_DT * this.scaleOf(reviver)) / DOWNED.reviveTime;
      if (p.reviveP >= 1) {
        p.life = 'alive';
        p.hp = p.maxHp * DOWNED.reviveHpFraction;
        p.reviveP = 0;
        p.sinceHurt = 0;
        this.emit({ e: 'revived', id: p.id, by: reviver.id });
      }
    } else {
      p.reviveP = Math.max(0, p.reviveP - dt * 0.5);
    }
  }

  private killPlayer(p: Player): void {
    p.life = 'dead';
    p.lifeT = DOWNED.respawnDelay;
    p.deaths++;
    p.reviveP = 0;
    if (p.phase && p.phase.active) {
      endPhase(p.phase);
      this.emit({ e: 'phaseEnd', id: p.id, forced: true });
    }
  }

  private respawnPlayer(p: Player): void {
    const s = this.pickPlayerSpawn();
    const fresh = new Player(p.id, p.name, p.color, p.os, s.x, s.y);
    fresh.kills = p.kills;
    fresh.deaths = p.deaths;
    fresh.pvp = p.pvp;
    fresh.ack = p.ack;
    fresh.lastCmd = p.lastCmd;
    fresh.slot = p.slot;
    this.players.set(p.id, fresh);
    this.emit({ e: 'spawn', id: p.id });
  }

  private pickPlayerSpawn(): { x: number; y: number } {
    const spawns = this.map.playerSpawns;
    let best = spawns[0]!;
    let bestScore = -Infinity;
    for (const s of spawns) {
      let score = this.rng() * 50;
      for (const p of this.players.values()) score -= p.alive && dist(p.x, p.y, s.x, s.y) < 40 ? 1000 : 0;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  // ───────────────────────────────── statuses & hacks ─────────────────────────────────

  updateStatuses(a: Actor, s: Statuses, dt: number): void {
    s.optic = Math.max(0, s.optic - dt);
    s.motor = Math.max(0, s.motor - dt);
    s.fault = Math.max(0, s.fault - dt);
    s.emp = Math.max(0, s.emp - dt);
    s.stagger = Math.max(0, s.stagger - dt);
    if (s.overheat > 0) {
      const t = Math.min(dt, s.overheat);
      s.overheat -= dt;
      this.damage(a, OVERHEAT_DPS * t, s.overheatSrc, 'overheat', { pierceArmor: true, silent: true });
    }
  }

  private startHack(p: Player, idx: number, targetId: number): void {
    const hackId = HACK_ORDER[idx - 1];
    if (!hackId) return;
    const def = HACKS[hackId];
    const target = this.actorById(targetId);
    if (!target || target === p) return;
    if (target.kind === 'npc' ? target.dead : !(target.alive && p.pvp && target.pvp)) return;
    if (dist(p.x, p.y, target.x, target.y) > GHOST_DECK.range) return;
    if (p.uploads.length >= GHOST_DECK.queueSize) return;
    if (p.bandwidth < def.cost) return;
    p.bandwidth -= def.cost;
    p.uploads.push({ hack: hackId, target: targetId, t: 0, total: def.upload });
    this.emit({ e: 'hackStart', src: p.id, target: targetId, hack: hackId });
  }

  private updateUploads(p: Player, dt: number): void {
    // Uploads run sequentially; the head of the queue progresses in the hacker's time.
    const u = p.uploads[0];
    if (!u) return;
    const target = this.actorById(u.target);
    if (!target || (target.kind === 'npc' ? target.dead : !target.alive) ||
        dist(p.x, p.y, target.x, target.y) > GHOST_DECK.range * 1.3) {
      p.uploads.shift();
      return;
    }
    u.t += dt;
    if (u.t >= u.total) {
      p.uploads.shift();
      this.applyHack(p, target, u.hack);
    }
  }

  applyHack(src: Actor, target: Actor, hack: HackId): void {
    const def = HACKS[hack];
    const s = target.status;
    switch (hack) {
      case 'opticJam': s.optic = def.duration; break;
      case 'motorLock': s.motor = def.duration; break;
      case 'weaponFault': s.fault = def.duration; break;
      case 'overheat': s.overheat = def.duration; s.overheatSrc = src.id; break;
      case 'systemSpike': {
        const aug = target.kind === 'npc' ? target.stats.augmented : (target.phase !== null);
        this.damage(target, SYSTEM_SPIKE_DAMAGE * (aug ? 1.5 : 1), src.id, 'systemSpike', { pierceArmor: true, stagger: 0.35 });
        break;
      }
      case 'synapseDrain': {
        const pd = target.phase;
        if (pd) {
          pd.charge = Math.max(0, pd.charge - 60);
          pd.cooldown += 5;
          if (forcePhaseOff(pd, 1.5)) this.emit({ e: 'phaseEnd', id: target.id, forced: true });
        } else {
          this.damage(target, 15, src.id, 'synapseDrain', { pierceArmor: true });
        }
        break;
      }
    }
    if (target.kind === 'npc') this.alertNpc(target, src);
    this.emit({ e: 'hackLand', src: src.id, target: target.id, hack });
  }

  // ───────────────────────────────── combat core ─────────────────────────────────

  actorById(id: number): Actor | undefined {
    return this.players.get(id) ?? this.npcs.get(id);
  }

  fireGun(shooter: Actor, def: GunDef, weapon: WeaponId, aim: number, aiming: boolean, team: 'player' | 'enemy'): void {
    const spread = aiming ? def.spreadAim : def.spreadHip;
    const mx = shooter.x + Math.cos(aim) * (shooter.radius + 8);
    const my = shooter.y + Math.sin(aim) * (shooter.radius + 8);
    // Don't spawn bullets on the far side of a wall we're pressed against.
    const blocked = this.segmentBlocked(shooter.x, shooter.y, mx, my, true);
    const sx = blocked ? shooter.x : mx;
    const sy = blocked ? shooter.y : my;
    for (let i = 0; i < def.pellets; i++) {
      const a = aim + (this.rng() * 2 - 1) * spread;
      const sp = def.speed * (def.pellets > 1 ? 0.9 + this.rng() * 0.2 : 1);
      const pr: Projectile = {
        id: this.nextProjId++,
        x: sx, y: sy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        owner: shooter.id, team,
        damage: def.damage, pen: def.penetration, life: def.lifetime,
        weapon, knockback: def.knockback, deflected: false,
        hit: new Set([shooter.id]),
      };
      this.projectiles.set(pr.id, pr);
    }
    this.emit({ e: 'shot', id: shooter.id, x: sx, y: sy, a: aim, w: weapon, s: this.scaleOf(shooter) });
    this.makeNoise(shooter.x, shooter.y, def.noise, team === 'player' ? shooter.id : 0);
  }

  /** Returns false when the projectile should be removed. */
  private stepProjectile(p: Projectile, dt: number): boolean {
    if (dt <= 0) return true;
    p.life -= dt;
    if (p.life <= 0) return false;

    let x0 = p.x;
    let y0 = p.y;
    let x1 = x0 + p.vx * dt;
    let y1 = y0 + p.vy * dt;

    for (let iter = 0; iter < 12; iter++) {
      let bestT = Infinity;
      let bestWall: Wall | null = null;
      let bestNx = 0;
      let bestNy = 0;
      let bestActor: Actor | null = null;

      for (const w of this.map.walls) {
        if (this.broken.has(w.id) || p.hit.has(-w.id)) continue;
        const r = segmentRect(x0, y0, x1, y1, w);
        if (r && r.t < bestT) {
          bestT = r.t;
          bestWall = w;
          bestNx = r.nx;
          bestNy = r.ny;
        }
      }
      for (const a of this.projectileTargets(p)) {
        const t = segmentCircle(x0, y0, x1, y1, a.x, a.y, a.radius);
        if (t >= 0 && t < bestT) {
          bestT = t;
          bestActor = a;
          bestWall = null;
        }
      }
      if (bestT === Infinity) break;

      const hx = x0 + (x1 - x0) * bestT;
      const hy = y0 + (y1 - y0) * bestT;

      if (bestWall) {
        const mat = MATERIALS[bestWall.mat];
        if (bestWall.hp !== undefined) this.damageWall(bestWall, p.damage * (p.weapon === 'lance' ? 3 : 1));
        const broke = this.broken.has(bestWall.id);
        if (broke || mat.resistance <= p.pen) {
          p.pen -= broke ? 0 : mat.resistance;
          if (mat.resistance > 0) p.damage *= 0.72;
          p.hit.add(-bestWall.id);
          this.emit({ e: 'pierce', x: hx, y: hy, mat: bestWall.mat });
          x0 = hx;
          y0 = hy;
          continue;
        }
        this.emit({ e: 'impact', x: hx, y: hy, nx: bestNx, ny: bestNy, mat: bestWall.mat, s: this.worldScale });
        return false;
      }

      const a = bestActor!;
      p.hit.add(a.id);

      // Dash i-frames: the bullet passes through (GDD §53 bullet dodging).
      if (a.kind === 'player' && a.move.iframes > 0) {
        x0 = hx;
        y0 = hy;
        continue;
      }

      // Sword block / parry.
      if (a.kind === 'player' && a.blockT >= 0 && this.facing(a, hx - p.vx, hy - p.vy)) {
        const def = WEAPONS.veilEdge as MeleeDef;
        if (a.blockT <= def.parryWindow + 0.05) {
          const sp = Math.hypot(p.vx, p.vy);
          p.vx = Math.cos(a.aim) * sp;
          p.vy = Math.sin(a.aim) * sp;
          p.owner = a.id;
          p.team = 'player';
          p.deflected = true;
          p.hit.clear();
          p.hit.add(a.id);
          p.life = Math.max(p.life, 0.6);
          this.emit({ e: 'parry', id: a.id, x: hx, y: hy, s: this.scaleOf(a) });
          const remaining = 1 - bestT;
          x0 = hx;
          y0 = hy;
          x1 = hx + p.vx * dt * remaining;
          y1 = hy + p.vy * dt * remaining;
          continue;
        }
        p.damage *= 0.5;
      }

      const closest = pointSegmentDistance(a.x, a.y, p.x, p.y, x1, y1);
      const head = closest < a.radius * 0.38;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const lance = p.weapon === 'lance';
      this.damage(a, p.damage * (head ? 1.75 : 1), p.owner, p.weapon, {
        head,
        pierceArmor: lance,
        kbx: (p.vx / sp) * p.knockback,
        kby: (p.vy / sp) * p.knockback,
        stagger: lance ? 0.5 : p.weapon === 'breaker' ? 0.12 : 0,
        hx, hy,
      });

      if (p.pen >= 1) {
        p.pen -= 1;
        p.damage *= 0.8;
        x0 = hx;
        y0 = hy;
        continue;
      }
      return false;
    }

    p.x = x1;
    p.y = y1;
    return !(p.x < -100 || p.y < -100 || p.x > this.map.width + 100 || p.y > this.map.height + 100);
  }

  private *projectileTargets(p: Projectile): Iterable<Actor> {
    const shooter = this.actorById(p.owner);
    for (const n of this.npcs.values()) {
      if (n.dead || p.hit.has(n.id)) continue;
      if (p.team === 'player') yield n;
    }
    for (const pl of this.players.values()) {
      if (!pl.alive || p.hit.has(pl.id)) continue;
      if (p.team === 'enemy') yield pl;
      else if (shooter && shooter.kind === 'player' && shooter.pvp && pl.pvp && shooter !== pl) yield pl;
    }
  }

  damageWall(w: Wall, amount: number): void {
    const hp = this.wallHp.get(w.id);
    if (hp === undefined || this.broken.has(w.id)) return;
    const next = hp - amount;
    this.wallHp.set(w.id, next);
    if (next <= 0) {
      this.broken.add(w.id);
      this.emit({ e: 'wallBroken', id: w.id });
    }
  }

  damage(
    t: Actor,
    amount: number,
    srcId: number,
    weapon: string,
    o: {
      head?: boolean; pierceArmor?: boolean; kbx?: number; kby?: number;
      stagger?: number; hx?: number; hy?: number; silent?: boolean;
    } = {},
  ): void {
    if (t.kind === 'player' ? !t.alive : t.dead) return;
    let dmg = amount;
    let armorHit = false;
    if (t.armor > 0) {
      const absorb = Math.min(t.armor, dmg * (o.pierceArmor ? 0.3 : 0.65));
      t.armor -= absorb;
      dmg -= absorb;
      armorHit = absorb > 0;
    }
    t.hp -= dmg;
    if (o.stagger) t.status.stagger = Math.max(t.status.stagger, o.stagger);

    if (t.kind === 'player') {
      t.sinceHurt = 0;
      if (o.kbx || o.kby) {
        t.move.kvx += o.kbx ?? 0;
        t.move.kvy += o.kby ?? 0;
      }
    } else {
      t.kvx += (o.kbx ?? 0) * 1.4;
      t.kvy += (o.kby ?? 0) * 1.4;
      const src = this.actorById(srcId);
      if (src) this.alertNpc(t, src);
    }

    const kill = t.hp <= 0;
    if (!o.silent || kill) {
      this.emit({
        e: 'hit', x: o.hx ?? t.x, y: o.hy ?? t.y, target: t.id, src: srcId,
        dmg: Math.round(amount), head: !!o.head, armor: armorHit, kill, s: this.scaleOf(t),
      });
    }

    if (!kill) return;
    t.hp = 0;
    const killer = this.players.get(srcId);
    if (t.kind === 'npc') {
      t.dead = true;
      t.deadT = 0;
      if (t.phase?.active) {
        endPhase(t.phase);
        this.emit({ e: 'phaseEnd', id: t.id, forced: true });
      }
      if (killer) killer.kills++;
      this.emit({ e: 'kill', killer: srcId, victim: t.id, weapon });
    } else {
      t.life = 'downed';
      t.lifeT = DOWNED.bleedout;
      t.reloadT = -1;
      t.melee.phase = 'none';
      t.uploads = [];
      if (t.phase && (t.phase.active || t.phase.pendingT >= 0)) {
        const was = t.phase.active;
        endPhase(t.phase);
        if (was) this.emit({ e: 'phaseEnd', id: t.id, forced: true });
      }
      if (killer && killer !== t) killer.kills++;
      this.emit({ e: 'downed', id: t.id });
      this.emit({ e: 'kill', killer: srcId, victim: t.id, weapon });
    }
  }

  throwGrenade(a: Actor, aim: number, kind: 'frag' | 'emp', team: 'player' | 'enemy', speed: number = GRENADE.throwSpeed): void {
    const g: Grenade = {
      id: this.nextProjId++,
      x: a.x + Math.cos(aim) * (a.radius + 6),
      y: a.y + Math.sin(aim) * (a.radius + 6),
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      fuse: GRENADE.fuse,
      owner: a.id,
      team,
      kind,
    };
    if (this.segmentBlocked(a.x, a.y, g.x, g.y, true)) {
      g.x = a.x;
      g.y = a.y;
    }
    this.grenades.set(g.id, g);
  }

  private stepGrenade(g: Grenade, dt: number): boolean {
    if (dt <= 0) return true;
    g.fuse -= dt;
    const decay = Math.exp(-GRENADE.friction * dt);
    g.vx *= decay;
    g.vy *= decay;
    const pos = { x: g.x + g.vx * dt, y: g.y + g.vy * dt };
    for (const w of this.map.walls) {
      if (this.broken.has(w.id)) continue;
      const r = segmentRect(g.x, g.y, pos.x, pos.y, w);
      if (r) {
        pos.x = g.x + (pos.x - g.x) * r.t + r.nx * 2;
        pos.y = g.y + (pos.y - g.y) * r.t + r.ny * 2;
        if (r.nx) g.vx = -g.vx * 0.5;
        if (r.ny) g.vy = -g.vy * 0.5;
        break;
      }
    }
    g.x = pos.x;
    g.y = pos.y;
    collideCircle(this.map, this.broken, g, 6);
    if (g.fuse > 0) return true;
    this.explode(g);
    return false;
  }

  private explode(g: Grenade): void {
    const r = g.kind === 'emp' ? EMP.radius : GRENADE.radius;
    this.emit({ e: 'explosion', x: g.x, y: g.y, r, kind: g.kind, s: this.worldScale });
    this.makeNoise(g.x, g.y, 1100, g.team === 'player' ? g.owner : 0);
    const shooter = this.actorById(g.owner);
    const actors: Actor[] = [...this.players.values(), ...this.npcs.values()];
    for (const a of actors) {
      if (a.kind === 'player' ? !a.alive : a.dead) continue;
      const d = dist(g.x, g.y, a.x, a.y);
      if (d > r + a.radius) continue;
      if (this.segmentBlocked(g.x, g.y, a.x, a.y, true)) continue;
      if (g.kind === 'emp') {
        // EMP: Phase Drive counterplay (GDD §60).
        if (a.phase && forcePhaseOff(a.phase, EMP.phaseLock)) {
          this.emit({ e: 'phaseEnd', id: a.id, forced: true });
        } else if (a.phase) {
          a.phase.lockT = Math.max(a.phase.lockT, EMP.phaseLock);
        }
        a.status.emp = EMP.phaseLock;
        if (a.kind === 'player') {
          a.bandwidth *= 0.5;
          a.uploads = [];
        }
        a.status.stagger = Math.max(a.status.stagger, 0.3);
        continue;
      }
      // Frag: players' grenades don't hurt other players unless both are PvP.
      if (a.kind === 'player' && g.team === 'player' && a.id !== g.owner &&
          !(shooter?.kind === 'player' && shooter.pvp && a.pvp)) continue;
      if (a.kind === 'npc' && g.team === 'enemy') continue;
      const f = 1 - Math.min(1, d / (r + a.radius));
      const nx = (a.x - g.x) / (d || 1);
      const ny = (a.y - g.y) / (d || 1);
      this.damage(a, GRENADE.damage * (0.25 + 0.75 * f), g.owner, 'frag', {
        kbx: nx * 700 * f, kby: ny * 700 * f, stagger: 0.4 * f,
      });
    }
    if (g.kind === 'frag') {
      for (const w of this.map.walls) {
        if (w.hp === undefined || this.broken.has(w.id)) continue;
        const cx = Math.max(w.x, Math.min(g.x, w.x + w.w));
        const cy = Math.max(w.y, Math.min(g.y, w.y + w.h));
        if (dist2(g.x, g.y, cx, cy) < r * r) this.damageWall(w, GRENADE.damage * 2);
      }
    }
  }

  /** True if the segment is blocked by a solid wall. Vision passes through glass. */
  segmentBlocked(x0: number, y0: number, x1: number, y1: number, glassBlocks: boolean): boolean {
    for (const w of this.map.walls) {
      if (this.broken.has(w.id)) continue;
      if (!glassBlocks && w.mat === 'glass') continue;
      if (segmentRect(x0, y0, x1, y1, w)) return true;
    }
    return false;
  }

  makeNoise(x: number, y: number, radius: number, sourcePlayer = 0): void {
    for (const n of this.npcs.values()) {
      if (n.dead) continue;
      const d = dist(x, y, n.x, n.y);
      if (d > radius) continue;
      if (n.ai === 'combat' || n.ai === 'alert') continue;
      n.lastKnown = { x, y };
      n.awareness = Math.max(n.awareness, d < radius * 0.45 && sourcePlayer ? 1 : 0.65);
      if (n.awareness >= 1 && sourcePlayer) {
        n.target = sourcePlayer;
        n.ai = 'alert';
        n.reactT = n.stats.reaction;
      } else {
        n.ai = 'investigating';
      }
      n.stateT = 0;
    }
  }

  alertNpc(n: Npc, src: Actor): void {
    if (n.dead || src.kind !== 'player') return;
    n.target = src.id;
    n.lastKnown = { x: src.x, y: src.y };
    n.awareness = 1;
    if (n.ai !== 'combat') {
      n.ai = 'combat';
      n.reactT = Math.max(n.reactT, n.stats.reaction * 0.6);
    }
    n.unseenT = 0;
  }

  private separateActors(): void {
    const npcs = [...this.npcs.values()].filter((n) => !n.dead);
    for (let i = 0; i < npcs.length; i++) {
      const a = npcs[i]!;
      for (let j = i + 1; j < npcs.length; j++) {
        const b = npcs[j]!;
        const d = dist(a.x, a.y, b.x, b.y);
        const min = a.radius + b.radius;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          const nx = (b.x - a.x) / d;
          const ny = (b.y - a.y) / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
      // NPCs yield to players so player prediction stays exact.
      for (const p of this.players.values()) {
        if (p.life === 'dead') continue;
        const d = dist(a.x, a.y, p.x, p.y);
        const min = a.radius + PLAYER_RADIUS;
        if (d > 0 && d < min) {
          a.x -= ((p.x - a.x) / d) * (min - d);
          a.y -= ((p.y - a.y) / d) * (min - d);
        }
      }
      collideCircle(this.map, this.broken, a, a.radius);
    }
  }

  // ───────────────────────────────── spawning ─────────────────────────────────

  spawnNpc(type: NpcType, x: number, y: number): Npc {
    const id = this.nextActorId++;
    const n = new Npc(id, type, x, y, Math.floor(this.rng() * this.map.patrolPoints.length));
    this.npcs.set(id, n);
    return n;
  }

  spawnWave(): void {
    this.wave++;
    const extra = Math.max(0, this.players.size - 1);
    const types: NpcType[] = ['thug', 'thug', 'thug', 'enforcer', 'operative'];
    for (let i = 0; i < extra; i++) types.push(i % 2 ? 'enforcer' : 'thug');
    if (this.wave % 3 === 0) types.push('operative');
    const spawns = this.map.enemySpawns;
    types.forEach((type, i) => {
      const s = spawns[i % spawns.length]!;
      const n = this.spawnNpc(type, s.x + (this.rng() - 0.5) * 60, s.y + (this.rng() - 0.5) * 60);
      if (n.phase) n.phase.cooldown = 5;
    });
    this.emit({ e: 'notice', text: `WAVE ${this.wave} — ${types.length} hostiles inbound` });
  }

  /** Lab tool: a wall of slow enemy bullets for practising Phase weaving (GDD §106). */
  private bulletCurtain(p: Player): void {
    const def = WEAPONS.thugPistol as GunDef;
    const x = this.map.width - 60;
    for (let i = 0; i < 26; i++) {
      const y = 80 + i * ((this.map.height - 160) / 25);
      const a = Math.atan2(p.y - y, p.x - x) + (this.rng() - 0.5) * 0.05;
      const pr: Projectile = {
        id: this.nextProjId++, x, y,
        vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
        owner: 0, team: 'enemy', damage: 10, pen: 0, life: 4,
        weapon: 'thugPistol', knockback: def.knockback, deflected: false, hit: new Set(),
      };
      this.projectiles.set(pr.id, pr);
    }
    this.emit({ e: 'notice', text: `${p.name} triggered a BULLET CURTAIN` });
  }

  // ───────────────────────────────── snapshot ─────────────────────────────────

  snapshot(): SnapshotMsg {
    const players: PlayerSnap[] = [];
    for (const p of this.players.values()) {
      const def = WEAPONS[p.weaponId];
      const s = p.status;
      players.push({
        id: p.id,
        name: p.name,
        color: p.color,
        os: p.os,
        move: { ...p.move },
        aim: p.aim,
        hp: Math.round(p.hp * 10) / 10,
        armor: Math.round(p.armor * 10) / 10,
        life: p.life,
        lifeT: p.lifeT,
        reviveP: p.reviveP,
        slot: p.slot,
        ammo: [...p.ammo],
        reloadP: p.reloadT >= 0 && def.kind === 'gun' ? 1 - p.reloadT / def.reloadTime : -1,
        chargeP: def.kind === 'gun' && def.chargeTime ? Math.min(1, p.chargeT / def.chargeTime) : 0,
        melee: p.melee.phase,
        meleeHeavy: p.melee.heavy,
        blocking: p.blockT >= 0,
        scale: this.scaleOf(p),
        phase: p.inPhase,
        phasePending: (p.phase?.pendingT ?? -1) >= 0,
        phaseLeft: p.phase ? phaseTimeLeft(p.phase) : 0,
        phaseCd: p.phase ? Math.max(p.phase.cooldown, p.phase.lockT) : 0,
        reflex: p.phase ? p.phase.charge : 0,
        bandwidth: p.bandwidth,
        uploads: p.uploads.map((u) => ({ hack: u.hack, target: u.target, p: u.t / u.total })),
        grenades: p.grenades,
        injectors: p.injectors,
        status: statusBits(s),
        moveMul: this.moveMulOf(p),
        pvp: p.pvp,
        kills: p.kills,
        deaths: p.deaths,
        ack: p.ack,
      });
    }
    return {
      type: 'snap',
      t: this.now(),
      tick: this.tickCount,
      worldScale: this.worldScale,
      bots: this.bots,
      players,
      npcs: [...this.npcs.values()].map((n) => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        aim: n.aim,
        hp: n.hp,
        maxHp: n.maxHp,
        armor: n.armor,
        ai: n.ai,
        awareness: n.awareness,
        scale: this.scaleOf(n),
        phase: n.inPhase,
        status: statusBits(n.status),
        reloading: n.reloadT >= 0,
        dead: n.dead,
      })),
      proj: [...this.projectiles.values()].map((p) => ({
        id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, w: p.weapon, o: p.owner, d: p.deflected,
      })),
      nades: [...this.grenades.values()].map((g) => ({ id: g.id, x: g.x, y: g.y, kind: g.kind, fuse: g.fuse })),
      broken: [...this.broken],
      events: this.events,
    };
  }
}

function statusBits(s: Statuses): number {
  return (s.optic > 0 ? STATUS.OPTIC_JAM : 0) |
    (s.motor > 0 ? STATUS.MOTOR_LOCK : 0) |
    (s.fault > 0 ? STATUS.WEAPON_FAULT : 0) |
    (s.overheat > 0 ? STATUS.OVERHEAT : 0) |
    (s.emp > 0 ? STATUS.EMP_LOCK : 0) |
    (s.stagger > 0 ? STATUS.STAGGER : 0);
}

function sanitizeCmd(c: InputCmd): InputCmd {
  const num = (v: unknown, lo: number, hi: number, d = 0) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  return {
    seq: c.seq,
    dt: num(c.dt, 0, 0.05),
    mx: num(c.mx, -1, 1),
    my: num(c.my, -1, 1),
    aim: num(c.aim, -Math.PI * 4, Math.PI * 4),
    buttons: num(c.buttons, 0, 0xffff) | 0,
    edges: num(c.edges, 0, 0xffff) | 0,
    slot: num(c.slot, 0, 3) | 0,
    hack: num(c.hack, 0, HACK_ORDER.length) | 0,
    target: num(c.target, 0, 1e9) | 0,
  };
}

