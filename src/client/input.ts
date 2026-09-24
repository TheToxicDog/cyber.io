import { BTN, EDGE } from '../shared/protocol.js';

/** Raw keyboard + mouse state, turned into held-button bits and edge bits. */
export class Input {
  readonly keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  lmb = false;
  rmb = false;
  private edges = 0;
  private pressed: string[] = [];

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.code;
      if (!this.keys.has(k)) this.onPress(k);
      this.keys.add(k);
      if (k === 'Space' || k === 'Tab' || k.startsWith('Digit') || k === 'KeyQ') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      if (this.lmb) this.edges |= EDGE.FIRE_RELEASE;
      this.lmb = this.rmb = false;
    });
    target.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.lmb = true;
        this.edges |= EDGE.FIRE;
      } else if (e.button === 2) {
        this.rmb = true;
        this.edges |= EDGE.ALT;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.lmb) {
        this.lmb = false;
        this.edges |= EDGE.FIRE_RELEASE;
      } else if (e.button === 2) {
        this.rmb = false;
      }
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onPress(code: string): void {
    this.pressed.push(code);
    switch (code) {
      case 'Space': this.edges |= EDGE.DASH; break;
      case 'KeyR': this.edges |= EDGE.RELOAD; break;
      case 'KeyF': this.edges |= EDGE.PHASE; break;
      case 'KeyG': this.edges |= EDGE.GRENADE; break;
      case 'KeyX': this.edges |= EDGE.INJECT; break;
      case 'KeyC':
      case 'ControlLeft': this.edges |= EDGE.CROUCH; break;
    }
  }

  held(): number {
    let b = 0;
    if (this.lmb) b |= BTN.FIRE;
    if (this.rmb) b |= BTN.ALT;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) b |= BTN.SPRINT;
    if (this.keys.has('KeyC') || this.keys.has('ControlLeft')) b |= BTN.CROUCH;
    if (this.keys.has('KeyQ')) b |= BTN.HACK;
    if (this.keys.has('KeyE')) b |= BTN.INTERACT;
    return b;
  }

  moveAxis(): { x: number; y: number } {
    const k = this.keys;
    return {
      x: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      y: (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0),
    };
  }

  /** Returns and clears accumulated edge bits. */
  takeEdges(): number {
    const e = this.edges;
    this.edges = 0;
    return e;
  }

  /** Returns and clears key presses since the last call (for UI / slot keys). */
  takePressed(): string[] {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }
}
