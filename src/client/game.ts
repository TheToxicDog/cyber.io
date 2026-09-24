import type { Application } from 'pixi.js';
import { GHOST_DECK, INPUT_RATE, INTERP_DELAY_MS } from '../shared/constants.js';
import { HACK_ORDER, HACKS } from '../shared/hacks.js';
import type { ArenaMap } from '../shared/map.js';
import { lerp, lerpAngle } from '../shared/math.js';
import { cloneMoveState, stepMovement } from '../shared/movement.js';
import {
  BTN, EDGE, type GameEvent, type InputCmd, type MoveState, type NpcSnap, type PlayerSnap,
  type SnapshotMsg, STATUS,
} from '../shared/protocol.js';
import { type GunDef, PLAYER_LOADOUT, WEAPONS } from '../shared/weapons.js';
import type { Audio } from './audio.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import type { Net } from './net.js';
import { type ActorView, type FrameView, type ProjView, Renderer } from './render.js';

const CMD_DT = 1 / INPUT_RATE;
const NPC_NAMES = { thug: 'STREET THUG', enforcer: 'ENFORCER', operative: 'REFLEX OPERATIVE' } as const;

/**
 * Client game loop: fixed-rate input commands with client-side prediction +
 * server reconciliation for the local player, snapshot interpolation for
 * everything else, and event-driven effects/audio.
 */
export class Game {
  private readonly input: Input;
  private readonly renderer: Renderer;
  private readonly hud: Hud;
  private seq = 0;
  private pending: InputCmd[] = [];
  private pred: MoveState | null = null;
  private prevPred: MoveState | null = null;
  private errX = 0;
  private errY = 0;
  private acc = 0;
  private sendAcc = 0;
  private edges = 0;
  private aim = 0;
  private slot = 0;
  private hackPress = 0;
  private self: PlayerSnap | null = null;
  private latest: SnapshotMsg | null = null;
  private readonly broken = new Set<number>();
  private events: { t: number; ev: GameEvent }[] = [];
  private predictedShots = 0;
  private predictedShotsT = 0;
  private localFireCd = 0;
  private hackTarget: { id: number; x: number; y: number; name: string } | null = null;
  private intensity = 0;

  constructor(
    app: Application,
    private readonly map: ArenaMap,
    private readonly net: Net,
    private readonly audio: Audio,
  ) {
    this.input = new Input(app.canvas);
    this.renderer = new Renderer(app, map);
    this.hud = new Hud(map);
    net.onSnapshot = (s) => this.onSnapshot(s);
    net.onClose = (reason) => this.hud.notice(`${reason} — reload to reconnect`);
  }

  private get selfId(): number {
    return this.net.selfId;
  }

  // ───────────────────────────── networking ─────────────────────────────

  private onSnapshot(s: SnapshotMsg): void {
    this.latest = s;
    this.broken.clear();
    for (const id of s.broken) this.broken.add(id);
    const me = s.players.find((p) => p.id === this.selfId) ?? null;
    if (me) {
      if (this.self && me.slot !== this.slot && this.pending.every((c) => c.slot === me.slot)) this.slot = me.slot;
      this.self = me;
      this.reconcile(me);
    }
    for (const ev of s.events) this.events.push({ t: s.t, ev });
  }

  /** Rewind to the authoritative state and replay unacknowledged inputs. */
  private reconcile(me: PlayerSnap): void {
    this.pending = this.pending.filter((c) => c.seq > me.ack);
    const m = cloneMoveState(me.move);
    const ctx = this.moveCtx(me);
    for (const c of this.pending) stepMovement(m, c, c.dt * me.scale, ctx);
    if (this.pred) {
      const ex = this.pred.x - m.x;
      const ey = this.pred.y - m.y;
      if (Math.hypot(ex, ey) < 140) {
        this.errX += ex;
        this.errY += ey;
      } else {
        this.errX = this.errY = 0;
      }
    }
    this.pred = m;
    if (!this.prevPred) this.prevPred = cloneMoveState(m);
  }

  private moveCtx(me: PlayerSnap) {
    return {
      map: this.map,
      broken: this.broken,
      moveMul: me.moveMul,
      melee: WEAPONS[PLAYER_LOADOUT[this.slot]!].kind === 'melee',
      canMove: me.life === 'alive' && (me.status & STATUS.STAGGER) === 0,
    };
  }

  // ───────────────────────────── frame ─────────────────────────────

  frame(dtRaw: number): void {
    const dt = Math.min(dtRaw, 0.1);
    const me = this.self;
    if (!me || !this.pred || !this.latest) return;

    this.handleKeys(me);

    // Aim from the rendered local position toward the cursor.
    const px = lerp(this.prevPred!.x, this.pred.x, this.acc / CMD_DT) + this.errX;
    const py = lerp(this.prevPred!.y, this.pred.y, this.acc / CMD_DT) + this.errY;
    const mouseWorld = this.renderer.screenToWorld(this.input.mouseX, this.input.mouseY);
    this.aim = Math.atan2(mouseWorld.y - py, mouseWorld.x - px);

    // Quickhack targeting (hold Q, Ghost Deck).
    const hacking = me.os === 'ghost' && (this.input.held() & BTN.HACK) !== 0 && me.life === 'alive';
    this.hackTarget = hacking ? this.findHackTarget(mouseWorld.x, mouseWorld.y, px, py) : null;

    // Fixed-rate input commands + prediction.
    this.edges |= this.input.takeEdges();
    this.acc += dt;
    while (this.acc >= CMD_DT) {
      this.acc -= CMD_DT;
      this.makeCommand(me);
    }
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / 60) {
      this.sendAcc = 0;
      this.net.flush();
    }
    const decay = Math.exp(-14 * dt);
    this.errX *= decay;
    this.errY *= decay;

    // Effects for events whose time has come (remote events play at interpolated time).
    const renderT = this.net.serverNow() - INTERP_DELAY_MS;
    this.events = this.events.filter(({ t, ev }) => {
      if (t <= renderT || this.isSelfEvent(ev)) {
        this.handleEvent(ev);
        return false;
      }
      return true;
    });
    if (this.predictedShots > 0) {
      this.predictedShotsT += dt;
      if (this.predictedShotsT > 0.6) this.predictedShots = 0;
    }

    const view = this.buildView(me, renderT, px, py);
    this.renderer.setBroken(this.broken);
    this.renderer.render(view, dt);
    this.hud.update(me, this.latest, view.localPhase,
      this.hackTarget ? { ...this.worldToScreen(this.hackTarget.x, this.hackTarget.y), targetName: this.hackTarget.name } : null);

    // Audio: listener, adaptive music tempo, phase drone.
    this.audio.listenerX = px;
    this.audio.listenerY = py;
    this.audio.tempoTarget = this.latest.worldScale < 1 ? 0.5 : 1;
    const engaged = this.latest.npcs.some((n) => n.ai === 'combat' && !n.dead);
    this.intensity = Math.max(0, this.intensity - dt * 0.15);
    this.audio.intensity = Math.max(this.intensity, engaged ? 0.5 : 0);
    if (this.latest.worldScale >= 1) this.audio.stopDrone();
    this.audio.update(dt);
  }

  private handleKeys(me: PlayerSnap): void {
    const hackHeld = me.os === 'ghost' && this.input.keys.has('KeyQ');
    for (const code of this.input.takePressed()) {
      if (code.startsWith('Digit')) {
        const n = Number(code.slice(5));
        if (hackHeld) {
          if (n >= 1 && n <= HACK_ORDER.length) this.hackPress = n;
        } else if (n >= 1 && n <= 4) {
          this.slot = n - 1;
        }
        continue;
      }
      switch (code) {
        case 'KeyB': this.net.send({ type: 'lab', cmd: 'toggleBots' }); break;
        case 'KeyN': this.net.send({ type: 'lab', cmd: 'spawnWave' }); break;
        case 'KeyK': this.net.send({ type: 'lab', cmd: 'bulletCurtain' }); break;
        case 'KeyO': this.net.send({ type: 'lab', cmd: 'toggleOs' }); break;
        case 'KeyP': this.net.send({ type: 'lab', cmd: 'togglePvp' }); break;
        case 'KeyH': this.hud.toggleHelp(); break;
        case 'KeyV':
          this.renderer.showDamageNumbers = !this.renderer.showDamageNumbers;
          this.hud.notice(`Damage numbers ${this.renderer.showDamageNumbers ? 'ON' : 'OFF'}`);
          break;
      }
    }
  }

  private makeCommand(me: PlayerSnap): void {
    const axis = this.input.moveAxis();
    const held = this.input.held();
    const cmd: InputCmd = {
      seq: ++this.seq,
      dt: CMD_DT,
      mx: axis.x,
      my: axis.y,
      aim: this.aim,
      buttons: held,
      edges: this.edges,
      slot: this.slot,
      hack: this.hackPress,
      target: this.hackPress ? (this.hackTarget?.id ?? 0) : 0,
    };
    this.edges = 0;
    this.hackPress = 0;

    // Predict locally with the same deterministic movement code as the server.
    this.prevPred = cloneMoveState(this.pred!);
    const res = stepMovement(this.pred!, cmd, cmd.dt * me.scale, this.moveCtx(me));
    if (res.dashed) this.audio.dash(1);
    this.pending.push(cmd);
    this.net.queueInput(cmd);
    this.predictFire(me, cmd);
  }

  /** Immediate muzzle flash + report for semi/auto guns; confirmed/deduped by server shot events. */
  private predictFire(me: PlayerSnap, cmd: InputCmd): void {
    this.localFireCd -= cmd.dt * me.scale;
    const w = PLAYER_LOADOUT[this.slot]!;
    const def = WEAPONS[w];
    if (def.kind !== 'gun' || def.chargeTime || me.slot !== this.slot) return;
    if (me.life !== 'alive' || me.reloadP >= 0 || me.ammo[this.slot]! <= 0 || (me.status & (STATUS.WEAPON_FAULT | STATUS.STAGGER))) return;
    const want = def.auto ? (cmd.buttons & BTN.FIRE) !== 0 : (cmd.edges & EDGE.FIRE) !== 0;
    if (!want || this.localFireCd > 0) return;
    this.localFireCd = def.fireInterval;
    this.predictedShots++;
    this.predictedShotsT = 0;
    const p = this.pred!;
    const mx = p.x + Math.cos(this.aim) * 24;
    const my = p.y + Math.sin(this.aim) * 24;
    this.renderer.muzzle(mx, my, this.aim, (def as GunDef).color, w === 'breaker');
    this.audio.shot(w, me.scale, mx, my, true);
    this.renderer.shake(w === 'breaker' ? 0.28 : 0.12);
    this.intensity = Math.min(1, this.intensity + 0.1);
  }

  private findHackTarget(wx: number, wy: number, px: number, py: number) {
    if (!this.latest) return null;
    let best: { id: number; x: number; y: number; name: string } | null = null;
    let bd = 110;
    for (const n of this.latest.npcs) {
      if (n.dead) continue;
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d < bd && Math.hypot(n.x - px, n.y - py) <= GHOST_DECK.range) {
        bd = d;
        best = { id: n.id, x: n.x, y: n.y, name: NPC_NAMES[n.type] };
      }
    }
    if (this.self?.pvp) {
      for (const p of this.latest.players) {
        if (p.id === this.selfId || !p.pvp || p.life !== 'alive') continue;
        const d = Math.hypot(p.move.x - wx, p.move.y - wy);
        if (d < bd && Math.hypot(p.move.x - px, p.move.y - py) <= GHOST_DECK.range) {
          bd = d;
          best = { id: p.id, x: p.move.x, y: p.move.y, name: p.name.toUpperCase() };
        }
      }
    }
    return best;
  }

  private worldToScreen(x: number, y: number) {
    const w = this.renderer.world;
    return { x: x * w.scale.x + w.position.x, y: y * w.scale.y + w.position.y };
  }

  // ───────────────────────────── view building ─────────────────────────────

  private buildView(me: PlayerSnap, renderT: number, px: number, py: number): FrameView {
    const br = this.net.bracket(renderT);
    const a = br?.a ?? this.latest!;
    const b = br?.b ?? this.latest!;
    const f = br?.f ?? 1;
    const latest = this.latest!;

    const actors: ActorView[] = [];
    const uploadTargets = new Set(me.uploads.map((u) => u.target));
    const aNpcs = new Map(a.npcs.map((n) => [n.id, n]));
    for (const nb of b.npcs) {
      const na = aNpcs.get(nb.id) ?? nb;
      actors.push(npcView(na, nb, f, uploadTargets.has(nb.id) || this.hackTarget?.id === nb.id));
    }
    const aPlayers = new Map(a.players.map((p) => [p.id, p]));
    for (const pb of b.players) {
      if (pb.id === this.selfId) continue;
      const pa = aPlayers.get(pb.id) ?? pb;
      actors.push(playerView(pa, pb, f, false, uploadTargets.has(pb.id) || this.hackTarget?.id === pb.id));
    }
    // Local player: predicted position, instant aim, latest server state for everything else.
    const selfView = playerView(me, me, 1, true, false);
    selfView.x = px;
    selfView.y = py;
    selfView.aim = this.aim;
    selfView.weapon = PLAYER_LOADOUT[this.slot]!;
    selfView.crouch = this.pred!.crouching;
    actors.push(selfView);

    // Projectiles: interpolated; our own are extrapolated to the present.
    const projectiles: ProjView[] = [];
    const aProj = new Map(a.proj.map((p) => [p.id, p]));
    const nowT = this.net.serverNow();
    const ownIds = new Set<number>();
    for (const p of latest.proj) {
      if (p.o !== this.selfId) continue;
      ownIds.add(p.id);
      const ahead = Math.min(0.12, Math.max(0, (nowT - latest.t) / 1000)) * latest.worldScale;
      projectiles.push({ id: p.id, x: p.x + p.vx * ahead, y: p.y + p.vy * ahead, vx: p.vx, vy: p.vy, w: p.w, enemy: false, deflected: p.d });
    }
    for (const pb of b.proj) {
      if (ownIds.has(pb.id) || pb.o === this.selfId) continue;
      const pa = aProj.get(pb.id);
      const x = pa ? lerp(pa.x, pb.x, f) : pb.x;
      const y = pa ? lerp(pa.y, pb.y, f) : pb.y;
      const shooter = latest.players.some((p) => p.id === pb.o);
      projectiles.push({ id: pb.id, x, y, vx: pb.vx, vy: pb.vy, w: pb.w, enemy: !shooter && !pb.d, deflected: pb.d });
    }
    const aNades = new Map(a.nades.map((n) => [n.id, n]));
    const nades = b.nades.map((nb) => {
      const na = aNades.get(nb.id) ?? nb;
      return { id: nb.id, x: lerp(na.x, nb.x, f), y: lerp(na.y, nb.y, f), kind: nb.kind, fuse: nb.fuse };
    });

    const hackLines = me.uploads.map((u) => {
      const t = actors.find((x) => x.id === u.target);
      return { x0: px, y0: py, x1: t?.x ?? px, y1: t?.y ?? py, p: u.p };
    });

    const def = WEAPONS[PLAYER_LOADOUT[this.slot]!];
    const aiming = (this.input.held() & BTN.ALT) !== 0;
    const spread = def.kind === 'gun' ? (aiming ? def.spreadAim : def.spreadHip) : 0;
    return {
      actors,
      projectiles,
      nades,
      focusX: px,
      focusY: py,
      mouseX: this.input.mouseX,
      mouseY: this.input.mouseY,
      worldScale: latest.worldScale,
      localPhase: me.phase,
      dragged: !me.phase && latest.worldScale < 1,
      hacking: this.hackTarget !== null || (me.os === 'ghost' && (this.input.held() & BTN.HACK) !== 0),
      hackLines,
      reticle: {
        spread,
        charge: me.slot === this.slot ? me.chargeP : 0,
        reload: me.slot === this.slot ? me.reloadP : -1,
        melee: def.kind === 'melee',
      },
    };
  }

  // ───────────────────────────── events ─────────────────────────────

  private isSelfEvent(ev: GameEvent): boolean {
    const me = this.selfId;
    switch (ev.e) {
      case 'shot':
      case 'dash':
      case 'swing':
      case 'reload':
      case 'dryFire':
      case 'phaseStart':
      case 'phaseEnd':
      case 'phaseDenied':
      case 'downed':
      case 'parry':
        return ev.id === me;
      case 'hit':
        return ev.target === me || ev.src === me;
      case 'hackStart':
      case 'hackLand':
        return ev.src === me || ev.target === me;
      case 'notice':
      case 'kill':
      case 'wallBroken':
        return true;
      default:
        return false;
    }
  }

  private actorPos(id: number): { x: number; y: number; color: number; scale: number; name: string } | null {
    const s = this.latest;
    if (!s) return null;
    if (id === this.selfId && this.pred) {
      return { x: this.pred.x, y: this.pred.y, color: this.self?.color ?? 0x3dfcff, scale: this.self?.scale ?? 1, name: 'YOU' };
    }
    const p = s.players.find((q) => q.id === id);
    if (p) return { x: p.move.x, y: p.move.y, color: p.color, scale: p.scale, name: p.name };
    const n = s.npcs.find((q) => q.id === id);
    if (n) return { x: n.x, y: n.y, color: n.type === 'operative' ? 0xff4d5e : 0xff7a3d, scale: n.scale, name: NPC_NAMES[n.type] };
    return null;
  }

  private handleEvent(ev: GameEvent): void {
    const me = this.selfId;
    const r = this.renderer;
    const au = this.audio;
    switch (ev.e) {
      case 'shot': {
        const self = ev.id === me;
        if (self && this.predictedShots > 0 && ev.w !== 'lance') {
          this.predictedShots--;
          break;
        }
        const def = WEAPONS[ev.w];
        const color = def.kind === 'gun' ? (def as GunDef).color : 0xffffff;
        r.muzzle(ev.x, ev.y, ev.a, color, ev.w === 'breaker' || ev.w === 'lance' || ev.w === 'enforcerShotgun');
        au.shot(ev.w, ev.s, ev.x, ev.y, self);
        if (self) r.shake(ev.w === 'lance' ? 0.45 : 0.15);
        this.intensity = Math.min(1, this.intensity + 0.05);
        break;
      }
      case 'hit': {
        const src = this.actorPos(ev.src);
        const dx = src ? ev.x - src.x : 1;
        const dy = src ? ev.y - src.y : 0;
        const l = Math.hypot(dx, dy) || 1;
        r.blood(ev.x, ev.y, dx / l, dy / l, ev.armor, ev.kill || ev.head);
        r.flashActor(ev.target);
        if (ev.target === me) {
          r.flash(0xff2040, Math.min(0.35, ev.dmg / 80));
          r.shake(Math.min(0.5, ev.dmg / 60));
          au.hit(false, false, false, 1, true);
        } else if (ev.src === me) {
          r.markHit(ev.kill ? 'kill' : ev.head ? 'head' : 'hit');
          r.damageNumber(ev.x, ev.y, ev.dmg, ev.head, ev.kill);
          au.hit(ev.head, ev.kill, ev.armor, ev.s, false);
          if (ev.kill) r.shake(0.2);
        }
        break;
      }
      case 'impact':
        r.impact(ev.x, ev.y, ev.nx, ev.ny, ev.mat);
        au.impact(ev.mat, ev.s, ev.x, ev.y);
        break;
      case 'pierce':
        r.impact(ev.x, ev.y, 0, 0, ev.mat);
        break;
      case 'wallBroken': {
        const w = this.map.walls.find((x) => x.id === ev.id);
        if (w) {
          r.wallBroken(w);
          au.impact(w.mat === 'glass' ? 'glass' : 'wood', 1, w.x, w.y);
        }
        break;
      }
      case 'phaseStart': {
        const p = this.actorPos(ev.id);
        if (!p) break;
        const self = ev.id === me;
        r.phaseBurst(p.x, p.y, self ? 0x3dfcff : p.color, self);
        au.phaseOn(self);
        if (!self && !this.self?.phase) this.hud.notice(`${p.name} ENTERED THE FAST LAYER`);
        if (!self && this.self?.phase) this.hud.notice(`${p.name} JOINED YOUR TIME LAYER — PHASE DUEL`);
        break;
      }
      case 'phaseEnd': {
        const p = this.actorPos(ev.id);
        if (!p) break;
        r.phaseEnd(p.x, p.y, p.color, ev.id === me);
        au.phaseOff(ev.id === me);
        if (ev.forced && ev.id === me) this.hud.notice('PHASE DRIVE KNOCKED OFFLINE');
        break;
      }
      case 'phaseDenied':
        au.phaseDenied();
        this.hud.notice(
          ev.reason === 'cooldown' ? 'PHASE DRIVE COOLING DOWN'
            : ev.reason === 'charge' ? 'REFLEX CHARGE TOO LOW'
              : ev.reason === 'locked' ? 'PHASE DRIVE LOCKED (EMP)' : 'PHASE DRIVE BUSY',
        );
        break;
      case 'dash': {
        const p = this.actorPos(ev.id);
        r.dash(ev.x, ev.y, ev.dx, ev.dy, p?.color ?? 0xffffff);
        if (ev.id !== me) au.dash(ev.s, ev.x, ev.y);
        break;
      }
      case 'swing': {
        const p = this.actorPos(ev.id);
        r.swing(ev.id, ev.heavy, ev.s);
        r.slashArc(ev.id === me ? this.pred!.x : ev.x, ev.id === me ? this.pred!.y : ev.y, ev.id === me ? this.aim : ev.a, ev.heavy, p?.color ?? 0xff3fa4);
        au.swing(ev.heavy, ev.s, ev.x, ev.y);
        break;
      }
      case 'parry':
        r.parry(ev.x, ev.y);
        au.parry(ev.s);
        if (ev.id === me) r.shake(0.2);
        break;
      case 'explosion': {
        r.explosion(ev.x, ev.y, ev.r, ev.kind);
        au.explosion(ev.kind, ev.s, ev.x, ev.y);
        const d = this.pred ? Math.hypot(ev.x - this.pred.x, ev.y - this.pred.y) : 999;
        r.shake(Math.max(0, 0.7 - d / 900));
        this.intensity = 1;
        break;
      }
      case 'hackStart':
        if (ev.src === me) au.hack(false);
        if (ev.target === me) this.hud.notice(`INTRUSION DETECTED — ${HACKS[ev.hack].name}`);
        break;
      case 'hackLand': {
        const t = this.actorPos(ev.target);
        if (t) r.hackPulse(t.x, t.y);
        au.hack(true);
        break;
      }
      case 'reload':
        if (ev.id === me) au.reload(ev.s);
        break;
      case 'dryFire':
        if (ev.id === me) au.dryFire();
        break;
      case 'kill': {
        const k = this.actorPos(ev.killer);
        const v = this.actorPos(ev.victim);
        const wname = ev.weapon in WEAPONS ? WEAPONS[ev.weapon as keyof typeof WEAPONS].name : ev.weapon.toUpperCase();
        this.hud.feed(`${esc(k?.name ?? 'ENVIRONMENT')} <span style="color:#6f8193">▸ ${esc(wname)} ▸</span> ${esc(v?.name ?? '???')}`);
        break;
      }
      case 'downed':
        if (ev.id === me) r.flash(0xff0030, 0.5);
        break;
      case 'revived': {
        const who = this.actorPos(ev.id);
        const by = this.actorPos(ev.by);
        this.hud.notice(`${who?.name ?? '?'} revived by ${by?.name ?? '?'}`);
        break;
      }
      case 'spawn':
        break;
      case 'notice':
        this.hud.notice(ev.text);
        break;
    }
  }
}

function npcView(a: NpcSnap, b: NpcSnap, f: number, hackTarget: boolean): ActorView {
  return {
    id: b.id,
    kind: 'npc',
    npcType: b.type,
    x: lerp(a.x, b.x, f),
    y: lerp(a.y, b.y, f),
    aim: lerpAngle(a.aim, b.aim, f),
    color: 0xff4d5e,
    self: false,
    phase: b.phase,
    scale: b.scale,
    weapon: b.type === 'thug' ? 'thugPistol' : b.type === 'enforcer' ? 'enforcerShotgun' : 'operativeSmg',
    blocking: false,
    melee: 'none',
    crouch: false,
    life: b.dead ? 'dead' : 'alive',
    hp: b.hp,
    maxHp: b.maxHp,
    armor: b.armor,
    ai: b.ai,
    awareness: b.awareness,
    status: b.status,
    hackTarget,
  };
}

function playerView(a: PlayerSnap, b: PlayerSnap, f: number, self: boolean, hackTarget: boolean): ActorView {
  return {
    id: b.id,
    kind: 'player',
    name: b.name,
    x: lerp(a.move.x, b.move.x, f),
    y: lerp(a.move.y, b.move.y, f),
    aim: lerpAngle(a.aim, b.aim, f),
    color: b.color,
    self,
    phase: b.phase,
    scale: b.scale,
    weapon: PLAYER_LOADOUT[b.slot]!,
    blocking: b.blocking,
    melee: b.melee,
    crouch: b.move.crouching,
    life: b.life,
    hp: b.hp,
    maxHp: 150,
    armor: b.armor,
    status: b.status,
    reviveP: b.reviveP,
    pvp: b.pvp,
    hackTarget,
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
