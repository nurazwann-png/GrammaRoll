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
// Teachers register their own accounts (email + PIN). TEACHER_PIN is the school admin PIN:
// it can see every class, remove reviews and view certificates.
const TEACHER_PIN = process.env.TEACHER_PIN || (IS_PROD ? '' : '1234');
if (!process.env.TEACHER_PIN) {
  console.warn(IS_PROD
    ? '[Auth] TEACHER_PIN is not set — the admin login is disabled (teacher accounts still work).'
    : '[Auth] TEACHER_PIN is not set — using the development admin PIN 1234. Set TEACHER_PIN in .env.');
}
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;          // a normal sign-in lasts one school day
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // "Remember me on this device"
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

// Sessions are signed tokens (not kept in memory), so they survive restarts and deploys.
// A token stops working when the teacher's PIN changes or is reset, or the account is turned off.
let sessionSecretValue = process.env.SESSION_SECRET || null;
async function sessionSecret() {
  if (sessionSecretValue) return sessionSecretValue;
  let secret = await store.getSetting('session_secret');
  if (!secret) { secret = crypto.randomBytes(32).toString('hex'); await store.setSetting('session_secret', secret); }
  return (sessionSecretValue = secret);
}
const adminPinVersion = () => sha('admin:' + TEACHER_PIN).toString('hex').slice(0, 12);
const b64 = buf => Buffer.from(buf).toString('base64url');
async function issueToken({ teacherId = null, admin = false, pinVersion = 0, remember = false }) {
  const payload = b64(JSON.stringify({
    t: teacherId, a: admin, v: admin ? adminPinVersion() : pinVersion, r: !!remember,
    e: Date.now() + (remember ? REMEMBER_TTL_MS : TOKEN_TTL_MS),
  }));
  const sig = b64(crypto.createHmac('sha256', await sessionSecret()).update(payload).digest());
  return `${payload}.${sig}`;
}
// Returns { admin, teacherId, teacher, remember } or null
async function teacherSession(req) {
  const m = (req.headers.authorization || '').match(/^Bearer ([A-Za-z0-9_-]{10,600})\.([A-Za-z0-9_-]{43})$/);
  if (!m) return null;
  const want = crypto.createHmac('sha256', await sessionSecret()).update(m[1]).digest();
  const got = Buffer.from(m[2], 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!p || p.e < Date.now()) return null;
  if (p.a) return TEACHER_PIN && p.v === adminPinVersion() ? { admin: true, teacherId: null, teacher: null, remember: p.r } : null;
  const teacher = await store.getTeacher(p.t);
  if (!teacher || teacher.status !== 'active' || (teacher.pin_version || 0) !== p.v) return null;
  return { admin: false, teacherId: teacher.id, teacher, remember: p.r };
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,120}\.[^\s@]{2,20}$/;
const TEACHER_PIN_RE = /^\d{4,8}$/;
function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pin, salt, 32).toString('hex')}`;
}
function pinHashMatches(pin, stored) {
  const [kind, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'hex');
  const got = crypto.scryptSync(String(pin), Buffer.from(salt, 'hex'), want.length);
  return crypto.timingSafeEqual(got, want);
}
const publicTeacher = t => ({
  id: t.id, name: t.name, school: t.school, email: t.email, admin: false, must_change_pin: !!t.must_change_pin,
});
const ADMIN_PROFILE = { name: 'School admin', school: '', admin: true, must_change_pin: false };
const SIGNUP_MODES = ['open', 'code', 'approval'];
async function signupSettings() {
  const v = await store.getSetting('signup');
  return { mode: SIGNUP_MODES.includes(v?.mode) ? v.mode : 'open', code: v?.code || '' };
}

// Simple fixed-window limiter for public write endpoints
const writeHits = new Map();
// Each kind of request has its own counter, so a classroom sharing one school IP
// posting game results does not block reviews or teacher sign-ups.
function rateLimited(req, max = 60, bucket = 'write') {
  const key = `${bucket}:${clientIp(req)}`, now = Date.now();
  const e = writeHits.get(key);
  if (!e || e.resetAt < now) { writeHits.set(key, { count: 1, resetAt: now + 60000 }); return false; }
  e.count++;
  return e.count > max;
}
setInterval(() => {
  const now = Date.now();
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
const REVIEW_ROLES = ['student', 'teacher', 'parent', 'institution', 'public'];
const REVIEW_TAGS = ['fun', 'learn', 'story', 'graphics', 'sounds', 'boss'];

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

  // ── Teacher sign-in: email + PIN for teachers, PIN only for the school admin ──
  if (method === 'POST' && url === '/api/teacher/login') {
    const ip = clientIp(req), now = Date.now();
    const f = loginFailures.get(ip);
    if (f && f.resetAt > now && f.count >= MAX_LOGIN_FAILURES) {
      return json(res, 429, { error: 'Too many wrong tries. Please wait 10 minutes and try again.' });
    }
    const fail = msg => {
      const e = f && f.resetAt > now ? f : { count: 0, resetAt: now + LOGIN_WINDOW_MS };
      e.count++;
      loginFailures.set(ip, e);
      return json(res, 401, { error: msg });
    };
    const body = await parseBody(req);
    const pin = str(body.pin, 64);
    const email = str(body.email, 200).toLowerCase();
    const remember = !!body.remember;
    if (!email) {
      if (!TEACHER_PIN) return json(res, 503, { error: 'The admin PIN is not set up on this server.' });
      if (!pinMatches(pin)) return fail('Wrong admin PIN. Try again.');
      loginFailures.delete(ip);
      return json(res, 200, { token: await issueToken({ admin: true, remember }), teacher: ADMIN_PROFILE });
    }
    const teacher = await store.getTeacherByEmail(email);
    if (!teacher || !pinHashMatches(pin, teacher.pin_hash)) return fail('Wrong email or PIN. Try again.');
    loginFailures.delete(ip);
    if (teacher.status === 'pending') return json(res, 403, { error: 'Your account is waiting for the school admin to approve it.' });
    if (teacher.status !== 'active') return json(res, 403, { error: 'This account has been turned off. Please ask your school admin.' });
    const updated = await store.updateTeacher(teacher.id, { last_login_at: new Date().toISOString() });
    const token = await issueToken({ teacherId: teacher.id, pinVersion: teacher.pin_version || 0, remember });
    return json(res, 200, { token, teacher: publicTeacher(updated || teacher) });
  }

  // What the Register form needs to show (never reveals the sign-up code itself)
  if (method === 'GET' && url === '/api/teacher/signup-info') {
    return json(res, 200, { mode: (await signupSettings()).mode });
  }

  // ── Teacher registration ──
  if (method === 'POST' && url === '/api/teacher/register') {
    if (rateLimited(req, 10, 'register')) return json(res, 429, { error: 'Too many sign-ups. Please try again in a minute.' });
    const b = await parseBody(req);
    const name = str(b.name, 60), school = str(b.school, 80), pin = String(b.pin ?? '');
    const email = str(b.email, 200).toLowerCase();
    if (name.length < 2) return json(res, 400, { error: 'Please type your name.' });
    if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'Please type a valid email address.' });
    if (!TEACHER_PIN_RE.test(pin)) return json(res, 400, { error: 'Your PIN must be 4 to 8 numbers.' });
    const signup = await signupSettings();
    if (signup.mode === 'code' && str(b.signupCode, 40).toUpperCase() !== signup.code.toUpperCase()) {
      return json(res, 403, { error: 'That school sign-up code is not right. Ask your school admin for it.' });
    }
    const status = signup.mode === 'approval' ? 'pending' : 'active';
    const teacher = await store.createTeacher({ email, name, school, pin_hash: hashPin(pin), status });
    if (!teacher) return json(res, 409, { error: 'This email already has an account. Please sign in.' });
    if (status === 'pending') return json(res, 200, { pending: true });
    const token = await issueToken({ teacherId: teacher.id, pinVersion: 0, remember: !!b.remember });
    return json(res, 200, { token, teacher: publicTeacher(teacher) });
  }

  // ── Reviews: anyone can read and post; the school admin can remove ──
  if (url === '/api/reviews') {
    if (method === 'GET') return json(res, 200, await store.listReviews(200));
    if (method === 'POST') {
      if (rateLimited(req, 20, 'reviews')) return json(res, 429, { error: 'Too many reviews. Please try again in a minute.' });
      const b = await parseBody(req);
      const rating = Math.floor(Number(b.rating));
      const role = str(b.role, 20);
      if (!(rating >= 1 && rating <= 5) || !REVIEW_ROLES.includes(role)) return json(res, 400, { error: 'Please choose a rating and who you are.' });
      const review = await store.addReview({
        name: str(b.name, 40) || 'Anonymous',
        role,
        organisation: str(b.organisation, 80),
        rating,
        tags: (Array.isArray(b.tags) ? b.tags : []).filter(t => REVIEW_TAGS.includes(t)).slice(0, REVIEW_TAGS.length),
        comment: str(b.comment, 500),
      });
      return json(res, 200, review);
    }
  }

  // ── Teacher-only routes ──
  if (url.startsWith('/api/teacher/')) {
    const session = await teacherSession(req);
    if (!session) return json(res, 401, { error: 'Please sign in to Teacher Mode again.' });
    const adminOnly = () => json(res, 403, { error: 'Only the school admin can do this.' });
    const isOwner = cls => session.admin || (cls.teacher_id != null && cls.teacher_id === session.teacherId);
    const canTeach = cls => isOwner(cls) || (cls.co_teacher_ids || []).includes(session.teacherId);

    // ── My account ──
    if (url === '/api/teacher/me') {
      if (method === 'GET') return json(res, 200, session.admin ? ADMIN_PROFILE : publicTeacher(session.teacher));
      if (method === 'PUT' && !session.admin) {
        const b = await parseBody(req);
        const name = str(b.name, 60), school = str(b.school, 80);
        if (name.length < 2) return json(res, 400, { error: 'Please type your name.' });
        return json(res, 200, publicTeacher(await store.updateTeacher(session.teacherId, { name, school })));
      }
    }
    if (method === 'PUT' && url === '/api/teacher/me/pin' && !session.admin) {
      const b = await parseBody(req);
      const t = session.teacher;
      if (!pinHashMatches(str(b.oldPin, 64), t.pin_hash)) return json(res, 400, { error: 'Your current PIN is not right.' });
      const newPin = String(b.newPin ?? '');
      if (!TEACHER_PIN_RE.test(newPin)) return json(res, 400, { error: 'Your new PIN must be 4 to 8 numbers.' });
      if (newPin === str(b.oldPin, 64)) return json(res, 400, { error: 'Please choose a different PIN from the old one.' });
      const pinVersion = (t.pin_version || 0) + 1;
      const updated = await store.updateTeacher(t.id, { pin_hash: hashPin(newPin), pin_version: pinVersion, must_change_pin: false });
      const token = await issueToken({ teacherId: t.id, pinVersion, remember: session.remember });
      return json(res, 200, { token, teacher: publicTeacher(updated) });
    }
    // A teacher given a temporary PIN must choose a new one before doing anything else
    if (!session.admin && session.teacher.must_change_pin) {
      return json(res, 403, { error: 'Please choose a new PIN first.', mustChangePin: true });
    }

    // ── School admin tools ──
    if (url.startsWith('/api/teacher/admin/')) {
      if (!session.admin) return adminOnly();
      if (method === 'GET' && url === '/api/teacher/admin/teachers') {
        return json(res, 200, (await store.listTeachers()).map(t => ({
          id: t.id, name: t.name, email: t.email, school: t.school, status: t.status,
          must_change_pin: !!t.must_change_pin, last_login_at: t.last_login_at, created_at: t.created_at, classes: t.classes,
        })));
      }
      if ((m = url.match(/^\/api\/teacher\/admin\/teachers\/(\d{1,9})(\/reset-pin)?$/))) {
        const t = await store.getTeacher(Number(m[1]));
        if (!t) return json(res, 404, { error: 'Teacher not found' });
        if (method === 'POST' && m[2]) {
          const tempPin = String(crypto.randomInt(100000, 1000000));
          await store.updateTeacher(t.id, { pin_hash: hashPin(tempPin), pin_version: (t.pin_version || 0) + 1, must_change_pin: true });
          return json(res, 200, { tempPin });
        }
        if (method === 'PUT' && !m[2]) {
          const { status } = await parseBody(req);
          if (!['active', 'disabled'].includes(status)) return json(res, 400, { error: 'invalid' });
          // Turning an account off also signs it out everywhere
          await store.updateTeacher(t.id, { status, pin_version: (t.pin_version || 0) + (status === 'disabled' ? 1 : 0) });
          return json(res, 200, { ok: true });
        }
      }
      if (url === '/api/teacher/admin/signup') {
        if (method === 'GET') return json(res, 200, await signupSettings());
        if (method === 'PUT') {
          const b = await parseBody(req);
          const mode = SIGNUP_MODES.includes(b.mode) ? b.mode : 'open';
          const code = str(b.code, 40);
          if (mode === 'code' && code.length < 4) return json(res, 400, { error: 'The sign-up code needs at least 4 letters or numbers.' });
          await store.setSetting('signup', { mode, code });
          return json(res, 200, { mode, code });
        }
      }
      return json(res, 404, { error: 'Not found' });
    }

    if (method === 'DELETE' && (m = url.match(/^\/api\/teacher\/reviews\/(\d{1,9})$/))) {
      if (!session.admin) return adminOnly();
      return (await store.deleteReview(Number(m[1]))) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Review not found' });
    }

    // ── Dashboard: the teacher's classes at a glance ──
    if (method === 'GET' && url === '/api/teacher/dashboard') {
      const classes = (await store.listClasses(session.admin ? null : session.teacherId)).filter(c => !c.archived);
      const weekAgo = new Date(Date.now() - 7 * 864e5), monthAgo = new Date(Date.now() - 30 * 864e5);
      const levelStats = new Map();
      const out = [];
      for (const c of classes) {
        const [attempts, progress] = await Promise.all([store.getAttempts(c.code, monthAgo), store.listProgress(c.code)]);
        const pupils = new Set(progress.map(p => p.pupil));
        attempts.forEach(a => pupils.add(a.player_name.toLowerCase()));
        const active = new Set(attempts.filter(a => a.created_at >= weekAgo.toISOString()).map(a => a.player_name.toLowerCase()));
        const levels = c.assignment?.levels || [];
        const wins = new Map();
        for (const a of attempts) {
          if (a.won) (wins.get(a.player_name.toLowerCase()) || wins.set(a.player_name.toLowerCase(), new Set()).get(a.player_name.toLowerCase())).add(a.level_key);
          const t = levelStats.get(a.level_key) || { level: a.level_key, acc: 0, n: 0 };
          t.acc += a.accuracy; t.n++;
          levelStats.set(a.level_key, t);
        }
        const homeworkDone = levels.length ? [...wins.values()].filter(w => levels.every(l => w.has(l))).length : 0;
        out.push({
          code: c.code, name: c.name, shared: !isOwner(c), pupils: pupils.size, activeThisWeek: active.size,
          homework: levels.length ? { levels, message: c.assignment.message, setAt: c.assignment.setAt, done: homeworkDone } : null,
        });
      }
      const weakTopics = [...levelStats.values()]
        .map(t => ({ level: t.level, accuracy: Math.round(t.acc / t.n), attempts: t.n }))
        .filter(t => t.accuracy < 80).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
      return json(res, 200, { classes: out, weakTopics });
    }

    // ── Classes ──
    if (method === 'GET' && url === '/api/teacher/classes') {
      const list = await store.listClasses(session.admin ? null : session.teacherId);
      const names = new Map();
      for (const c of list) for (const id of c.co_teacher_ids || []) {
        if (!names.has(id)) { const t = await store.getTeacher(id); names.set(id, t ? { id: t.id, name: t.name, email: t.email } : null); }
      }
      return json(res, 200, list.map(c => ({
        ...c, mine: isOwner(c), co_teachers: (c.co_teacher_ids || []).map(id => names.get(id)).filter(Boolean),
      })));
    }
    if (method === 'POST' && url === '/api/teacher/classes') {
      const { name } = await parseBody(req);
      let code;
      for (let i = 0; i < 20; i++) { code = newClassCode(); if (!(await store.getClass(code))) break; }
      return json(res, 200, await store.createClass(code, str(name, 60) || 'My Class', session.admin ? null : session.teacherId));
    }
    if ((m = url.match(/^\/api\/teacher\/classes\/([A-Z0-9]{6})(?:\/(assignment|questions|report|pupils|share)(?:\/([^/]{1,90}))?)?$/))) {
      const [, code, what, arg] = m;
      const cls = await store.getClass(code);
      if (!cls || !canTeach(cls)) return json(res, 404, { error: 'Class not found' });
      const ownerOnly = () => json(res, 403, { error: 'Only the teacher who made this class can do this.' });

      if (!what) {
        if (method === 'PUT') {
          if (!isOwner(cls)) return ownerOnly();
          const b = await parseBody(req);
          const fields = {};
          if (b.name !== undefined) { fields.name = str(b.name, 60); if (!fields.name) return json(res, 400, { error: 'Please type a class name.' }); }
          if (b.archived !== undefined) fields.archived = !!b.archived;
          return json(res, 200, await store.updateClass(code, fields));
        }
        if (method === 'DELETE') {
          if (!isOwner(cls)) return ownerOnly();
          await store.deleteClass(code);
          return json(res, 200, { ok: true });
        }
      }
      if (what === 'share') {
        if (!isOwner(cls)) return ownerOnly();
        const ids = cls.co_teacher_ids || [];
        if (method === 'POST' && !arg) {
          const { email } = await parseBody(req);
          const t = await store.getTeacherByEmail(str(email, 200).toLowerCase());
          if (!t || t.status !== 'active') return json(res, 404, { error: 'No teacher account uses that email. Ask them to register first.' });
          if (t.id === cls.teacher_id) return json(res, 400, { error: 'That is you! You already own this class.' });
          if (!ids.includes(t.id)) await store.updateClass(code, { co_teacher_ids: [...ids, t.id] });
          return json(res, 200, { ok: true, teacher: { id: t.id, name: t.name, email: t.email } });
        }
        if (method === 'DELETE' && /^\d{1,9}$/.test(arg || '')) {
          await store.updateClass(code, { co_teacher_ids: ids.filter(id => id !== Number(arg)) });
          return json(res, 200, { ok: true });
        }
      }
      if (what === 'pupils') {
        if (method === 'GET' && !arg) {
          const [attempts, progress] = await Promise.all([store.getAttempts(code), store.listProgress(code)]);
          const pupils = new Map();
          for (const p of progress) {
            pupils.set(p.pupil, { key: p.pupil, name: p.name, stars: Number(p.data?.gr_total_stars) || 0, attempts: 0, lastPlayed: p.updated_at });
          }
          // Stars: the best of the device-synced total and the best stars per level from results
          const best = new Map();
          for (const a of attempts) {
            const k = a.player_name.toLowerCase();
            const p = pupils.get(k) || { key: k, name: a.player_name, stars: 0, attempts: 0, lastPlayed: a.created_at };
            p.attempts++;
            if (a.created_at > p.lastPlayed) p.lastPlayed = a.created_at;
            pupils.set(k, p);
            if (a.won) { const m = best.get(k) || {}; m[a.level_key] = Math.max(m[a.level_key] || 0, a.stars); best.set(k, m); }
          }
          for (const [k, m] of best) { const p = pupils.get(k); p.stars = Math.max(p.stars, Object.values(m).reduce((x, y) => x + y, 0)); }
          return json(res, 200, [...pupils.values()].sort((a, b) => a.name.localeCompare(b.name)));
        }
        if (method === 'DELETE' && arg) {
          const pupil = str(decodeURIComponent(arg), 30).toLowerCase();
          return (await store.deletePupil(code, pupil)) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Pupil not found' });
        }
      }
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
      if (!session.admin) return adminOnly();
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
      if (rateLimited(req, 30, 'progress')) return json(res, 429, { error: 'slow down' });
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
