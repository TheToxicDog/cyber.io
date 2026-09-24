import { GHOST_DECK, INJECTOR, PLAYER_MAX_ARMOR, REFLEX } from '../shared/constants.js';
import { HACK_ORDER, HACKS } from '../shared/hacks.js';
import type { ArenaMap } from '../shared/map.js';
import { type PlayerSnap, STATUS, type SnapshotMsg } from '../shared/protocol.js';
import { PLAYER_LOADOUT, WEAPONS } from '../shared/weapons.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private readonly root = $('hud');
  private readonly minimap = $<HTMLCanvasElement>('minimap');
  private readonly mm = this.minimap.getContext('2d')!;
  private lastSlotsKey = '';
  private helpVisible = true;

  constructor(private readonly map: ArenaMap) {
    this.root.classList.remove('hidden');
  }

  toggleHelp(): void {
    this.helpVisible = !this.helpVisible;
    $('help').classList.toggle('hidden', !this.helpVisible);
  }

  feed(html: string): void {
    const el = document.createElement('div');
    el.className = 'item';
    el.innerHTML = html;
    const feed = $('feed');
    feed.prepend(el);
    while (feed.children.length > 6) feed.lastChild!.remove();
    setTimeout(() => el.remove(), 6000);
  }

  notice(text: string): void {
    const el = document.createElement('div');
    el.className = 'item';
    el.textContent = text;
    const box = $('notices');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild!.remove();
    setTimeout(() => el.remove(), 3200);
  }

  update(self: PlayerSnap, snap: SnapshotMsg, localPhase: boolean, hacking: { x: number; y: number; targetName: string } | null): void {
    // Time layer readout (GDD §99).
    const tl = $('timelayer');
    const ws = snap.worldScale;
    $('tl-world').innerHTML = `WORLD <b>${ws.toFixed(2)}×</b>`;
    $('tl-self').innerHTML = `YOU <b>${self.scale.toFixed(2)}×</b>`;
    tl.classList.toggle('slowed', ws < 1);
    tl.classList.toggle('dragged', self.scale < 1);
    const banner = $('tl-banner');
    const others = snap.players.filter((p) => p.phase && p.id !== self.id).length +
      snap.npcs.filter((n) => n.phase && !n.dead).length;
    if (localPhase) {
      banner.textContent = others ? `PHASE DUEL · ${others + 1} IN FAST LAYER` : 'FAST TIME LAYER';
      banner.className = 'fast';
    } else if (ws < 1) {
      banner.textContent = 'TEMPORAL DRAG';
      banner.className = 'drag';
    } else {
      banner.textContent = '';
      banner.className = '';
    }

    // Vitals.
    setBar('hp-fill', self.hp / 150);
    $('hp-num').textContent = String(Math.ceil(self.hp));
    setBar('armor-fill', self.armor / PLAYER_MAX_ARMOR);
    $('armor-num').textContent = String(Math.ceil(self.armor));
    const osFill = $('os-fill');
    if (self.os === 'phase') {
      $('os-tag').textContent = 'RFX';
      const cd = self.phaseCd > 0 && !self.phase;
      osFill.className = `fill ${cd ? 'cooldown' : 'reflex'}`;
      setBar('os-fill', self.reflex / REFLEX.max);
      $('os-num').textContent = cd ? `${self.phaseCd.toFixed(1)}s` : String(Math.floor(self.reflex));
      $('os-name').textContent = self.phase
        ? `PHASE DRIVE MK II · ACTIVE ${self.phaseLeft.toFixed(1)}s`
        : self.phasePending ? 'PHASE DRIVE MK II · SPINNING UP' : 'PHASE DRIVE MK II · [F]';
    } else {
      $('os-tag').textContent = 'BW';
      osFill.className = 'fill bandwidth';
      setBar('os-fill', self.bandwidth / GHOST_DECK.bandwidthMax);
      $('os-num').textContent = String(Math.floor(self.bandwidth));
      const up = self.uploads[0];
      $('os-name').textContent = up
        ? `UPLOADING ${HACKS[up.hack].name} ${(up.p * 100).toFixed(0)}%${self.uploads.length > 1 ? ` (+${self.uploads.length - 1} queued)` : ''}`
        : 'GHOST DECK v3 · hold [Q]';
    }
    const st: string[] = [];
    if (self.status & STATUS.OPTIC_JAM) st.push('<span style="color:#3dfcff">OPTIC JAM</span>');
    if (self.status & STATUS.MOTOR_LOCK) st.push('<span style="color:#8a5cff">MOTOR LOCK</span>');
    if (self.status & STATUS.WEAPON_FAULT) st.push('<span style="color:#ffc23d">WEAPON FAULT</span>');
    if (self.status & STATUS.OVERHEAT) st.push('<span style="color:#ff7a3d">OVERHEAT</span>');
    if (self.status & STATUS.EMP_LOCK) st.push('<span style="color:#9fd0ff">EMP</span>');
    if (self.pvp) st.push('<span style="color:#ff4d5e">PVP</span>');
    $('status-row').innerHTML = st.join('');

    // Loadout.
    const slotsKey = `${self.slot}`;
    if (slotsKey !== this.lastSlotsKey) {
      this.lastSlotsKey = slotsKey;
      $('weapon-slots').innerHTML = PLAYER_LOADOUT.map((w, i) =>
        `<div class="slot ${i === self.slot ? 'active' : ''}">${i + 1} ${WEAPONS[w].name.split(' ')[0]}</div>`).join('');
    }
    const def = WEAPONS[PLAYER_LOADOUT[self.slot]!];
    $('weapon-name').textContent = `${def.name} · ${def.tier.toUpperCase()}`;
    const ammo = $('ammo');
    if (def.kind === 'gun') {
      ammo.classList.toggle('reloading', self.reloadP >= 0);
      $('ammo-num').textContent = self.reloadP >= 0 ? 'RLD' : String(self.ammo[self.slot]);
      $('ammo-max').textContent = `/${def.magSize}`;
    } else {
      ammo.classList.remove('reloading');
      $('ammo-num').textContent = self.blocking ? 'BLOCK' : '∞';
      $('ammo-max').textContent = '';
    }
    $('consumables').textContent = `FRAG ×${self.grenades} [G] · INJECTOR ×${self.injectors}/${INJECTOR.carried} [X] · K/D ${self.kills}/${self.deaths}`;

    // Objective.
    const alive = snap.npcs.filter((n) => !n.dead);
    const combat = alive.filter((n) => n.ai === 'combat').length;
    $('objective-text').textContent = snap.bots
      ? `${alive.length} HOSTILES · ${combat} ENGAGED`
      : 'ENEMIES OFF — PvP / Phase duel practice';
    $('objective-sub').textContent = `${snap.players.length} merc(s) online · tick ${snap.tick}`;

    // Center overlays.
    const oc = $('overlay-center');
    if (self.life === 'downed') {
      oc.classList.remove('hidden');
      oc.innerHTML = `DOWNED<div class="sub">BLEEDOUT ${self.lifeT.toFixed(1)}s · A crewmate can revive you [hold E]</div>`;
    } else if (self.life === 'dead') {
      oc.classList.remove('hidden');
      oc.innerHTML = `FLATLINED<div class="sub">Respawning at the clinic in ${Math.max(0, self.lifeT).toFixed(1)}s</div>`;
    } else {
      oc.classList.add('hidden');
    }

    // Quickhack menu.
    const hm = $('hackmenu');
    if (hacking) {
      hm.classList.remove('hidden');
      hm.style.left = `${hacking.x + 28}px`;
      hm.style.top = `${hacking.y - 20}px`;
      hm.innerHTML = `<div class="title">▸ ${hacking.targetName}</div>` + HACK_ORDER.map((id, i) => {
        const h = HACKS[id];
        const off = self.bandwidth < h.cost || self.uploads.length >= GHOST_DECK.queueSize;
        return `<div class="h ${off ? 'off' : ''}"><span><span class="k">${i + 1}</span> ${h.name}</span><span>${h.cost}</span></div>`;
      }).join('');
    } else {
      hm.classList.add('hidden');
    }

    this.drawMinimap(self, snap);
  }

  private drawMinimap(self: PlayerSnap, snap: SnapshotMsg): void {
    const c = this.mm;
    const W = this.minimap.width;
    const H = this.minimap.height;
    const sx = W / this.map.width;
    const sy = H / this.map.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(80,90,110,0.7)';
    const broken = new Set(snap.broken);
    for (const w of this.map.walls) {
      if (broken.has(w.id)) continue;
      c.fillRect(w.x * sx, w.y * sy, Math.max(1, w.w * sx), Math.max(1, w.h * sy));
    }
    for (const n of snap.npcs) {
      if (n.dead) continue;
      c.fillStyle = n.ai === 'combat' ? '#ff4d5e' : '#b36a4a';
      c.fillRect(n.x * sx - 2, n.y * sy - 2, 4, 4);
    }
    for (const p of snap.players) {
      if (p.life === 'dead') continue;
      c.fillStyle = `#${p.color.toString(16).padStart(6, '0')}`;
      c.beginPath();
      c.arc(p.move.x * sx, p.move.y * sy, p.id === self.id ? 3.5 : 2.5, 0, Math.PI * 2);
      c.fill();
    }
  }
}

function setBar(id: string, f: number): void {
  $(id).style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`;
}
