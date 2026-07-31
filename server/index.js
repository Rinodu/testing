/* Blocky World multiplayer relay server.
 *
 * A deliberately small "versi ringan" (lightweight) shared-world relay:
 * it stores every block a player places/breaks (as a delta on top of the
 * client's own deterministic procedural generation) and re-broadcasts it,
 * plus player positions, to everyone else connected. It is NOT an
 * authoritative server -- there's no anti-cheat, no server-side physics,
 * no synced mobs. That's an explicit scope cut; see the repo's README for
 * why (multiplayer done "properly" is a multi-week project on its own).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8787;
const DATA_FILE = path.join(__dirname, 'world-edits.json');
const DAY_LENGTH_SECONDS = 600; // keep this in sync with DAY_LENGTH_SECONDS in game.js

// ---- Persisted shared-world block edits ----
// Keyed "x,y,z" -> block type id (must match the client's BLOCK enum
// numbers in game.js). Every placed/broken block is stored explicitly,
// including air (0) for broken blocks -- otherwise a broken block would
// just regenerate from the deterministic terrain seed on other clients.
//
// Persistence here is best-effort: many free hosting tiers wipe the
// filesystem on every redeploy or restart, so don't treat this file as a
// real database, just a convenience so a normal restart doesn't erase
// everyone's builds.
const edits = new Map();
try {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  for (const [key, block] of JSON.parse(raw)) edits.set(key, block);
  console.log(`Loaded ${edits.size} saved block edit(s) from disk.`);
} catch (e) {
  console.log('No world-edits.json found yet -- starting with a fresh shared world.');
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFile(DATA_FILE, JSON.stringify(Array.from(edits.entries())), (err) => {
      if (err) console.warn('Failed to persist world edits:', err.message);
    });
  }, 2000);
}

// ---- Shared day/night clock ----
let dayTime = 0.25;
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  dayTime = (dayTime + dt / DAY_LENGTH_SECONDS) % 1;
}, 1000);

// ---- HTTP server (also serves as the WebSocket upgrade target; most
// hosts expect a plain HTTP health check on $PORT even for a WS service) ----
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Blocky World multiplayer relay OK -- ${players.size} player(s) online, ${edits.size} block edit(s) stored.\n`);
});

const wss = new WebSocket.Server({ server });
const players = new Map(); // ws -> { id, name, x, y, z, yaw, pitch }
let nextId = 1;

function broadcast(data, exceptWs) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

wss.on('connection', (ws) => {
  const id = nextId++;
  const me = { id, name: 'Player' + id, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  players.set(ws, me);

  ws.send(JSON.stringify({
    type: 'welcome',
    id,
    dayTime,
    edits: Array.from(edits.entries()).map(([key, block]) => {
      const [x, y, z] = key.split(',').map(Number);
      return { x, y, z, block };
    }),
    players: Array.from(players.values()).filter((p) => p.id !== id),
  }));

  broadcast({ type: 'playerJoined', ...me }, ws);
  console.log(`Player ${id} connected (${players.size} online).`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === 'move') {
      me.x = msg.x; me.y = msg.y; me.z = msg.z; me.yaw = msg.yaw; me.pitch = msg.pitch;
      broadcast({ type: 'playerMove', id, x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch }, ws);
    } else if (msg.type === 'block') {
      const x = msg.x | 0, y = msg.y | 0, z = msg.z | 0, block = msg.block | 0;
      edits.set(`${x},${y},${z}`, block);
      scheduleSave();
      broadcast({ type: 'block', x, y, z, block, id }, ws);
    }
  });

  ws.on('close', () => {
    players.delete(ws);
    broadcast({ type: 'playerLeft', id });
    console.log(`Player ${id} disconnected (${players.size} online).`);
  });
});

// Periodic shared clock so everyone's day/night stays roughly aligned
// (not frame-perfect, just close enough that it feels like one world).
setInterval(() => broadcast({ type: 'time', dayTime }), 15000);

server.listen(PORT, () => {
  console.log(`Blocky World multiplayer relay listening on port ${PORT}`);
});
