// Class / attempt storage: PostgreSQL when configured, otherwise a local JSON file.
const fs   = require('fs');
const path = require('path');

const MAX_FILE_ATTEMPTS = 20000;

function createFileStore(file) {
  let data = { classes: {}, attempts: [], progress: {} };
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
    async createClass(code, name) {
      const cls = { code, name, assignment: null, questions: {}, created_at: new Date().toISOString() };
      data.classes[code] = cls;
      save();
      return cls;
    },
    async getClass(code) { return data.classes[code] || null; },
    async listClasses() {
      return Object.values(data.classes).sort((a, b) => b.created_at.localeCompare(a.created_at));
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
  };
}

function createPgStore(pool) {
  const toClass = r => r && ({
    code: r.code, name: r.name, assignment: r.assignment, questions: r.questions || {},
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  });
  return {
    kind: 'postgres',
    async createClass(code, name) {
      const { rows } = await pool.query(
        'INSERT INTO classes(code,name) VALUES($1,$2) RETURNING code,name,assignment,questions,created_at', [code, name]);
      return toClass(rows[0]);
    },
    async getClass(code) {
      const { rows } = await pool.query('SELECT code,name,assignment,questions,created_at FROM classes WHERE code=$1', [code]);
      return toClass(rows[0]) || null;
    },
    async listClasses() {
      const { rows } = await pool.query('SELECT code,name,assignment,questions,created_at FROM classes ORDER BY created_at DESC');
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
  };
}

module.exports = { createFileStore, createPgStore };
