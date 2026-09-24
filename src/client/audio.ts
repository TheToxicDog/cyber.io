/**
 * Procedural WebAudio sound design. No assets: everything is synthesized.
 *
 * Every sound takes a `rate` = the temporal scale of its source (GDD §94).
 * Sounds from slowed sources are pitched down and stretched; sounds from inside
 * the fast layer play normally.
 */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private phaseDrone: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;
  private nextBeat = 0;
  private beat = 0;
  /** Musical tempo multiplier, eased toward the perceived world speed. */
  private tempo = 1;
  tempoTarget = 1;
  intensity = 0;
  listenerX = 0;
  listenerY = 0;

  init(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 9000;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.musicFilter).connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startRain();
    this.nextBeat = ctx.currentTime + 0.1;
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  private spatial(x: number | undefined, y: number | undefined): { gain: number; pan: number } {
    if (x === undefined || y === undefined) return { gain: 1, pan: 0 };
    const dx = x - this.listenerX;
    const dy = y - this.listenerY;
    const d = Math.hypot(dx, dy);
    return { gain: Math.max(0.08, 1 - d / 1800), pan: Math.max(-0.8, Math.min(0.8, dx / 700)) };
  }

  private out(gain: number, pan: number): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.sfx);
    return g;
  }

  private noiseBurst(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number, rate = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** rate in [0.22, 1]. Stretch is softened so slowed sounds stay readable. */
  private stretch(rate: number): number {
    return Math.max(0.35, Math.min(1, 0.35 + (rate - 0.22) * (0.65 / 0.78)));
  }

  shot(weapon: string, rate: number, x?: number, y?: number, self = false): void {
    if (!this.ctx) return;
    const r = this.stretch(rate);
    const sp = this.spatial(x, y);
    const out = this.out(sp.gain * (self ? 1 : 0.8), sp.pan);
    const t = this.ctx.currentTime;
    switch (weapon) {
      case 'breaker':
      case 'enforcerShotgun':
        this.noiseBurst(out, t, 0.32 / r, 'lowpass', 2600 * r, 0.7, 0.9, r);
        this.tone(out, t, 'sine', 140 * r, 40 * r, 0.25 / r, 0.9);
        this.noiseBurst(out, t + 0.28 / r, 0.05 / r, 'bandpass', 3000 * r, 4, 0.25, r); // pump
        break;
      case 'lance':
        this.tone(out, t, 'sawtooth', 2400 * r, 180 * r, 0.35 / r, 0.35);
        this.tone(out, t, 'sine', 90 * r, 35 * r, 0.4 / r, 1);
        this.noiseBurst(out, t, 0.5 / r, 'highpass', 5000 * r, 0.5, 0.35, r);
        break;
      case 'operativeSmg':
        this.noiseBurst(out, t, 0.08 / r, 'bandpass', 2200 * r, 1.4, 0.6, r);
        this.tone(out, t, 'square', 220 * r, 90 * r, 0.05 / r, 0.2);
        break;
      default:
        this.noiseBurst(out, t, 0.16 / r, 'bandpass', 1800 * r, 1.1, 0.9, r);
        this.tone(out, t, 'sine', 180 * r, 55 * r, 0.12 / r, 0.7);
        this.noiseBurst(out, t + 0.02, 0.04 / r, 'highpass', 6000 * r, 1, 0.2, r); // mechanical action
    }
  }

  impact(mat: string, rate: number, x: number, y: number): void {
    if (!this.ctx) return;
    const r = this.stretch(rate);
    const sp = this.spatial(x, y);
    const out = this.out(sp.gain * 0.5, sp.pan);
    const t = this.ctx.currentTime;
    if (mat === 'glass') {
      for (let i = 0; i < 4; i++) this.tone(out, t + i * 0.02 / r, 'triangle', (3000 + Math.random() * 2500) * r, 2000 * r, 0.12 / r, 0.12);
      this.noiseBurst(out, t, 0.25 / r, 'highpass', 4000 * r, 1, 0.4, r);
    } else if (mat === 'steel' || mat === 'car') {
      this.tone(out, t, 'triangle', 1400 * r, 900 * r, 0.15 / r, 0.18);
      this.noiseBurst(out, t, 0.06 / r, 'bandpass', 3500 * r, 3, 0.3, r);
    } else {
      this.noiseBurst(out, t, 0.07 / r, 'bandpass', 1200 * r, 1.5, 0.35, r);
    }
  }

  hit(head: boolean, kill: boolean, armor: boolean, rate: number, toSelf: boolean): void {
    if (!this.ctx) return;
    const r = this.stretch(rate);
    const out = this.out(toSelf ? 0.9 : 0.6, 0);
    const t = this.ctx.currentTime;
    if (toSelf) {
      this.tone(out, t, 'sine', 120, 50, 0.18, 0.8);
      this.noiseBurst(out, t, 0.12, 'lowpass', 800, 1, 0.6);
      return;
    }
    if (armor) this.tone(out, t, 'triangle', 1900 * r, 1500 * r, 0.06 / r, 0.2);
    this.tone(out, t, 'square', (head ? 2200 : 1400) * r, (head ? 2400 : 1200) * r, 0.04 / r, 0.12);
    if (head) this.tone(out, t + 0.03 / r, 'sine', 3200 * r, 3600 * r, 0.09 / r, 0.18);
    if (kill) {
      this.noiseBurst(out, t, 0.18 / r, 'lowpass', 900 * r, 1, 0.5, r);
      this.tone(out, t, 'sine', 70 * r, 35 * r, 0.3 / r, 0.7);
    }
  }

  phaseOn(self: boolean): void {
    if (!this.ctx) return;
    const out = this.out(self ? 1 : 0.55, 0);
    const t = this.ctx.currentTime;
    // The signature sound: bass impact, downward sweep, glassy shimmer, reversed whoosh.
    this.tone(out, t, 'sine', 160, 28, 0.9, 1.2);
    this.tone(out, t, 'sawtooth', 880, 110, 0.5, 0.18);
    this.tone(out, t + 0.02, 'triangle', 2640, 4400, 0.6, 0.08);
    this.tone(out, t + 0.02, 'triangle', 1980, 3300, 0.6, 0.08);
    this.noiseBurst(out, t, 0.6, 'bandpass', 900, 0.8, 0.5, 0.5);
    this.startDrone();
  }

  phaseOff(self: boolean): void {
    if (!this.ctx) return;
    const out = this.out(self ? 0.9 : 0.5, 0);
    const t = this.ctx.currentTime;
    this.tone(out, t, 'sine', 30, 180, 0.35, 0.8);
    this.tone(out, t, 'sawtooth', 110, 1200, 0.3, 0.12);
    this.noiseBurst(out, t, 0.25, 'highpass', 2500, 0.7, 0.35);
  }

  phaseDenied(): void {
    if (!this.ctx) return;
    const out = this.out(0.5, 0);
    const t = this.ctx.currentTime;
    this.tone(out, t, 'square', 220, 200, 0.08, 0.2);
    this.tone(out, t + 0.1, 'square', 180, 160, 0.1, 0.2);
  }

  private startDrone(): void {
    if (!this.ctx || this.phaseDrone) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 0.2);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 55.7;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    osc.connect(f);
    osc2.connect(f);
    f.connect(gain).connect(this.sfx);
    osc.start();
    osc2.start();
    this.phaseDrone = { osc, osc2, gain };
  }

  stopDrone(): void {
    if (!this.ctx || !this.phaseDrone) return;
    const { osc, osc2, gain } = this.phaseDrone;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    osc.stop(t + 0.2);
    osc2.stop(t + 0.2);
    this.phaseDrone = null;
  }

  dash(rate: number, x?: number, y?: number): void {
    if (!this.ctx) return;
    const r = this.stretch(rate);
    const sp = this.spatial(x, y);
    this.noiseBurst(this.out(sp.gain * 0.5, sp.pan), this.ctx.currentTime, 0.18 / r, 'bandpass', 1400 * r, 0.9, 0.5, r);
  }

  swing(heavy: boolean, rate: number, x?: number, y?: number): void {
    if (!this.ctx) return;
    const r = this.stretch(rate);
    const sp = this.spatial(x, y);
    const out = this.out(sp.gain * 0.6, sp.pan);
    const t = this.ctx.currentTime;
    this.noiseBurst(out, t, (heavy ? 0.3 : 0.16) / r, 'bandpass', (heavy ? 900 : 2200) * r, 2, 0.6, r);
    this.tone(out, t, 'sine', 3800 * r, 5200 * r, 0.12 / r, 0.05);
  }

  parry(rate: number): void {
    if (!this.ctx) return;
    const r = this.stretch(rate);
    const out = this.out(0.8, 0);
    const t = this.ctx.currentTime;
    this.tone(out, t, 'triangle', 1800 * r, 1700 * r, 0.5 / r, 0.4);
    this.tone(out, t, 'triangle', 2710 * r, 2650 * r, 0.4 / r, 0.25);
    this.noiseBurst(out, t, 0.05, 'highpass', 5000, 1, 0.4);
  }

  explosion(kind: 'frag' | 'emp', rate: number, x: number, y: number): void {
    if (!this.ctx) return;
    const r = this.stretch(rate);
    const sp = this.spatial(x, y);
    const out = this.out(sp.gain, sp.pan);
    const t = this.ctx.currentTime;
    if (kind === 'emp') {
      this.tone(out, t, 'sawtooth', 1600 * r, 60 * r, 0.6 / r, 0.35);
      this.tone(out, t, 'square', 60 * r, 1200 * r, 0.3 / r, 0.12);
      this.noiseBurst(out, t, 0.5 / r, 'bandpass', 4000 * r, 5, 0.4, r);
    } else {
      this.noiseBurst(out, t, 0.9 / r, 'lowpass', 900 * r, 0.7, 1.2, r);
      this.tone(out, t, 'sine', 90 * r, 25 * r, 0.8 / r, 1.2);
    }
  }

  hack(land: boolean): void {
    if (!this.ctx) return;
    const out = this.out(0.35, 0);
    const t = this.ctx.currentTime;
    const notes = land ? [880, 1320, 1760] : [660, 990];
    notes.forEach((f, i) => this.tone(out, t + i * 0.045, 'square', f, f, 0.04, 0.12));
  }

  reload(rate: number): void {
    if (!this.ctx) return;
    const r = this.stretch(rate);
    const out = this.out(0.35, 0);
    const t = this.ctx.currentTime;
    this.noiseBurst(out, t, 0.04, 'bandpass', 3000 * r, 5, 0.4, r);
    this.noiseBurst(out, t + 0.12 / r, 0.05, 'bandpass', 2000 * r, 5, 0.4, r);
  }

  dryFire(): void {
    if (!this.ctx) return;
    this.noiseBurst(this.out(0.4, 0), this.ctx.currentTime, 0.03, 'highpass', 4000, 3, 0.4);
  }

  ui(): void {
    if (!this.ctx) return;
    this.tone(this.out(0.25, 0), this.ctx.currentTime, 'sine', 1200, 1500, 0.05, 0.2);
  }

  private startRain(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 5200;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  /**
   * Minimal adaptive soundtrack (GDD §93): ambient bass pulse, percussion enters with
   * combat intensity, and the whole thing stretches (tempo + filter) with time dilation.
   */
  update(dt: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.tempo += (this.tempoTarget - this.tempo) * Math.min(1, dt * (this.tempoTarget > this.tempo ? 14 : 6));
    this.musicFilter.frequency.setTargetAtTime(this.tempo < 0.9 ? 700 : 9000, ctx.currentTime, 0.05);
    const bpm = 96 * this.tempo;
    const sixteenth = 60 / bpm / 4;
    while (this.nextBeat < ctx.currentTime + 0.12) {
      this.scheduleStep(this.nextBeat, this.beat, this.tempo);
      this.nextBeat += sixteenth;
      this.beat = (this.beat + 1) % 32;
    }
  }

  private scheduleStep(t: number, step: number, tempo: number): void {
    const bus = this.musicBus;
    const bassNotes = [41.2, 41.2, 49, 36.7];
    const bar = Math.floor(step / 8) % 4;
    if (step % 4 === 0) this.tone(bus, t, 'sawtooth', bassNotes[bar]! * 2 * tempo, bassNotes[bar]! * 2 * tempo, 0.35 / tempo, 0.18);
    if (step % 8 === 6) this.tone(bus, t, 'triangle', bassNotes[bar]! * 6 * tempo, bassNotes[bar]! * 6 * tempo, 0.2 / tempo, 0.05);
    if (this.intensity > 0.15) {
      if (step % 8 === 0) this.tone(bus, t, 'sine', 120 * tempo, 38 * tempo, 0.25 / tempo, 0.9 * this.intensity);
      if (step % 8 === 4) this.noiseBurst(bus, t, 0.12 / tempo, 'bandpass', 1800 * tempo, 0.8, 0.45 * this.intensity, tempo);
      if (step % 2 === 1) this.noiseBurst(bus, t, 0.03 / tempo, 'highpass', 8000 * tempo, 1, 0.12 * this.intensity, tempo);
    }
    if (this.intensity > 0.6 && step % 4 === 2) {
      this.tone(bus, t, 'square', bassNotes[bar]! * 4 * tempo, bassNotes[bar]! * 4 * tempo, 0.1 / tempo, 0.06);
    }
  }
}
