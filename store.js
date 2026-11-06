// Class / attempt storage: PostgreSQL when configured, otherwise a local JSON file.
const fs   = require('fs');
const path = require('path');

const MAX_FILE_ATTEMPTS = 20000;
const MAX_FILE_REVIEWS = 5000;

// Average, count and star breakdown for the reviews wall
function summarise(rows) {
  const dist = [0, 0, 0, 0, 0];
  let total = 0;
  for (const r of rows) { dist[r.rating - 1] += r.n || 1; total += r.rating * (r.n || 1); }
  const count = dist.reduce((a, b) => a + b, 0);
  return { count, average: count ? Math.round((total / count) * 10) / 10 : 0, dist };
}

function createFileStore(file) {
  let data = { classes: {}, attempts: [], progress: {}, reviews: [], teachers: {} };
  try {
    data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[Store] Could not read', file, e.message);
  }
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file);
    }, 300);
  };

  return {
    kind: 'file',
    async createTeacher(t) {
      data.teachers ||= {};
      if (Object.values(data.teachers).some(x => x.email === t.email)) return null;
      const id = Object.values(data.teachers).reduce((m, x) => Math.max(m, x.id), 0) + 1;
      data.teachers[id] = { ...t, id, created_at: new Date().toISOString() };
      save();
      return data.teachers[id];
    },
    async getTeacherByEmail(email) {
      return Object.values(data.teachers || {}).find(x => x.email === email) || null;
    },
    async getTeacher(id) { return (data.teachers || {})[id] || null; },
    async createClass(code, name, teacherId) {
      const cls = { code, name, teacher_id: teacherId ?? null, assignment: null, questions: {}, created_at: new Date().toISOString() };
      data.classes[code] = cls;
      save();
      return cls;
    },
    async getClass(code) { return data.classes[code] || null; },
    async listClasses(teacherId) {
      return Object.values(data.classes)
        .filter(c => teacherId == null || c.teacher_id === teacherId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async setAssignment(code, assignment) {
      if (!data.classes[code]) return false;
      data.classes[code].assignment = assignment;
      save();
      return true;
    },
    async setQuestions(code, questions) {
      if (!data.classes[code]) return false;
      data.classes[code].questions = questions;
      save();
      return true;
    },
    async addAttempt(a) {
      data.attempts.push({ ...a, created_at: new Date().toISOString() });
      if (data.attempts.length > MAX_FILE_ATTEMPTS) data.attempts.splice(0, data.attempts.length - MAX_FILE_ATTEMPTS);
      save();
    },
    async getAttempts(code, since) {
      return data.attempts.filter(a => a.class_code === code && (!since || a.created_at >= since.toISOString()));
    },
    async getProgress(code, pupil) {
      return data.progress?.[code]?.[pupil] || null;
    },
    async setProgress(code, pupil, name, progress) {
      data.progress ||= {};
      (data.progress[code] ||= {})[pupil] = { name, data: progress, updated_at: new Date().toISOString() };
      save();
      return data.progress[code][pupil].updated_at;
    },
    async addReview(r) {
      data.reviews ||= [];
      const review = { ...r, id: (data.reviews.reduce((m, x) => Math.max(m, x.id), 0) + 1), created_at: new Date().toISOString() };
      data.reviews.unshift(review);
      if (data.reviews.length > MAX_FILE_REVIEWS) data.reviews.length = MAX_FILE_REVIEWS;
      save();
      return review;
    },
    async listReviews(limit) {
      const all = data.reviews || [];
      return { reviews: all.slice(0, limit), summary: summarise(all) };
    },
    async deleteReview(id) {
      const before = (data.reviews || []).length;
      data.reviews = (data.reviews || []).filter(r => r.id !== id);
      save();
      return data.reviews.length < before;
    },
  };
}

function createPgStore(pool) {
  const toClass = r => r && ({
    code: r.code, name: r.name, teacher_id: r.teacher_id ?? null, assignment: r.assignment, questions: r.questions || {},
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  });
  return {
    kind: 'postgres',
    async createTeacher(t) {
      const { rows } = await pool.query(
        `INSERT INTO teachers(email,name,school,pin_hash) VALUES($1,$2,$3,$4)
         ON CONFLICT(email) DO NOTHING RETURNING id,email,name,school,pin_hash,created_at`,
        [t.email, t.name, t.school, t.pin_hash]);
      return rows[0] || null;
    },
    async getTeacherByEmail(email) {
      const { rows } = await pool.query('SELECT id,email,name,school,pin_hash FROM teachers WHERE email=$1', [email]);
      return rows[0] || null;
    },
    async getTeacher(id) {
      const { rows } = await pool.query('SELECT id,email,name,school,pin_hash FROM teachers WHERE id=$1', [id]);
      return rows[0] || null;
    },
    async createClass(code, name, teacherId) {
      const { rows } = await pool.query(
        'INSERT INTO classes(code,name,teacher_id) VALUES($1,$2,$3) RETURNING code,name,teacher_id,assignment,questions,created_at',
        [code, name, teacherId ?? null]);
      return toClass(rows[0]);
    },
    async getClass(code) {
      const { rows } = await pool.query('SELECT code,name,teacher_id,assignment,questions,created_at FROM classes WHERE code=$1', [code]);
      return toClass(rows[0]) || null;
    },
    async listClasses(teacherId) {
      const { rows } = await pool.query(
        `SELECT code,name,teacher_id,assignment,questions,created_at FROM classes
         WHERE $1::int IS NULL OR teacher_id=$1 ORDER BY created_at DESC`, [teacherId ?? null]);
      return rows.map(toClass);
    },
    async setAssignment(code, assignment) {
      const r = await pool.query('UPDATE classes SET assignment=$2 WHERE code=$1', [code, JSON.stringify(assignment)]);
      return r.rowCount > 0;
    },
    async setQuestions(code, questions) {
      const r = await pool.query('UPDATE classes SET questions=$2 WHERE code=$1', [code, JSON.stringify(questions)]);
      return r.rowCount > 0;
    },
    async addAttempt(a) {
      await pool.query(
        `INSERT INTO attempts(class_code,player_name,level_key,won,stars,score,accuracy,missed)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [a.class_code, a.player_name, a.level_key, a.won, a.stars, a.score, a.accuracy, JSON.stringify(a.missed)]);
    },
    async getAttempts(code, since) {
      const { rows } = await pool.query(
        `SELECT class_code,player_name,level_key,won,stars,score,accuracy,missed,created_at FROM attempts
         WHERE class_code=$1 AND ($2::timestamptz IS NULL OR created_at >= $2) ORDER BY created_at`,
        [code, since || null]);
      return rows.map(r => ({ ...r, created_at: r.created_at.toISOString() }));
    },
    async getProgress(code, pupil) {
      const { rows } = await pool.query(
        'SELECT name, data, updated_at FROM pupil_progress WHERE class_code=$1 AND pupil_key=$2', [code, pupil]);
      return rows[0] ? { ...rows[0], updated_at: rows[0].updated_at.toISOString() } : null;
    },
    async setProgress(code, pupil, name, progress) {
      const { rows } = await pool.query(
        `INSERT INTO pupil_progress(class_code,pupil_key,name,data,updated_at) VALUES($1,$2,$3,$4,NOW())
         ON CONFLICT(class_code,pupil_key) DO UPDATE SET name=EXCLUDED.name, data=EXCLUDED.data, updated_at=NOW()
         RETURNING updated_at`,
        [code, pupil, name, JSON.stringify(progress)]);
      return rows[0].updated_at.toISOString();
    },
    async addReview(r) {
      const { rows } = await pool.query(
        `INSERT INTO reviews(name,role,organisation,rating,tags,comment) VALUES($1,$2,$3,$4,$5,$6)
         RETURNING id,name,role,organisation,rating,tags,comment,created_at`,
        [r.name, r.role, r.organisation, r.rating, JSON.stringify(r.tags), r.comment]);
      return { ...rows[0], created_at: rows[0].created_at.toISOString() };
    },
    async listReviews(limit) {
      const [list, dist] = await Promise.all([
        pool.query('SELECT id,name,role,organisation,rating,tags,comment,created_at FROM reviews ORDER BY created_at DESC LIMIT $1', [limit]),
        pool.query('SELECT rating, COUNT(*)::int AS n FROM reviews GROUP BY rating'),
      ]);
      return {
        reviews: list.rows.map(r => ({ ...r, created_at: r.created_at.toISOString() })),
        summary: summarise(dist.rows),
      };
    },
    async deleteReview(id) {
      const r = await pool.query('DELETE FROM reviews WHERE id=$1', [id]);
      return r.rowCount > 0;
    },
  };
}

module.exports = { createFileStore, createPgStore };
