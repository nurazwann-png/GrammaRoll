const http = require('http');
const fs   = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const STATIC = ['index.html', 'manifest.json', 'sw.js', 'logo.jpg', 'icon-maskable.svg'];

// ── PostgreSQL via Cloud SQL (Unix socket in Cloud Run, TCP locally) ──────────
const DB_SOCKET = process.env.CLOUD_SQL_SOCKET; // e.g. /cloudsql/project:region:instance
const pool = new Pool(
  DB_SOCKET
    ? { host: DB_SOCKET, database: process.env.DB_NAME || 'grammarball',
        user: process.env.DB_USER || 'grammarball-user',
        password: process.env.DB_PASS, port: 5432 }
    : { connectionString: process.env.DATABASE_URL } // local dev fallback
);

// Run schema on startup (idempotent) — bug17 fix: wrapped in try/catch
try {
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  pool.query(schemaSql)
    .then(() => console.log('[DB] Schema ready'))
    .catch(e => console.error('[DB] Schema error:', e.message));
} catch (e) {
  console.error('[DB] schema.sql missing or unreadable:', e.message);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('error', reject); // bug18 fix: release connection on client abort
    req.on('data', c => { data += c; if (data.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('bad json')); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST' });
    res.end(); return;
  }

  // ── API: post score ──
  if (req.method === 'POST' && url === '/api/scores') {
    try {
      const { playerName, levelKey, score, stars } = await parseBody(req);
      if (!playerName || !levelKey || typeof score !== 'number') return json(res, 400, { error: 'invalid' });
      await pool.query(
        'INSERT INTO level_scores(player_name,level_key,score,stars) VALUES($1,$2,$3,$4)',
        [String(playerName).slice(0,64), String(levelKey).slice(0,16), Math.floor(score), Math.min(3, Math.max(1, stars||1))]
      );
      json(res, 200, { ok: true });
    } catch(e) { console.error(e); json(res, 500, { error: 'db error' }); }
    return;
  }

  // ── API: get leaderboard for a level ──
  if (req.method === 'GET' && url.startsWith('/api/scores/')) {
    const levelKey = url.slice('/api/scores/'.length);
    try {
      const { rows } = await pool.query(
        'SELECT player_name,score,stars,created_at FROM level_scores WHERE level_key=$1 ORDER BY score DESC LIMIT 20',
        [levelKey]
      );
      json(res, 200, rows);
    } catch(e) { json(res, 500, { error: 'db error' }); }
    return;
  }

  // ── API: save player progress ──
  if (req.method === 'POST' && url === '/api/progress') {
    try {
      const { playerName, totalStars, totalScore, achievements, unlockedSkins } = await parseBody(req);
      if (!playerName) return json(res, 400, { error: 'invalid' });
      await pool.query(`
        INSERT INTO player_progress(player_name,total_stars,total_score,achievements,unlocked_skins,updated_at)
        VALUES($1,$2,$3,$4,$5,NOW())
        ON CONFLICT(player_name) DO UPDATE SET
          total_stars=EXCLUDED.total_stars, total_score=EXCLUDED.total_score,
          achievements=EXCLUDED.achievements, unlocked_skins=EXCLUDED.unlocked_skins, updated_at=NOW()
      `, [
        String(playerName).slice(0,64),
        Math.floor(totalStars||0),
        Math.floor(totalScore||0),
        JSON.stringify(achievements||{}),
        Array.isArray(unlockedSkins) ? unlockedSkins.map(String) : []
      ]);
      json(res, 200, { ok: true });
    } catch(e) { console.error(e); json(res, 500, { error: 'db error' }); }
    return;
  }

  // ── API: load player progress ──
  if (req.method === 'GET' && url.startsWith('/api/progress/')) {
    const playerName = decodeURIComponent(url.slice('/api/progress/'.length));
    try {
      const { rows } = await pool.query( // bug20 fix: explicit columns, no SELECT *
        'SELECT player_name,total_stars,total_score,achievements,unlocked_skins,updated_at FROM player_progress WHERE player_name=$1', [playerName]
      );
      json(res, 200, rows[0] || null);
    } catch(e) { json(res, 500, { error: 'db error' }); }
    return;
  }

  // ── Static files ──
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  let urlPath = url === '/' ? '/index.html' : url;
  const filename = urlPath.slice(1);
  if (STATIC.includes(filename)) {
    const ext  = path.extname(filename);
    const mime = MIME[ext] || 'application/octet-stream';
    fs.readFile(path.join(__dirname, filename), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': filename === 'sw.js' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(data);
    });
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 2e6,
});

const rooms = {};

function generateCode() { // bug19 fix: loop instead of unbounded recursion
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempts = 0; attempts < 1000; attempts++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms[code]) return code;
  }
  throw new Error('Could not generate unique room code');
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('createRoom', ({ name, avatar }, cb) => {
    const code = generateCode();
    rooms[code] = { players: [socket.id], data: { [socket.id]: { name, avatar, x: 0, y: 0, score: 0, currentQ: 0 } } };
    socket.join(code); socket.roomCode = code;
    console.log(`[Room] ${code} created by ${name}`);
    cb({ ok: true, code });
  });

  socket.on('joinRoom', ({ code, name, avatar }, cb) => {
    const room = rooms[code];
    if (!room) { cb({ ok: false, error: 'Room code does not exist.' }); return; }
    if (room.players.length >= 2) { cb({ ok: false, error: 'Room is full.' }); return; }
    room.players.push(socket.id);
    room.data[socket.id] = { name, avatar, x: 0, y: 0, score: 0, currentQ: 0 };
    socket.join(code); socket.roomCode = code;
    const opponentId = room.players[0];
    cb({ ok: true, code, opponent: room.data[opponentId] });
    socket.to(code).emit('opponentJoined', { name, avatar });
    console.log(`[Room] ${code} joined by ${name}`);
  });

  socket.on('playerDataUpdate', ({ name, avatar }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    rooms[code].data[socket.id] = { ...rooms[code].data[socket.id], name, avatar };
    socket.to(code).emit('opponentDataUpdate', { name, avatar });
  });

  socket.on('positionUpdate', ({ x, y, vx, vy, rot }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    if (rooms[code].data[socket.id]) { rooms[code].data[socket.id].x = x; rooms[code].data[socket.id].y = y; }
    socket.to(code).emit('opponentPosition', { x, y, vx, vy, rot });
  });

  socket.on('scoreUpdate', ({ score, currentQ, hearts }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    if (rooms[code].data[socket.id]) Object.assign(rooms[code].data[socket.id], { score, currentQ, hearts });
    socket.to(code).emit('opponentScore', { score, currentQ, hearts });
  });

  socket.on('levelReady', ({ levelKey }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    socket.to(code).emit('opponentReady', { levelKey });
  });

  socket.on('playerWon', ({ name, score, stars }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    io.to(code).emit('raceResult', { winner: name, score, stars });
  });

  socket.on('coopCreate', ({ name }, cb) => {
    const code = 'C' + generateCode().slice(1);
    rooms[code] = { players: [socket.id], data: { [socket.id]: { name, score: 0 } }, coop: true, answers: {} };
    socket.join(code); socket.roomCode = code;
    console.log(`[Coop] ${code} created by ${name}`);
    cb({ ok: true, code });
  });

  socket.on('coopJoin', ({ code, name }, cb) => {
    const room = rooms[code];
    if (!room || !room.coop) { cb({ ok: false, error: 'Co-op room not found.' }); return; }
    if (room.players.length >= 2) { cb({ ok: false, error: 'Room is full.' }); return; }
    room.players.push(socket.id);
    room.data[socket.id] = { name, score: 0 };
    socket.join(code); socket.roomCode = code;
    cb({ ok: true, partnerName: room.data[room.players[0]].name });
    socket.to(code).emit('coopPartnerJoined', { name });
    console.log(`[Coop] ${code} joined by ${name}`);
  });

  socket.on('coopAnswer', ({ qIdx, correct }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || !room.coop) return;
    if (typeof qIdx !== 'number' || qIdx < 0 || qIdx > 999) return;
    if (!room.answers[qIdx]) room.answers[qIdx] = {};
    room.answers[qIdx][socket.id] = correct;
    socket.to(code).emit('coopPartnerAnswered', { qIdx, correct });
    const ans = room.answers[qIdx];
    if (Object.keys(ans).length === room.players.length) {
      const allCorrect = Object.values(ans).every(v => v);
      io.to(code).emit('coopResult', { qIdx, allCorrect });
      delete room.answers[qIdx];
    }
  });

  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (code && rooms[code]) {
      const evName = rooms[code].coop ? 'coopPartnerLeft' : 'opponentLeft';
      socket.to(code).emit(evName);
      rooms[code].players = rooms[code].players.filter(id => id !== socket.id);
      delete rooms[code].data[socket.id];
      if (rooms[code].players.length === 0) { delete rooms[code]; console.log(`[Room] ${code} closed`); }
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => console.log(`Grammar Ball listening on port ${PORT}`));
