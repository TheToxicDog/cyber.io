import type { ClientMsg, InputCmd, OsKind, ServerMsg, SnapshotMsg } from '../shared/protocol.js';

/** WebSocket connection, clock sync and snapshot buffering. */
export class Net {
  private ws: WebSocket | null = null;
  selfId = 0;
  /** Estimated serverTime - localTime, in ms. */
  clockOffset = 0;
  rtt = 0;
  private offsetSamples: number[] = [];
  readonly snaps: SnapshotMsg[] = [];
  onSnapshot: (s: SnapshotMsg) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private outbox: InputCmd[] = [];
  private pingTimer = 0;

  connect(name: string, os: OsKind): Promise<void> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => this.send({ type: 'join', name, os });
      ws.onerror = () => reject(new Error('Could not reach the Veyra server. Is `npm run dev` running?'));
      ws.onclose = () => {
        window.clearInterval(this.pingTimer);
        this.onClose('Connection lost');
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as ServerMsg;
        switch (msg.type) {
          case 'welcome':
            this.selfId = msg.id;
            this.clockOffset = msg.serverTime - Date.now();
            this.ping();
            this.pingTimer = window.setInterval(() => this.ping(), 1000);
            resolve();
            break;
          case 'full':
            reject(new Error(msg.reason));
            break;
          case 'pong': {
            const now = Date.now();
            this.rtt = now - msg.t;
            this.offsetSamples.push(msg.st + this.rtt / 2 - now);
            if (this.offsetSamples.length > 9) this.offsetSamples.shift();
            const sorted = [...this.offsetSamples].sort((a, b) => a - b);
            this.clockOffset = sorted[Math.floor(sorted.length / 2)]!;
            break;
          }
          case 'snap':
            this.snaps.push(msg);
            if (this.snaps.length > 60) this.snaps.shift();
            this.onSnapshot(msg);
            break;
        }
      };
    });
  }

  serverNow(): number {
    return Date.now() + this.clockOffset;
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  queueInput(cmd: InputCmd): void {
    this.outbox.push(cmd);
  }

  flush(): void {
    if (!this.outbox.length) return;
    this.send({ type: 'input', cmds: this.outbox });
    this.outbox = [];
  }

  private ping(): void {
    this.send({ type: 'ping', t: Date.now() });
  }

  /** Finds the two snapshots bracketing `t` for interpolation. */
  bracket(t: number): { a: SnapshotMsg; b: SnapshotMsg; f: number } | null {
    const s = this.snaps;
    if (!s.length) return null;
    if (t <= s[0]!.t) return { a: s[0]!, b: s[0]!, f: 0 };
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1]!;
      const b = s[i]!;
      if (t >= a.t && t <= b.t) return { a, b, f: b.t > a.t ? (t - a.t) / (b.t - a.t) : 1 };
    }
    const last = s[s.length - 1]!;
    return { a: last, b: last, f: 1 };
  }
}
