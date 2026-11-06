// ══════════════════════════════════════════════
//  MOD GURU
// ══════════════════════════════════════════════
const GURU_LS_KEY = 'gr_guru_questions'; // {levelKey: [{q,correct,wrong:[]},...]}
const GURU_TOKEN_KEY = 'gr_teacher_token';
let guruCurrentLevel = '1-1';
let guruUnlocked = false;
let guruClasses = [];
let guruClassCode = null;
let guruLastReport = null;

function guruToken() { try { return sessionStorage.getItem(GURU_TOKEN_KEY); } catch(e) { return null; } }
async function guruFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guruToken()}`, ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    try { sessionStorage.removeItem(GURU_TOKEN_KEY); } catch(e) {}
    showGuruMode();
    throw new Error(body.error || 'Please log in again.');
  }
  if (!res.ok) throw new Error(body.error || 'Server error');
  return body;
}

function getLocalGuruQuestions(levelKey) {
  try {
    const raw = localStorage.getItem(GURU_LS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all[levelKey] || [];
  } catch(e) { return []; }
}
// Teacher questions from this device plus those shared with the pupil's class
function getGuruQuestions(levelKey) {
  const local = getLocalGuruQuestions(levelKey);
  const shared = (getClassInfo()?.questions?.[levelKey] || []).filter(isMcqQuestion);
  const seen = new Set(local.map(q => q.q));
  return [...local, ...shared.filter(q => !seen.has(q.q))];
}

function saveGuruQuestions(levelKey, questions) {
  try {
    const raw = localStorage.getItem(GURU_LS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[levelKey] = questions;
    localStorage.setItem(GURU_LS_KEY, JSON.stringify(all));
  } catch(e) {}
}

function getAllGuruQuestions() {
  try {
    const raw = localStorage.getItem(GURU_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function showGuruMode() {
  guruCurrentLevel = LEVEL_KEYS[0];
  document.getElementById('guru-overlay').classList.remove('hidden');
  if (guruToken()) { openGuruMain(); return; }
  guruUnlocked = false;
  document.getElementById('guru-pin-input').value = '';
  document.getElementById('guru-pin-error').textContent = '';
  document.getElementById('guru-pin-section').style.display = '';
  document.getElementById('guru-main').classList.add('hidden');
  setTimeout(() => document.getElementById('guru-pin-input').focus(), 100);
}

async function checkGuruPin() {
  const input = document.getElementById('guru-pin-input');
  const err = document.getElementById('guru-pin-error');
  if (!input.value) { err.textContent = 'Please type the PIN.'; return; }
  err.textContent = 'Checking…';
  try {
    const res = await fetch('/api/teacher/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: input.value }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { err.textContent = body.error || 'Wrong PIN. Try again.'; input.select(); return; }
    try { sessionStorage.setItem(GURU_TOKEN_KEY, body.token); } catch(e) {}
    input.value = '';
    err.textContent = '';
    openGuruMain();
  } catch (e) {
    err.textContent = 'Teacher Mode needs the game server. Ask your school admin to run it with "npm start".';
  }
}

function openGuruMain() {
  guruUnlocked = true;
  document.getElementById('guru-pin-section').style.display = 'none';
  document.getElementById('guru-main').classList.remove('hidden');
  document.querySelectorAll('.guru-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  renderGuruQuestions();
  loadGuruClasses();
  document.getElementById('guru-unlock-all').checked = !!getSettings().unlockAll;
}

async function loadGuruClasses(selectCode) {
  const msg = document.getElementById('guru-class-msg');
  try {
    guruClasses = await guruFetch('/api/teacher/classes');
  } catch (e) { msg.textContent = `⚠️ ${e.message}`; return; }
  const sel = document.getElementById('guru-class-select');
  if (!guruClasses.length) {
    sel.innerHTML = '<option value="">No classes yet — create one below</option>';
    guruSelectClass('');
    return;
  }
  sel.innerHTML = guruClasses.map(c => `<option value="${c.code}">${esc(c.name)} · ${c.code}</option>`).join('');
  const code = selectCode || (guruClasses.some(c => c.code === guruClassCode) ? guruClassCode : guruClasses[0].code);
  sel.value = code;
  guruSelectClass(code);
}

function guruSelectClass(code) {
  guruClassCode = code || null;
  guruLastReport = null;
  document.getElementById('guru-class-tools').style.display = code ? '' : 'none';
  document.getElementById('guru-report').innerHTML = '';
  const cls = guruClasses.find(c => c.code === code);
  const assigned = cls?.assignment?.levels || [];
  document.getElementById('guru-assign-levels').innerHTML = LEVEL_KEYS.map(k =>
    `<label><input type="checkbox" value="${k}" ${assigned.includes(k) ? 'checked' : ''}> ${levelLabel(k)} · ${esc(GRAMMAR_DB[k].topic)}</label>`
  ).join('');
  document.getElementById('guru-assign-message').value = cls?.assignment?.message || '';
  document.getElementById('guru-class-msg').textContent = cls
    ? `Pupils join in ⚙️ Settings with code ${cls.code}.` : '';
}

async function guruCreateClass() {
  const input = document.getElementById('guru-new-class-name');
  const msg = document.getElementById('guru-class-msg');
  try {
    const cls = await guruFetch('/api/teacher/classes', { method: 'POST', body: JSON.stringify({ name: input.value.trim() }) });
    input.value = '';
    await loadGuruClasses(cls.code);
    msg.textContent = `✅ Created ${cls.name}. Class code: ${cls.code}`;
  } catch (e) { msg.textContent = `⚠️ ${e.message}`; }
}

async function guruSaveAssignment(clear = false) {
  if (!guruClassCode) return;
  const levels = clear ? [] : [...document.querySelectorAll('#guru-assign-levels input:checked')].map(i => i.value);
  const message = clear ? '' : document.getElementById('guru-assign-message').value.trim();
  try {
    await guruFetch(`/api/teacher/classes/${guruClassCode}/assignment`, { method: 'PUT', body: JSON.stringify({ levels, message }) });
    await loadGuruClasses(guruClassCode);
    showToast(levels.length ? `📋 Homework saved: ${levels.length} level(s)` : '📋 Homework cleared');
  } catch (e) { showToast(`⚠️ ${e.message}`); }
}
function guruClearAssignment() { guruSaveAssignment(true); }

async function guruShareQuestions() {
  if (!guruClassCode) return;
  try {
    const all = getAllGuruQuestions();
    const res = await guruFetch(`/api/teacher/classes/${guruClassCode}/questions`, { method: 'PUT', body: JSON.stringify({ questions: all }) });
    const n = Object.values(res.questions).reduce((s, l) => s + l.length, 0);
    showToast(`📤 Shared ${n} custom question${n === 1 ? '' : 's'} with the class`);
  } catch (e) { showToast(`⚠️ ${e.message}`); }
}

async function loadClassReport() {
  if (!guruClassCode) return;
  const el = document.getElementById('guru-report');
  el.innerHTML = '<div class="settings-hint">Loading…</div>';
  try {
    const r = await guruFetch(`/api/teacher/classes/${guruClassCode}/report`);
    guruLastReport = r;
    if (!r.pupils.length) { el.innerHTML = '<div class="settings-hint">No results yet. Results appear when pupils who joined this class finish or fail a level.</div>'; return; }
    const hw = r.class.assignment?.levels?.length;
    el.innerHTML = `
      <table class="dash-table">
        <thead><tr><th>Pupil</th><th>Accuracy</th><th>Levels</th>${hw ? '<th>Homework</th>' : ''}<th>Needs practice</th><th>Last played</th></tr></thead>
        <tbody>${r.pupils.map(p => `<tr>
          <td>${esc(p.name)}</td>
          <td class="${p.accuracy < 70 ? 'dash-acc-low' : 'dash-acc-ok'}">${p.accuracy}%</td>
          <td>${p.levelsCompleted} · ${p.stars}⭐</td>
          ${hw ? `<td>${p.homeworkDone}/${p.homeworkTotal}</td>` : ''}
          <td>${p.topMissed.map(q => esc(q)).join('<br>') || '—'}</td>
          <td>${new Date(p.lastPlayed).toLocaleDateString('en-MY', { day:'numeric', month:'short' })}</td>
        </tr>`).join('')}</tbody>
      </table>
      ${r.topics?.length ? `<h3 style="margin-top:14px;">📈 Topic mastery</h3>${masteryChartHTML(r.topics)}` : ''}
      ${r.mostMissed.length ? `<h3 style="margin-top:14px;">🎯 Class's most-missed questions</h3>
        <ol style="color:#fff;font-size:.82rem;padding-left:20px;margin:0;">${r.mostMissed.map(m => `<li>${esc(m.question)} <span style="color:#FF8FA8;">(${m.count}×)</span></li>`).join('')}</ol>` : ''}
      <button class="btn btn-secondary" style="width:100%;font-size:.9rem;margin-top:12px;" onclick="printClassReport()">🖨️ Print report</button>`;
  } catch (e) { el.innerHTML = `<div class="settings-hint">⚠️ ${esc(e.message)}</div>`; }
}

// Horizontal bars: class accuracy per level (green ≥ 80%, amber ≥ 60%, red below)
function masteryChartHTML(topics) {
  return `<div class="mastery-chart" role="list">${topics.map(t => {
    const d = GRAMMAR_DB[t.level];
    const band = t.accuracy >= 80 ? 'good' : t.accuracy >= 60 ? 'ok' : 'low';
    return `<div class="mastery-row" role="listitem" aria-label="${esc(d ? `${levelLabel(t.level)} ${d.topic}` : t.level)}: ${t.accuracy}% accuracy">
      <div class="mastery-label">${d ? `${levelLabel(t.level)} · ${esc(d.topic)}` : esc(t.level)}</div>
      <div class="mastery-bar"><div class="mastery-fill ${band}" style="width:${t.accuracy}%"></div></div>
      <div class="mastery-val">${t.accuracy}%</div>
      <div class="mastery-sub">${t.passed}/${t.pupils} passed</div>
    </div>`;
  }).join('')}</div>`;
}

function printClassReport() {
  const r = guruLastReport;
  if (!r) return;
  const assigned = r.class.assignment?.levels || [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.class.name)} — Grammar Ball report</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
      h1 { margin: 0 0 4px; font-size: 22px; } h2 { font-size: 16px; margin: 22px 0 8px; }
      .muted { color: #555; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 5px 6px; text-align: left; vertical-align: top; }
      th { background: #f2f2f2; }
      .low { color: #b00020; font-weight: bold; }
      .bar { height: 10px; background: #eee; border-radius: 5px; overflow: hidden; width: 160px; display: inline-block; vertical-align: middle; }
      .fill { height: 100%; background: #2e7d32; } .fill.ok { background: #f9a825; } .fill.low { background: #c62828; }
      @media print { body { margin: 10mm; } }
    </style></head><body>
    <h1>Grammar Ball — ${esc(r.class.name)} (${esc(r.class.code)})</h1>
    <div class="muted">Printed ${new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}
      ${assigned.length ? ` · Homework: ${assigned.map(k => esc(levelLabel(k))).join(', ')}` : ''}</div>
    <h2>Pupils</h2>
    <table><thead><tr><th>Pupil</th><th>Accuracy</th><th>Levels done</th><th>Stars</th>${assigned.length ? '<th>Homework</th>' : ''}<th>Needs practice</th><th>Last played</th></tr></thead>
    <tbody>${r.pupils.map(p => `<tr><td>${esc(p.name)}</td><td class="${p.accuracy < 70 ? 'low' : ''}">${p.accuracy}%</td><td>${p.levelsCompleted}</td><td>${p.stars}</td>
      ${assigned.length ? `<td>${p.homeworkDone}/${p.homeworkTotal}</td>` : ''}<td>${p.topMissed.map(esc).join('<br>') || '—'}</td>
      <td>${new Date(p.lastPlayed).toLocaleDateString('en-MY')}</td></tr>`).join('')}</tbody></table>
    ${r.topics?.length ? `<h2>Topic mastery (class average)</h2><table><thead><tr><th>Level</th><th>Topic</th><th>Accuracy</th><th></th><th>Passed</th></tr></thead><tbody>
      ${r.topics.map(t => { const d = GRAMMAR_DB[t.level]; const band = t.accuracy >= 80 ? '' : t.accuracy >= 60 ? 'ok' : 'low';
        return `<tr><td>${esc(levelLabel(t.level))}</td><td>${esc(d?.topic || '')}</td><td>${t.accuracy}%</td><td><span class="bar"><span class="fill ${band}" style="display:block;width:${t.accuracy}%"></span></span></td><td>${t.passed}/${t.pupils}</td></tr>`; }).join('')}
      </tbody></table>` : ''}
    ${r.mostMissed.length ? `<h2>Most-missed questions</h2><ol>${r.mostMissed.map(m => `<li>${esc(m.question)} (${m.count}×)</li>`).join('')}</ol>` : ''}
    <script>window.onload = () => window.print();<\/script>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { showToast('⚠️ Allow pop-ups to print the report.'); return; }
  w.document.write(html);
  w.document.close();
}

function guruSelectLevel(key, tabEl) {
  guruCurrentLevel = key;
  document.querySelectorAll('.guru-tab').forEach(t => t.classList.remove('active'));
  tabEl.classList.add('active');
  clearGuruForm();
  renderGuruQuestions();
}

function renderGuruQuestions() {
  const list = document.getElementById('guru-q-list');
  const questions = getLocalGuruQuestions(guruCurrentLevel);
  if (questions.length === 0) {
    list.innerHTML = '<div id="guru-empty">No custom questions yet. Add questions below.</div>';
    return;
  }
  list.innerHTML = questions.map((q, i) => `
    <div class="guru-q-item">
      <div class="guru-q-text">${esc(q.q)} ${getDifficultyBadge(q.difficulty)}</div>
      <div class="guru-q-answers">
        <span class="guru-ans-chip correct">✓ ${esc(q.correct)}</span>
        ${q.wrong.map(w => `<span class="guru-ans-chip wrong">✗ ${esc(w)}</span>`).join('')}
      </div>
      <button class="guru-q-delete" onclick="guruDeleteQuestion(${i})">Delete</button>
    </div>
  `).join('');
}

function guruDeleteQuestion(idx) {
  const questions = getLocalGuruQuestions(guruCurrentLevel);
  questions.splice(idx, 1);
  saveGuruQuestions(guruCurrentLevel, questions);
  renderGuruQuestions();
}

function guruAddQuestion() {
  const qText   = document.getElementById('guru-q-text').value.trim();
  const correct = document.getElementById('guru-correct').value.trim();
  const wrong1  = document.getElementById('guru-wrong1').value.trim();
  const wrong2  = document.getElementById('guru-wrong2').value.trim();
  const errEl   = document.getElementById('guru-add-error');

  if (!qText || !correct || !wrong1 || !wrong2) {
    errEl.textContent = 'Please fill in all fields.'; return;
  }
  if (!qText.includes('___')) {
    errEl.textContent = 'Question must contain ___ (three underscores).'; return;
  }
  if (correct.toLowerCase() === wrong1.toLowerCase() || correct.toLowerCase() === wrong2.toLowerCase() || wrong1.toLowerCase() === wrong2.toLowerCase()) {
    errEl.textContent = 'Answers cannot be the same.'; return;
  }
  errEl.textContent = '';

  const questions = getLocalGuruQuestions(guruCurrentLevel);
  const difficulty = document.getElementById('guru-difficulty')?.value || 'medium';
  const tip = document.getElementById('guru-tip').value.trim();
  questions.push({ q: qText, correct, wrong: [wrong1, wrong2], difficulty, ...(tip ? { tip } : {}) });
  saveGuruQuestions(guruCurrentLevel, questions);
  clearGuruForm();
  renderGuruQuestions();
}

function clearGuruForm() {
  ['guru-q-text','guru-correct','guru-wrong1','guru-wrong2','guru-tip'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('guru-add-error').textContent = '';
}

function guruResetLevel() {
  if (!confirm(`Reset all questions for level ${guruCurrentLevel}?`)) return;
  saveGuruQuestions(guruCurrentLevel, []);
  renderGuruQuestions();
}

function guruResetAll() {
  if (!confirm('Reset ALL teacher questions for all levels?')) return;
  try { localStorage.removeItem(GURU_LS_KEY); } catch(e) {}
  renderGuruQuestions();
}

async function loadClassCertificates() {
  const listEl = document.getElementById('cert-list');
  listEl.innerHTML = '<div style="color:rgba(255,255,255,.5);text-align:center;padding:12px;">Loading…</div>';
  try {
    const data = await guruFetch('/api/teacher/certificates');
    if (!Array.isArray(data) || data.length === 0) {
      listEl.innerHTML = '<div style="color:rgba(255,255,255,.4);text-align:center;padding:12px;">No certificates yet.</div>';
      return;
    }
    listEl.innerHTML = '';
    data.forEach(c => {
      const stars = '★'.repeat(c.stars || 1) + '☆'.repeat(3 - (c.stars || 1));
      const date  = c.created_at ? new Date(c.created_at).toLocaleDateString('en-MY',{day:'numeric',month:'short',year:'numeric'}) : '';
      const row   = document.createElement('div');
      row.style.cssText = 'background:rgba(255,255,255,.07);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;';
      row.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div style="font-family:\'Fredoka One\',cursive;color:#FFD166;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(c.player_name)}</div>
          <div style="font-size:.78rem;color:rgba(255,255,255,.5);">Level ${esc(c.level_key)} · ${stars} · ${c.score} pts · ${date}</div>
        </div>
        <button style="flex-shrink:0;padding:7px 12px;border-radius:8px;border:1px solid rgba(255,209,102,.4);background:rgba(255,209,102,.15);color:#FFD166;cursor:pointer;font-family:\'Fredoka One\',cursive;font-size:.8rem;" onclick="viewStudentCertificate(${JSON.stringify(JSON.stringify(c))})">View</button>`;
      listEl.appendChild(row);
    });
  } catch(e) {
    listEl.innerHTML = '<div style="color:#EF476F;text-align:center;padding:12px;">Could not load certificates.</div>';
  }
}

function viewStudentCertificate(jsonStr) {
  const c = JSON.parse(jsonStr);
  const date = c.created_at
    ? new Date(c.created_at).toLocaleDateString('en-MY',{year:'numeric',month:'long',day:'numeric'})
    : new Date().toLocaleDateString('en-MY',{year:'numeric',month:'long',day:'numeric'});
  const data = {
    name:  c.player_name,
    key:   c.level_key,
    score: c.score,
    stars: c.stars || 1,
    world: (c.world || '').replace(/[\u{1F000}-\u{1FFFF}\u{2700}-\u{27BF}]/gu,'').trim(),
    year:  c.year || 1,
    date,
  };
  document.getElementById('guru-overlay').classList.add('hidden');
  showCertificate(data);
}

function closeGuruMode() {
  document.getElementById('guru-overlay').classList.add('hidden');
}

// ══════════════════════════════════════════════
//  ACHIEVEMENT BADGES (#14)
// ══════════════════════════════════════════════
const ACHIEVEMENTS = [
  { id:'first_win',   icon:'🎮', name:'First Win',       desc:'Complete your first level',          check: (s)=>s.levelsWon>=1 },
  { id:'streak3',     icon:'🔥', name:'On Fire',          desc:'Reach a 3-streak',                   check: (s)=>s.maxStreak>=3 },
  { id:'streak5',     icon:'⚡', name:'Unstoppable',      desc:'Reach a 5-streak',                   check: (s)=>s.maxStreak>=5 },
  { id:'streak10',    icon:'👑', name:'Grammar King',     desc:'Reach a 10-streak',                  check: (s)=>s.maxStreak>=10 },
  { id:'boss_first',  icon:'⚔️', name:'Boss Slayer',      desc:'Defeat the Grammar King boss',       check: (s)=>s.bossDefeated>=1 },
  { id:'boss_perfect',icon:'🏆', name:'Perfect Duel',     desc:'Defeat boss without taking damage',  check: (s)=>s.bossDefeatedNoDmg>=1 },
  { id:'perfect_lvl', icon:'🌟', name:'Flawless',         desc:'Complete a level with no mistakes',  check: (s)=>s.perfectLevels>=1 },
  { id:'daily3',      icon:'📅', name:'Daily Devotee',    desc:'Complete 3 daily challenges',        check: (s)=>s.dailyDone>=3 },
  { id:'skins_all',   icon:'🌈', name:'Collector',        desc:'Unlock all ball skins',              check: (s)=>s.skinsUnlocked>=6 },
  { id:'score10k',    icon:'💎', name:'Grammar Genius',   desc:'Score 10,000 total points',          check: (s)=>s.totalScore>=10000 },
  { id:'days3',       icon:'📆', name:'Habit Builder',    desc:'Play 3 days in a row',               check: (s)=>s.bestStreakDays>=3 },
  { id:'days7',       icon:'🗓️', name:'Week Warrior',     desc:'Play 7 days in a row',               check: (s)=>s.bestStreakDays>=7 },
  { id:'word1',       icon:'🔤', name:'Word Finder',      desc:'Collect every letter in a level',    check: (s)=>s.wordsSpelled>=1 },
  { id:'all_levels',  icon:'🗺️', name:'World Explorer',   desc:'Finish every level',                 check: ()=>LEVEL_KEYS.every(k => getLevelStars()[k]) },
];

const ACH_LS_KEY = 'gr_achievements';
const ACH_STATS_KEY = 'gr_ach_stats';

function getAchStats()  { try { return JSON.parse(localStorage.getItem(pk(ACH_STATS_KEY))||'{}'); } catch(e) { return {}; } }
function saveAchStats(s){ try { localStorage.setItem(pk(ACH_STATS_KEY), JSON.stringify(s)); } catch(e) {} }
function getEarnedAchs(){ try { return JSON.parse(localStorage.getItem(pk(ACH_LS_KEY))||'[]'); } catch(e) { return []; } }

// These stats are "best so far" values, not running totals
const ACH_MAX_STATS = new Set(['maxStreak', 'skinsUnlocked']);
function updateAchStats(delta) {
  const s = getAchStats();
  Object.entries(delta).forEach(([k,v]) => { s[k] = ACH_MAX_STATS.has(k) ? Math.max(s[k] || 0, v) : (s[k] || 0) + v; });
  saveAchStats(s);
  checkAchievements(s);
}

function checkAchievements(stats) {
  const earned = getEarnedAchs();
  ACHIEVEMENTS.forEach(a => {
    if (!earned.includes(a.id) && a.check(stats)) {
      earned.push(a.id);
      try { localStorage.setItem(pk(ACH_LS_KEY), JSON.stringify(earned)); } catch(e) {}
      showAchievementToast(a);
    }
  });
}

let achToastTimer = null;
function showAchievementToast(ach) {
  // Build toast element
  const old = document.getElementById('ach-toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'ach-toast';
  el.style.cssText = `position:fixed;top:80px;left:50%;transform:translateX(-50%) translateY(-20px);z-index:9999;
    background:rgba(15,10,40,.96);border:2px solid rgba(255,209,102,.7);border-radius:16px;
    padding:12px 20px;text-align:center;max-width:280px;opacity:0;transition:all .4s;
    box-shadow:0 0 30px rgba(255,209,102,.4);pointer-events:none;`;
  el.innerHTML = `<div style="font-size:2rem;margin-bottom:2px;">${ach.icon}</div>
    <div style="font-family:'Fredoka One',cursive;color:#FFD166;font-size:1rem;">🏅 Achievement Unlocked!</div>
    <div style="font-family:'Fredoka One',cursive;color:#fff;font-size:1.1rem;">${ach.name}</div>
    <div style="color:rgba(255,255,255,.6);font-size:.75rem;margin-top:2px;">${ach.desc}</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; });
  if (achToastTimer) clearTimeout(achToastTimer);
  achToastTimer = setTimeout(() => {
    el.style.opacity='0';
    setTimeout(() => el.remove(), 400);
  }, 3000);
}

function showAchievementsMenu() {
  const earned = getEarnedAchs();
  const el = qzOpenScreen('ach-overlay', '#FFD166', '#5b3a8a');
  const pct = Math.round((earned.length / ACHIEVEMENTS.length) * 100);
  el.innerHTML = `<div class="qz-wrap">
    <button class="qz-close" onclick="document.getElementById('ach-overlay').remove()" aria-label="Close">✕</button>
    <div class="qz-badge">🏅</div>
    <h2 class="qz-title">Badges</h2>
    <p class="qz-sub">${earned.length} of ${ACHIEVEMENTS.length} collected · ${getAchStats().totalScore || 0} total points</p>
    <div class="unlock-bar" style="max-width:none;height:10px;margin:0 0 16px;" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
    <div class="badge-grid">
      ${ACHIEVEMENTS.map((a, i) => {
        const done = earned.includes(a.id);
        return `<div class="badge-tile ${done ? 'earned' : 'locked'}" style="animation-delay:${i * 0.04}s" aria-label="${esc(a.name)}: ${esc(a.desc)}${done ? ' (earned)' : ' (locked)'}">
          <div class="badge-icon">${done ? a.icon : '🔒'}</div>
          <div class="badge-name">${esc(a.name)}</div>
          <div class="badge-desc">${esc(a.desc)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}


// ── Class Code ──────────────────────────────
function copyClassCode() {
  const code = guruClassCode;
  if (!code) { showToast('Create a class first.'); return; }
  const text = `Join my Grammar Ball class! Open ⚙️ Settings and enter code ${code}\nPlay at: ${location.origin}`;
  navigator.clipboard?.writeText(text).then(() => showToast(`📋 Copied class code ${code}`)).catch(() => showToast(`Class code: ${code}`, 6000));
}

// ── Export Results CSV (#13) ─────────────────
function exportResultsCSV() {
  let rows;
  if (guruLastReport) {
    rows = [['Pupil','Accuracy %','Levels completed','Stars','Homework done','Homework total','Needs practice','Last played']];
    guruLastReport.pupils.forEach(p => rows.push([p.name, p.accuracy, p.levelsCompleted, p.stars, p.homeworkDone, p.homeworkTotal, p.topMissed.join(' | '), p.lastPlayed.slice(0,10)]));
  } else {
    rows = [['Level','Name','Score','Stars','Date']];
    Object.keys(localStorage).filter(k => k.startsWith('gr_lb_')).forEach(k => {
      const levelKey = k.replace('gr_lb_','');
      try {
        JSON.parse(localStorage.getItem(k)||'[]').forEach(e => rows.push([levelKey, e.name||'', e.score||0, e.stars||0, e.date||'']));
      } catch(err){}
    });
  }
  const cell = v => { let s = String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g,'""')}"`; };
  const csv = rows.map(r => r.map(cell).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `grammar-ball-results-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Difficulty-aware question display in guru list ──
function getDifficultyBadge(diff) {
  return diff === 'hard' ? '<span style="color:#EF476F;font-size:.7rem;">⭐⭐⭐ Hard</span>'
       : diff === 'easy' ? '<span style="color:#06D6A0;font-size:.7rem;">⭐ Easy</span>'
       : '<span style="color:#FFD166;font-size:.7rem;">⭐⭐ Medium</span>';
}

function showWinLBPreview(entries) {
  const container = document.getElementById('win-lb-preview');
  if (!container) return;
  // Compact top-3 preview
  container.innerHTML = `
    <div style="font-family:'Fredoka One',cursive;font-size:.85rem;color:rgba(255,255,255,.5);
      text-align:center;margin-bottom:8px;letter-spacing:1px;">— LEADERBOARD —</div>`;
  const ul = document.createElement('ul');
  ul.style.cssText='list-style:none;display:flex;flex-direction:column;gap:6px;';
  renderLBList(entries.slice(0,3), ul);
  // Shrink the rows slightly
  ul.querySelectorAll('.lb-row').forEach(r=>{
    r.style.padding='7px 10px'; r.style.borderRadius='10px';
  });
  container.appendChild(ul);
}

// Enter key submits name
