const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const { createFileStore, createPgStore } = require('./store');

// ── Load .env (KEY=VALUE lines) without extra dependencies ────────────────────
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  });
} catch (e) { /* no .env file */ }

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
};

const STATIC = ['index.html', 'manifest.json', 'sw.js', 'logo.jpg', 'icon-maskable.svg'];
const STATIC_DIRS = ['js', 'css'];

// ── PostgreSQL via Cloud SQL (Unix socket in Cloud Run, TCP locally) ──────────
const DB_SOCKET = process.env.CLOUD_SQL_SOCKET; // e.g. /cloudsql/project:region:instance
const pool = DB_SOCKET
  ? new Pool({ host: DB_SOCKET, database: process.env.DB_NAME || 'grammarball',
      user: process.env.DB_USER || 'grammarball-user', password: process.env.DB_PASS, port: 5432 })
  : process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

const store = pool
  ? createPgStore(pool)
  : createFileStore(process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json'));

if (pool) {
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    pool.query(schemaSql)
      .then(() => console.log('[DB] Schema ready'))
      .catch(e => console.error('[DB] Schema error:', e.message));
  } catch (e) {
    console.error('[DB] schema.sql missing or unreadable:', e.message);
  }
} else {
  console.log('[DB] No DATABASE_URL set — classes and results are saved to data/store.json');
}

// ── Teacher authentication ────────────────────────────────────────────────────
const TEACHER_PIN = process.env.TEACHER_PIN || (IS_PROD ? '' : '1234');
if (!process.env.TEACHER_PIN) {
  console.warn(IS_PROD
    ? '[Auth] TEACHER_PIN is not set — Teacher Mode is disabled.'
    : '[Auth] TEACHER_PIN is not set — using the development PIN 1234. Set TEACHER_PIN in .env.');
}
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const tokens = new Map(); // token -> expiry time
const loginFailures = new Map(); // ip -> { count, resetAt }
const MAX_LOGIN_FAILURES = 5;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

const sha = s => crypto.createHash('sha256').update(String(s)).digest();
function pinMatches(pin) {
  return TEACHER_PIN !== '' && crypto.timingSafeEqual(sha(pin), sha(TEACHER_PIN));
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
}
function isTeacher(req) {
  const m = (req.headers.authorization || '').match(/^Bearer ([a-f0-9]{48})$/);
  if (!m) return false;
  const exp = tokens.get(m[1]);
  if (!exp || exp < Date.now()) { tokens.delete(m[1]); return false; }
  return true;
}

// Simple fixed-window limiter for public write endpoints
const writeHits = new Map();
function rateLimited(req, max = 60) {
  const ip = clientIp(req), now = Date.now();
  const e = writeHits.get(ip);
  if (!e || e.resetAt < now) { writeHits.set(ip, { count: 1, resetAt: now + 60000 }); return false; }
  e.count++;
  return e.count > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tokens) if (v < now) tokens.delete(k);
  for (const [k, v] of loginFailures) if (v.resetAt < now) loginFailures.delete(k);
  for (const [k, v] of writeHits) if (v.resetAt < now) writeHits.delete(k);
}, 60000).unref();

// ── Validation helpers ────────────────────────────────────────────────────────
const CODE_RE  = /^[A-Z0-9]{6}$/;
// Mirrors PER_PUPIL_KEYS in js/data.js (minus the name, which is in the URL)
const PROGRESS_KEYS = ['gr_level_stars', 'gr_total_stars', 'gr_total_score', 'gr_ach_stats', 'gr_achievements',
  'gr_sr_wrong', 'gr_play_days', 'gr_daily', 'gr_active_skin'];
const LEVEL_RE = /^[0-9]{1,2}-[0-9]{1,2}$/;
const str = (v, max) => String(v ?? '').trim().slice(0, max);

function cleanQuestions(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [level, list] of Object.entries(input)) {
    if (!LEVEL_RE.test(level) || !Array.isArray(list)) continue;
    out[level] = list.slice(0, 50).map(q => ({
      q: str(q.q, 120), correct: str(q.correct, 40),
      wrong: Array.isArray(q.wrong) ? q.wrong.slice(0, 2).map(w => str(w, 40)) : [],
      ...(q.tip ? { tip: str(q.tip, 200) } : {}),
      difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
    })).filter(q => q.q.includes('___') && q.correct && q.wrong.length === 2 && q.wrong.every(Boolean));
  }
  return out;
}

function newClassCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6), b => chars[b % chars.length]).join('');
}

function startOfWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d;
}

function buildReport(cls, attempts) {
  const pupils = new Map();
  const missedCounts = new Map();
  for (const a of attempts) {
    const key = a.player_name.toLowerCase();
    if (!pupils.has(key)) pupils.set(key, { name: a.player_name, attempts: 0, accSum: 0, best: {}, last: a.created_at, missed: new Map() });
    const p = pupils.get(key);
    p.attempts++;
    p.accSum += a.accuracy;
    if (a.created_at > p.last) p.last = a.created_at;
    if (a.won) p.best[a.level_key] = Math.max(p.best[a.level_key] || 0, a.stars);
    for (const m of a.missed || []) {
      missedCounts.set(m, (missedCounts.get(m) || 0) + 1);
      p.missed.set(m, (p.missed.get(m) || 0) + 1);
    }
  }
  const assigned = cls.assignment?.levels || [];
  const rows = [...pupils.values()].map(p => ({
    name: p.name,
    attempts: p.attempts,
    accuracy: Math.round(p.accSum / p.attempts),
    levelsCompleted: Object.keys(p.best).length,
    stars: Object.values(p.best).reduce((s, v) => s + v, 0),
    homeworkDone: assigned.filter(k => p.best[k]).length,
    homeworkTotal: assigned.length,
    lastPlayed: p.last,
    topMissed: [...p.missed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([q]) => q),
  })).sort((a, b) => a.accuracy - b.accuracy);
  const mostMissed = [...missedCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([question, count]) => ({ question, count }));
  // Topic mastery: average accuracy per level across the class
  const byLevel = new Map();
  for (const a of attempts) {
    const t = byLevel.get(a.level_key) || { level: a.level_key, attempts: 0, accSum: 0, pupils: new Set(), passed: new Set() };
    t.attempts++;
    t.accSum += a.accuracy;
    t.pupils.add(a.player_name.toLowerCase());
    if (a.won) t.passed.add(a.player_name.toLowerCase());
    byLevel.set(a.level_key, t);
  }
  const topics = [...byLevel.values()]
    .map(t => ({ level: t.level, attempts: t.attempts, accuracy: Math.round(t.accSum / t.attempts), pupils: t.pupils.size, passed: t.passed.size }))
    .sort((a, b) => a.level.localeCompare(b.level, undefined, { numeric: true }));
  return { class: { code: cls.code, name: cls.name, assignment: cls.assignment }, pupils: rows, mostMissed, topics };
}

function buildLeaderboard(attempts) {
  const best = new Map(); // player -> {name, levels: {key: score}}
  for (const a of attempts) {
    if (!a.won) continue;
    const key = a.player_name.toLowerCase();
    if (!best.has(key)) best.set(key, { name: a.player_name, levels: {} });
    const p = best.get(key);
    p.levels[a.level_key] = Math.max(p.levels[a.level_key] || 0, a.score);
  }
  return [...best.values()]
    .map(p => ({ name: p.name, score: Object.values(p.levels).reduce((s, v) => s + v, 0), levels: Object.keys(p.levels).length }))
    .sort((a, b) => b.score - a.score).slice(0, 10);
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
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('bad json')); } });
  });
}

// In-memory certificate store — fallback when DB is unreachable
const certStore = [];
const MAX_CERTS = 500;

async function handleApi(req, res, url) {
  const method = req.method;
  let m;

  // ── Teacher login ──
  if (method === 'POST' && url === '/api/teacher/login') {
    const ip = clientIp(req), now = Date.now();
    const f = loginFailures.get(ip);
    if (f && f.resetAt > now && f.count >= MAX_LOGIN_FAILURES) {
      return json(res, 429, { error: 'Too many wrong PINs. Try again in a few minutes.' });
    }
    if (!TEACHER_PIN) return json(res, 503, { error: 'Teacher Mode is not set up on this server (TEACHER_PIN missing).' });
    const { pin } = await parseBody(req);
    if (!pinMatches(str(pin, 64))) {
      const e = f && f.resetAt > now ? f : { count: 0, resetAt: now + LOGIN_WINDOW_MS };
      e.count++;
      loginFailures.set(ip, e);
      return json(res, 401, { error: 'Wrong PIN. Try again.' });
    }
    loginFailures.delete(ip);
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, now + TOKEN_TTL_MS);
    return json(res, 200, { token });
  }

  // ── Teacher-only routes ──
  if (url.startsWith('/api/teacher/')) {
    if (!isTeacher(req)) return json(res, 401, { error: 'Please log in to Teacher Mode again.' });

    if (method === 'GET' && url === '/api/teacher/classes') {
      return json(res, 200, await store.listClasses());
    }
    if (method === 'POST' && url === '/api/teacher/classes') {
      const { name } = await parseBody(req);
      let code;
      for (let i = 0; i < 20; i++) { code = newClassCode(); if (!(await store.getClass(code))) break; }
      return json(res, 200, await store.createClass(code, str(name, 60) || 'My Class'));
    }
    if ((m = url.match(/^\/api\/teacher\/classes\/([A-Z0-9]{6})\/(assignment|questions|report)$/))) {
      const [, code, what] = m;
      const cls = await store.getClass(code);
      if (!cls) return json(res, 404, { error: 'Class not found' });
      if (method === 'PUT' && what === 'assignment') {
        const body = await parseBody(req);
        const levels = (Array.isArray(body.levels) ? body.levels : []).map(l => str(l, 8)).filter(l => LEVEL_RE.test(l)).slice(0, 20);
        const assignment = levels.length ? { levels, message: str(body.message, 200), setAt: new Date().toISOString() } : null;
        await store.setAssignment(code, assignment);
        return json(res, 200, { ok: true, assignment });
      }
      if (method === 'PUT' && what === 'questions') {
        const { questions } = await parseBody(req);
        const clean = cleanQuestions(questions);
        await store.setQuestions(code, clean);
        return json(res, 200, { ok: true, questions: clean });
      }
      if (method === 'GET' && what === 'report') {
        return json(res, 200, buildReport(cls, await store.getAttempts(code)));
      }
    }
    if (method === 'GET' && url === '/api/teacher/certificates') {
      if (!pool) return json(res, 200, certStore.slice(0, 200));
      try {
        const { rows } = await pool.query(
          'SELECT player_name,level_key,score,stars,world,year,created_at FROM certificates ORDER BY created_at DESC LIMIT 200');
        return json(res, 200, rows);
      } catch (e) {
        return json(res, 200, certStore.slice(0, 200));
      }
    }
    return json(res, 404, { error: 'Not found' });
  }

  // ── Public class routes ──
  if (method === 'GET' && (m = url.match(/^\/api\/class\/([A-Z0-9]{6})$/))) {
    const cls = await store.getClass(m[1]);
    if (!cls) return json(res, 404, { error: 'Class not found' });
    return json(res, 200, { code: cls.code, name: cls.name, assignment: cls.assignment, questions: cls.questions || {} });
  }
  if (method === 'GET' && (m = url.match(/^\/api\/class\/([A-Z0-9]{6})\/leaderboard$/))) {
    if (!(await store.getClass(m[1]))) return json(res, 404, { error: 'Class not found' });
    return json(res, 200, { since: startOfWeek().toISOString(), entries: buildLeaderboard(await store.getAttempts(m[1], startOfWeek())) });
  }
  // Pupil progress, so a pupil's stars and badges follow them to any device in the class
  if ((m = url.match(/^\/api\/class\/([A-Z0-9]{6})\/progress\/([^/]{1,90})$/))) {
    const code = m[1];
    const name = str(decodeURIComponent(m[2]), 30);
    const pupil = name.toLowerCase();
    if (!name) return json(res, 400, { error: 'invalid' });
    if (!(await store.getClass(code))) return json(res, 404, { error: 'Class not found' });
    if (method === 'GET') {
      const p = await store.getProgress(code, pupil);
      return p ? json(res, 200, p) : json(res, 404, { error: 'No saved progress' });
    }
    if (method === 'PUT') {
      if (rateLimited(req, 30)) return json(res, 429, { error: 'slow down' });
      const body = await parseBody(req);
      const clean = {};
      let size = 0;
      for (const key of PROGRESS_KEYS) {
        const v = body?.data?.[key];
        if (typeof v !== 'string') continue;
        size += v.length;
        clean[key] = v.slice(0, 20000);
      }
      if (size > 80000) return json(res, 413, { error: 'too large' });
      const updated_at = await store.setProgress(code, pupil, name, clean);
      return json(res, 200, { ok: true, updated_at });
    }
  }
  if (method === 'POST' && url === '/api/attempts') {
    if (rateLimited(req)) return json(res, 429, { error: 'slow down' });
    const b = await parseBody(req);
    const code = str(b.classCode, 6).toUpperCase();
    const levelKey = str(b.levelKey, 8);
    if (!CODE_RE.test(code) || !LEVEL_RE.test(levelKey) || !str(b.playerName, 30)) return json(res, 400, { error: 'invalid' });
    if (!(await store.getClass(code))) return json(res, 404, { error: 'Class not found' });
    await store.addAttempt({
      class_code: code,
      player_name: str(b.playerName, 30),
      level_key: levelKey,
      won: !!b.won,
      stars: Math.min(3, Math.max(0, Math.floor(Number(b.stars) || 0))),
      score: Math.max(0, Math.min(1e6, Math.floor(Number(b.score) || 0))),
      accuracy: Math.min(100, Math.max(0, Math.round(Number(b.accuracy) || 0))),
      missed: (Array.isArray(b.missed) ? b.missed : []).slice(0, 20).map(q => str(q, 120)),
    });
    return json(res, 200, { ok: true });
  }

  // ── API: post score ──
  if (method === 'POST' && url === '/api/scores') {
    if (!pool) return json(res, 503, { error: 'no database' });
    const { playerName, levelKey, score, stars } = await parseBody(req);
    if (!playerName || !levelKey || typeof score !== 'number') return json(res, 400, { error: 'invalid' });
    await pool.query(
      'INSERT INTO level_scores(player_name,level_key,score,stars) VALUES($1,$2,$3,$4)',
      [str(playerName, 64), str(levelKey, 16), Math.floor(score), Math.min(3, Math.max(1, stars || 1))]
    );
    return json(res, 200, { ok: true });
  }

  // ── API: submit certificate ──
  if (method === 'POST' && url === '/api/certificates') {
    if (rateLimited(req)) return json(res, 429, { error: 'slow down' });
    const { playerName, levelKey, score, stars, world, year } = await parseBody(req);
    if (!playerName || !levelKey) return json(res, 400, { error: 'invalid' });
    const cert = {
      player_name: str(playerName, 64),
      level_key:   str(levelKey, 16),
      score:       Math.floor(score || 0),
      stars:       Math.min(3, Math.max(1, stars || 1)),
      world:       str(world, 40),
      year:        Math.min(6, Math.max(1, Math.floor(year || 1))),
      created_at:  new Date().toISOString(),
    };
    certStore.unshift(cert);
    if (certStore.length > MAX_CERTS) certStore.pop();
    if (pool) {
      pool.query(
        'INSERT INTO certificates(player_name,level_key,score,stars,world,year) VALUES($1,$2,$3,$4,$5,$6)',
        [cert.player_name, cert.level_key, cert.score, cert.stars, cert.world, cert.year]
      ).catch(() => {});
    }
    return json(res, 200, { ok: true });
  }

  // ── API: get leaderboard for a level ──
  if (method === 'GET' && url.startsWith('/api/scores/')) {
    if (!pool) return json(res, 503, { error: 'no database' });
    const levelKey = url.slice('/api/scores/'.length);
    const { rows } = await pool.query(
      'SELECT player_name,score,stars,created_at FROM level_scores WHERE level_key=$1 ORDER BY score DESC LIMIT 20',
      [levelKey]
    );
    return json(res, 200, rows);
  }

  // ── API: save player progress ──
  if (method === 'POST' && url === '/api/progress') {
    if (!pool) return json(res, 503, { error: 'no database' });
    const { playerName, totalStars, totalScore, achievements, unlockedSkins } = await parseBody(req);
    if (!playerName) return json(res, 400, { error: 'invalid' });
    await pool.query(`
      INSERT INTO player_progress(player_name,total_stars,total_score,achievements,unlocked_skins,updated_at)
      VALUES($1,$2,$3,$4,$5,NOW())
      ON CONFLICT(player_name) DO UPDATE SET
        total_stars=EXCLUDED.total_stars, total_score=EXCLUDED.total_score,
        achievements=EXCLUDED.achievements, unlocked_skins=EXCLUDED.unlocked_skins, updated_at=NOW()
    `, [
      str(playerName, 64),
      Math.floor(totalStars || 0),
      Math.floor(totalScore || 0),
      JSON.stringify(achievements || {}),
      Array.isArray(unlockedSkins) ? unlockedSkins.map(String) : []
    ]);
    return json(res, 200, { ok: true });
  }

  // ── API: load player progress ──
  if (method === 'GET' && url.startsWith('/api/progress/')) {
    if (!pool) return json(res, 503, { error: 'no database' });
    const playerName = decodeURIComponent(url.slice('/api/progress/'.length));
    const { rows } = await pool.query( // bug20 fix: explicit columns, no SELECT *
      'SELECT player_name,total_stars,total_score,achievements,unlocked_skins,updated_at FROM player_progress WHERE player_name=$1', [playerName]
    );
    return json(res, 200, rows[0] || null);
  }

  return json(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  const filename = (url === '/' ? 'index.html' : decodeURIComponent(url.slice(1)));
  const parts = filename.split('/');
  const allowed = STATIC.includes(filename) ||
    (parts.length === 2 && STATIC_DIRS.includes(parts[0]) && /^[\w.-]+\.(js|css)$/.test(parts[1])) ||
    (parts.length === 3 && parts[0] === 'audio' && parts[1] === 'story' && /^[\w-]+\.(mp3|json)$/.test(parts[2]));
  if (!allowed) { res.writeHead(404); res.end('Not found'); return; }
  const mime = MIME[path.extname(filename)] || 'application/octet-stream';
  fs.readFile(path.join(__dirname, ...parts), (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const noCache = ['sw.js', 'manifest.json', 'index.html'].includes(filename) || STATIC_DIRS.includes(parts[0]) || filename.endsWith('.json');
    res.writeHead(200, {
      'Content-Type': mime,
      // HTML, scripts, sw.js and manifest.json revalidate so new deploys reach pupils immediately
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT' });
    res.end(); return;
  }

  if (url.startsWith('/api/')) {
    try {
      await handleApi(req, res, url);
    } catch (e) {
      console.error('[API]', url, e.message);
      if (!res.headersSent) json(res, e.message === 'bad json' || e.message === 'too large' ? 400 : 500, { error: 'server error' });
    }
    return;
  }
  serveStatic(req, res, url);
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
