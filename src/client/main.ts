import { Application } from 'pixi.js';
import { ARENA } from '../shared/map.js';
import type { OsKind } from '../shared/protocol.js';
import { Audio } from './audio.js';
import { Game } from './game.js';
import { Net } from './net.js';

const join = document.getElementById('join')!;
const nameInput = document.getElementById('name') as HTMLInputElement;
const joinBtn = document.getElementById('join-btn') as HTMLButtonElement;
const status = document.getElementById('join-status')!;
let os: OsKind = 'phase';

try {
  nameInput.value = localStorage.getItem('nv-name') ?? '';
  const savedOs = localStorage.getItem('nv-os');
  if (savedOs === 'phase' || savedOs === 'ghost') os = savedOs;
} catch {
  // storage unavailable — defaults are fine
}

const choices = document.querySelectorAll<HTMLButtonElement>('.os-choice');
const syncChoices = () => choices.forEach((c) => c.classList.toggle('selected', c.dataset.os === os));
syncChoices();
choices.forEach((c) => c.addEventListener('click', () => {
  os = c.dataset.os as OsKind;
  syncChoices();
}));

async function start() {
  joinBtn.disabled = true;
  status.textContent = 'Handshaking with the Civic Mesh…';
  const audio = new Audio();
  audio.init();
  const name = nameInput.value.trim() || `merc${Math.floor(Math.random() * 900 + 100)}`;
  try {
    localStorage.setItem('nv-name', name);
    localStorage.setItem('nv-os', os);
  } catch {
    // ignore
  }

  const net = new Net();
  try {
    await net.connect(name, os);
  } catch (err) {
    status.textContent = (err as Error).message;
    joinBtn.disabled = false;
    return;
  }

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x05060a,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
  });
  document.getElementById('game')!.appendChild(app.canvas);
  join.classList.add('hidden');

  const game = new Game(app, ARENA, net, audio);
  app.ticker.add((t) => game.frame(t.deltaMS / 1000));
}

joinBtn.addEventListener('click', start);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') start();
});
