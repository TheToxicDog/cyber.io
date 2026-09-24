import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize as normalizePath, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { MAX_PLAYERS, TICK_DT, TICK_RATE } from '../shared/constants.js';
import type { ClientMsg, ServerMsg } from '../shared/protocol.js';
import { World } from './world.js';

const PORT = Number(process.env.PORT ?? 3000);
const here = fileURLToPath(new URL('.', import.meta.url));
const STATIC_ROOT = resolve(here, '../../dist/client');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

// Serves the production client build (npm run build). In development Vite serves the client.
const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = normalizePath(join(STATIC_ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(STATIC_ROOT)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
  if (!existsSync(path)) {
    if (!existsSync(join(STATIC_ROOT, 'index.html'))) {
      res.writeHead(200, { 'content-type': 'text/plain' })
        .end('NEON VEIL server running. Build the client with `npm run build`, or use `npm run dev`.');
      return;
    }
    path = join(STATIC_ROOT, 'index.html');
  }
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
});

const world = new World({ bots: true });
const wss = new WebSocketServer({ server: http, path: '/ws' });
const clients = new Map<WebSocket, number>();

const send = (ws: WebSocket, msg: ServerMsg) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString()) as ClientMsg;
    } catch {
      return;
    }
    const id = clients.get(ws);
    switch (msg.type) {
      case 'join': {
        if (id !== undefined) return;
        if (world.players.size >= MAX_PLAYERS) {
          send(ws, { type: 'full', reason: `Server full (${MAX_PLAYERS} players)` });
          ws.close();
          return;
        }
        const p = world.addPlayer(String(msg.name ?? ''), msg.os === 'ghost' ? 'ghost' : 'phase');
        clients.set(ws, p.id);
        send(ws, { type: 'welcome', id: p.id, tickRate: TICK_RATE, serverTime: Date.now() });
        console.log(`[join] ${p.name} (#${p.id}) — ${world.players.size} online`);
        break;
      }
      case 'input':
        if (id !== undefined && Array.isArray(msg.cmds)) world.queueInput(id, msg.cmds.slice(0, 32));
        break;
      case 'lab':
        if (id !== undefined) world.labCommand(id, msg.cmd);
        break;
      case 'ping':
        send(ws, { type: 'pong', t: msg.t, st: Date.now() });
        break;
    }
  });
  ws.on('close', () => {
    const id = clients.get(ws);
    if (id !== undefined) {
      world.removePlayer(id);
      console.log(`[leave] #${id} — ${world.players.size} online`);
    }
    clients.delete(ws);
  });
});

// Fixed-rate authoritative loop. Network traffic stays real-time during Phase Drive;
// only simulation advancement is scaled (GDD §100).
let next = performance.now();
function loop() {
  const now = performance.now();
  let steps = 0;
  while (now >= next && steps < 5) {
    const snap = world.tick();
    if (clients.size) {
      const data = JSON.stringify(snap);
      for (const ws of clients.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
    next += TICK_DT * 1000;
    steps++;
  }
  if (now - next > 250) next = now; // don't spiral after a stall
  setTimeout(loop, Math.max(0, next - performance.now()));
}
loop();

http.listen(PORT, () => {
  console.log(`NEON VEIL combat lab server on http://localhost:${PORT} (ws: /ws, ${TICK_RATE} Hz)`);
});
