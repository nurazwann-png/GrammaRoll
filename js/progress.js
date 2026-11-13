// ══════════════════════════════════════════════
//  LEADERBOARD  (localStorage)
// ══════════════════════════════════════════════
const LB_MAX = 5;

function lbKey(levelKey) { return `gr_lb_${levelKey}`; }

function getLB(levelKey) {
  try {
    return JSON.parse(localStorage.getItem(lbKey(levelKey)) || '[]');
  } catch { return []; }
}

function saveLB(levelKey, entries) {
  try { localStorage.setItem(lbKey(levelKey), JSON.stringify(entries)); } catch {}
}

function addLBEntry(levelKey, name, score, stars) {
  const entries = getLB(levelKey);
  const date = new Date().toLocaleDateString('ms-MY', {day:'2-digit',month:'short'});
  entries.push({ name, score, stars, date });
  entries.sort((a,b) => b.score - a.score);
  const trimmed = entries.slice(0, LB_MAX);
  saveLB(levelKey, trimmed);
  return trimmed;
}

function renderLBList(entries, container) {
  container.innerHTML = '';
  if (!entries.length) {
    container.innerHTML = '<div id="lb-empty">No records yet.<br>Be the first! 🏆</div>';
    return;
  }
  const MEDALS = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  entries.forEach((e,i) => {
    const li = document.createElement('li');
    li.className = `lb-row ${i===0?'top1':i===1?'top2':i===2?'top3':''}`;
    // bug5 fix: use textContent for user-supplied name to prevent XSS
    const rank = document.createElement('span'); rank.className = 'lb-rank'; rank.textContent = MEDALS[i];
    const nm   = document.createElement('span'); nm.className   = 'lb-name';  nm.textContent = e.name;
    const st   = document.createElement('span'); st.className   = 'lb-stars'; st.textContent = '⭐'.repeat(e.stars) + '☆'.repeat(3-e.stars);
    const sc   = document.createElement('span'); sc.className   = 'lb-score'; sc.textContent = e.score;
    const dt   = document.createElement('span'); dt.className   = 'lb-date';  dt.textContent = e.date;
    li.append(rank, nm, st, sc, dt);
    container.appendChild(li);
  });
}

function setLbTab(cls) {
  document.getElementById('lb-tab-device').setAttribute('aria-pressed', String(!cls));
  document.getElementById('lb-tab-class').setAttribute('aria-pressed', String(cls));
}

function showLeaderboard(levelKey) {
  const data = GRAMMAR_DB[levelKey] || GRAMMAR_DB['1-1'];
  setLbTab(false);
  document.getElementById('lb-subtitle').textContent =
    `Top ${LB_MAX} on this device — ${levelLabel(GRAMMAR_DB[levelKey] && levelKey !== 'practice' ? levelKey : '1-1')} ${data.topic}`;
  const entries = getLB(levelKey);
  renderLBList(entries, document.getElementById('lb-list'));
  document.getElementById('leaderboard-overlay').classList.remove('hidden');
}

async function showClassLeaderboard() {
  setLbTab(true);
  document.getElementById('leaderboard-overlay').classList.remove('hidden');
  const list = document.getElementById('lb-list');
  const sub = document.getElementById('lb-subtitle');
  const cls = getClassInfo();
  if (!cls?.code) {
    sub.textContent = 'Join your class in ⚙️ Settings to see the class leaderboard.';
    list.innerHTML = '';
    return;
  }
  sub.textContent = `${cls.name || cls.code} · best score per level since Monday`;
  list.innerHTML = '<div id="lb-empty">Loading…</div>';
  try {
    const res = await fetch(`/api/class/${cls.code}/leaderboard`);
    if (!res.ok) throw new Error();
    const { entries } = await res.json();
    const me = getPlayerName().toLowerCase();
    renderLBList(entries.slice(0, 10).map(e => ({ name: e.name + (e.name.toLowerCase() === me ? ' (you)' : ''), score: e.score, stars: 0, date: `${e.levels} lvl` })), list);
    list.querySelectorAll('.lb-stars').forEach(s => s.remove());
  } catch (e) {
    list.innerHTML = '<div id="lb-empty">Could not load the class leaderboard.<br>Check your internet connection.</div>';
  }
}

function closeLeaderboard() {
  document.getElementById('leaderboard-overlay').classList.add('hidden');
}

function clearLeaderboard() {
  if (!confirm('Delete all records for this level?')) return;
  try { localStorage.removeItem(lbKey(currentLevelKey)); } catch {}
  renderLBList([], document.getElementById('lb-list'));
}

// Pending win data for name input
let pendingWin = null;

function promptPlayerName(levelKey, score, stars) {
  pendingWin = { levelKey, score, stars };
  const input = document.getElementById('name-input');
  input.value = localStorage.getItem(pk('gr_player_name')) || ''; // bug8 fix: pre-fill saved name
  if (input.value.trim()) { submitName(); return; }
  document.getElementById('name-overlay').classList.remove('hidden');
  setTimeout(() => input.focus(), 100);
}

let certData = null;

function submitName() {
  if (!pendingWin) return;
  const input = document.getElementById('name-input');
  const name  = input.value.trim() || 'Murid';
  try { localStorage.setItem(pk('gr_player_name'), name); } catch(e) {} // bug8 fix: persist name for daily/time challenge
  document.getElementById('name-overlay').classList.add('hidden');
  const entries = addLBEntry(pendingWin.levelKey, name, pendingWin.score, pendingWin.stars);
  // Sync score to database
  dbPostScore(name, pendingWin.levelKey, pendingWin.score, pendingWin.stars);
  // Sync progress to database
  dbSyncProgress(name);
  // Store certificate data for later
  const db = GRAMMAR_DB[pendingWin.levelKey] || {};
  const now = new Date();
  certData = {
    name,
    key:   pendingWin.levelKey,
    score: pendingWin.score,
    stars: pendingWin.stars,
    world: (db.world || '').replace(/[\u{1F000}-\u{1FFFF}\u{2700}-\u{27BF}︀-️ -⁯]/gu,'').trim(),
    year:  db.year || 1,
    date:  now.toLocaleDateString('en-MY',{year:'numeric',month:'long',day:'numeric'}),
  };
  // Show mini leaderboard in win screen
  showWinLBPreview(entries);
  pendingWin = null;
  maybeShowReview();
}

// ── Database sync helpers ──────────────────────────────────────────────────────
function dbPostScore(playerName, levelKey, score, stars) {
  fetch('/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName, levelKey, score, stars })
  }).catch(() => {}); // silent — localStorage is still the source of truth
}

function dbSyncProgress(playerName) {
  const achievements = JSON.parse(localStorage.getItem(pk('gr_ach_stats')) || '{}');
  const totalStars   = parseInt(localStorage.getItem(pk('gr_total_stars')) || '0');
  const totalScore   = parseInt(localStorage.getItem(pk('gr_total_score')) || '0');
  const unlockedSkins = SKINS.filter(s => isSkinUnlocked(s.id)).map(s => s.id);
  fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName, totalStars, totalScore, achievements, unlockedSkins })
  }).catch(() => {});
}

function skipName() {
  document.getElementById('name-overlay').classList.add('hidden');
  pendingWin = null;
  maybeShowReview();
}

function maybeShowReview() {
  if (!game) return;
  showReview(game);
}

// ── Progress certificate: total score, stars and levels so far ─────────────────
function showProgressCertificate() {
  if (!requirePlayerName(showProgressCertificate)) return;
  const stars = getLevelStars();
  const done = LEVEL_KEYS.filter(k => stars[k] > 0);
  if (!done.length) { showToast('📜 Finish your first level to get a certificate!', 3500); return; }
  const totalScore = parseInt(localStorage.getItem(pk('gr_total_score')) || '0', 10) || 0;
  const totalStars = LEVEL_KEYS.reduce((s, k) => s + (stars[k] || 0), 0);
  const lastWorld = (GRAMMAR_DB[done[done.length - 1]]?.world || '').replace(/[\u{1F000}-\u{1FFFF}\u{2700}-\u{27BF}\u{FE0F}]/gu, '').trim();
  const name = currentProfile()?.name || localStorage.getItem(pk('gr_player_name')) || 'Player';
  certData = null;
  showCertificate({
    progress: true, name, score: totalScore, stars: totalStars, maxStars: LEVEL_KEYS.length * 3,
    levelsDone: done.length, levelsTotal: LEVEL_KEYS.length, world: lastWorld,
    year: Math.max(...done.map(k => GRAMMAR_DB[k]?.year || 1)),
    date: new Date().toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' }),
  });
}

// ── Certificate ──────────────────────────────────────────────────────────────
let shownCert = null; // the certificate on screen, for download and share
function showCertificate(overrideData) {
  const d = overrideData || certData;
  shownCert = d;
  if (!d) return;
  // Auto-submit to server so teacher can see it (fire-and-forget)
  if (!overrideData) {
    fetch('/api/certificates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: d.name, levelKey: d.key, score: d.score, stars: d.stars, world: d.world, year: d.year }),
    }).catch(() => {});
  }
  const canvas = document.getElementById('cert-canvas');
  const W = 660, H = 920;
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,    '#1a0533');
  bg.addColorStop(0.45, '#0f1f5c');
  bg.addColorStop(1,    '#0a3a2a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Centre glow
  const glow = ctx.createRadialGradient(W/2, H*0.3, 0, W/2, H*0.3, 280);
  glow.addColorStop(0, 'rgba(168,85,247,0.18)');
  glow.addColorStop(1, 'rgba(168,85,247,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Outer gold border
  ctx.strokeStyle = '#FFD166';
  ctx.lineWidth = 7;
  ctx.strokeRect(18, 18, W-36, H-36);

  // Inner faint border
  ctx.strokeStyle = 'rgba(255,209,102,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, W-60, H-60);

  // Corner diamonds
  ctx.fillStyle = '#FFD166';
  ctx.font = '22px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [[42,42],[W-42,42],[42,H-42],[W-42,H-42]].forEach(([x,y]) => ctx.fillText('◆', x, y));
  ctx.textBaseline = 'alphabetic';

  // Ball badge circle
  ctx.beginPath();
  ctx.arc(W/2, 112, 54, 0, Math.PI*2);
  const ballG = ctx.createRadialGradient(W/2-16, 94, 5, W/2, 112, 54);
  ballG.addColorStop(0, '#FF8C42');
  ballG.addColorStop(0.55, '#e05c10');
  ballG.addColorStop(1, '#7a2800');
  ctx.fillStyle = ballG;
  ctx.fill();
  ctx.strokeStyle = '#FFD166';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Ball shine
  ctx.beginPath();
  ctx.ellipse(W/2-14, 98, 18, 11, -0.4, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();

  // Ball face (text fallback for emoji)
  ctx.font = 'bold 30px Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(':)', W/2, 120);

  // "Grammar Ball!" title
  ctx.font = "bold 46px Georgia, serif";
  ctx.fillStyle = '#FF8C42';
  ctx.textAlign = 'center';
  ctx.fillText('Grammar Ball!', W/2, 208);

  // Rule under title
  ctx.strokeStyle = '#FFD166';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(80, 222); ctx.lineTo(W-80, 222); ctx.stroke();

  // "CERTIFICATE OF ACHIEVEMENT" spaced caps
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillStyle = '#FFD166';
  ctx.textAlign = 'center';
  ctx.fillText('C E R T I F I C A T E   O F   A C H I E V E M E N T', W/2, 248);

  // Faint rule
  ctx.strokeStyle = 'rgba(255,209,102,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(60, 262); ctx.lineTo(W-60, 262); ctx.stroke();

  // "This certifies that"
  ctx.font = 'italic 19px Georgia, serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.textAlign = 'center';
  ctx.fillText('This certifies that', W/2, 316);

  // Student name (auto-size)
  const nSize = d.name.length > 22 ? 36 : d.name.length > 16 ? 42 : 50;
  ctx.font = `bold ${nSize}px Georgia, serif`;
  ctx.fillStyle = '#FFD166';
  ctx.fillText(d.name, W/2, 382);

  // Underline name
  const nw = ctx.measureText(d.name).width;
  ctx.strokeStyle = 'rgba(255,209,102,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W/2 - nw/2, 391); ctx.lineTo(W/2 + nw/2, 391);
  ctx.stroke();

  // "has successfully completed"
  ctx.font = 'italic 19px Georgia, serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.textAlign = 'center';
  ctx.fillText(d.progress ? 'has made great progress in' : 'has successfully completed', W/2, 428);

  // Level line
  ctx.font = 'bold 27px Arial, sans-serif';
  ctx.fillStyle = '#06D6A0';
  const worldLabel = d.progress
    ? `${d.levelsDone} of ${d.levelsTotal} levels${d.world ? `  —  up to ${d.world}` : ''}`
    : d.world ? `Level ${d.key}  —  ${d.world}` : `Level ${d.key}`;
  ctx.fillText(worldLabel, W/2, 470, W - 100);

  // Subtitle
  ctx.font = '15px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillText(`English Grammar · CEFR Malaysia · Year ${d.year}`, W/2, 498);

  // Stars (Unicode ★ ☆ — renders everywhere)
  ctx.font = '48px Arial, sans-serif';
  ctx.fillStyle = '#FFD166';
  if (d.progress) {
    ctx.fillText(`★ ${d.stars} / ${d.maxStars}`, W/2, 564);
  } else {
    ctx.fillText('★'.repeat(d.stars) + '☆'.repeat(3 - d.stars), W/2, 564);
  }

  // Score badge
  const scoreLabel = d.progress ? `Total score: ${Number(d.score).toLocaleString()} points` : `Score: ${Number(d.score).toLocaleString()} points`;
  ctx.font = 'bold 23px Arial, sans-serif';
  ctx.fillStyle = '#FF8C42';
  ctx.fillText(scoreLabel, W/2, 608);

  // Horizontal rule
  ctx.strokeStyle = 'rgba(255,209,102,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(80, 632); ctx.lineTo(W-80, 632); ctx.stroke();

  // Footer text
  ctx.font = '14px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillText(d.date, W/2, 662);
  ctx.fillText('English Adventure · CEFR Malaysia', W/2, 682);

  // Wax-seal circle
  const cx = W/2, cy = 770;
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI*2);
  const sealG = ctx.createRadialGradient(cx-10, cy-12, 5, cx, cy, 58);
  sealG.addColorStop(0, 'rgba(255,209,102,0.3)');
  sealG.addColorStop(1, 'rgba(255,209,102,0.08)');
  ctx.fillStyle = sealG;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,209,102,0.65)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 49, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(255,209,102,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,209,102,0.85)';
  ctx.textAlign = 'center';
  ctx.fillText('GRAMMAR', cx, 761);
  ctx.fillText('BALL', cx, 777);
  ctx.font = '22px serif';
  ctx.fillText('★', cx, 800);

  // Date stamp at very bottom
  ctx.font = '13px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillText(`grammarball · ${d.date}`, W/2, 880);

  document.getElementById('cert-overlay').classList.remove('hidden');
}

function closeCertificate() {
  document.getElementById('cert-overlay').classList.add('hidden');
}

function downloadCertificate() {
  const canvas = document.getElementById('cert-canvas');
  const safeName = shownCert?.name ? shownCert.name.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30) : 'student';
  const a = document.createElement('a');
  a.download = `GrammarBall_Certificate_${safeName}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

async function shareCertificate() {
  const canvas = document.getElementById('cert-canvas');
  const safeName = shownCert?.name ? shownCert.name.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30) : 'student';
  const fileName = `GrammarBall_Certificate_${safeName}.png`;

  // Convert canvas to Blob then share
  canvas.toBlob(async (blob) => {
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: certData ? `${certData.name}'s Grammar Ball Certificate` : 'Grammar Ball Certificate',
          text: `I completed Level ${certData ? certData.key : ''} on Grammar Ball! 🎉`,
        });
      } catch (e) {
        // User cancelled share — no action needed
      }
    } else {
      // Fallback: download instead
      downloadCertificate();
    }
  }, 'image/png');
}
// ─────────────────────────────────────────────────────────────────────────────

function showReview(g) {
  const overlay = document.getElementById('review-overlay');
  const cards   = document.getElementById('review-cards');
  const perfect = document.getElementById('review-perfect');
  const subtitle= document.getElementById('review-subtitle');

  cards.innerHTML = '';

  if (!g.wrongAnswers || g.wrongAnswers.length === 0) {
    // Perfect run
    perfect.classList.remove('hidden');
    subtitle.textContent = 'You answered all questions correctly!';
  } else {
    perfect.classList.add('hidden');
    subtitle.textContent = `${g.wrongAnswers.length} question(s) to improve`;

    g.wrongAnswers.forEach(wa => {
      const q = wa.q;
      if (!q) return;
      const special = isSpecial(q);
      const fullSentence = special
        ? `<strong>${esc(wa.correctLabel)}</strong>`
        : esc(q.q).replace('___', `<strong>${esc(wa.correctLabel)}</strong>`);

      const card = document.createElement('div');
      card.className = 'review-card';
      card.innerHTML = `
        <div class="review-card-q">
          ${special ? esc(questionPrompt(q)) : esc(q.q).replace('___', '<span>___</span>')}
        </div>
        <div class="review-row review-wrong">
          <span class="review-row-icon">✗</span>
          <div>
            <div class="review-row-label">Your Answer</div>
            <div class="review-row-answer">${esc(wa.wrongLabel)}</div>
          </div>
        </div>
        <div class="review-row review-correct">
          <span class="review-row-icon">✓</span>
          <div>
            <div class="review-row-label">Correct Answer</div>
            <div class="review-row-answer">${esc(wa.correctLabel)}</div>
          </div>
        </div>
        <div class="review-sentence">✅ ${fullSentence}</div>
        ${q.tip ? `<div class="review-tip">💡 Why: ${esc(q.tip)}</div>` : ''}
      `;
      const speakBtn = document.createElement('button');
      speakBtn.className = 'speak-btn';
      speakBtn.textContent = '🔊 Listen';
      speakBtn.setAttribute('aria-label', 'Read the correct sentence aloud');
      speakBtn.onclick = () => speak(special ? wa.correctLabel : q.q.replace('___', wa.correctLabel));
      card.appendChild(speakBtn);
      cards.appendChild(card);
    });
    const practiseBtn = document.createElement('button');
    practiseBtn.className = 'btn btn-secondary';
    practiseBtn.style.cssText = 'width:100%;max-width:500px;margin:0 auto 10px;display:block;';
    practiseBtn.textContent = '🎯 Practise these again';
    practiseBtn.onclick = () => { closeReview(); startPractice(g.wrongAnswers.map(w => w.q)); };
    cards.appendChild(practiseBtn);
  }

  overlay.classList.remove('hidden');
}

// ── Practice round built from missed questions ──
function getMostMissedQuestions(limit = 8) {
  const sr = srGetData();
  const found = [];
  Object.entries(sr).sort((a, b) => b[1] - a[1]).forEach(([key]) => {
    const sep = key.indexOf(':');
    const lvl = key.slice(0, sep), text = key.slice(sep + 1);
    const pool = [...(GRAMMAR_DB[lvl]?.questions || []), ...getGuruQuestions(lvl)];
    const q = pool.find(x => questionText(x) === text);
    if (q && !found.includes(q)) found.push(q);
  });
  return found.slice(0, limit);
}

function startPractice(questions) {
  const qs = (questions || getMostMissedQuestions()).filter(Boolean);
  if (!qs.length) { showToast('🌟 No mistakes to practise yet — great work!'); return; }
  GRAMMAR_DB.practice = { world:'Practice 🎯', year:1, difficulty:'easy', topic:'Your mistakes', icon:'🎯', word:'', questions: qs };
  closeModeSelect();
  startLevelKey('practice');
}

function closeReview() {
  document.getElementById('review-overlay').classList.add('hidden');
}

// ══════════════════════════════════════════════
//  BALL SKINS
// ══════════════════════════════════════════════
const SKINS = [
  { id:'default',  name:'Classic',      emoji:'🟠', desc:'Default ball',           unlock:0  },
  { id:'fire',     name:'Fire Ball',    emoji:'🔥', desc:'Unlock: 5 stars',        unlock:5  },
  { id:'ice',      name:'Ice Ball',     emoji:'❄️', desc:'Unlock: 10 stars',       unlock:10 },
  { id:'galaxy',   name:'Galaxy Ball',  emoji:'🌌', desc:'Unlock: 20 stars',       unlock:20 },
  { id:'gold',     name:'Gold Ball',    emoji:'✨', desc:'Unlock: 35 stars',       unlock:35 },
  { id:'rainbow',  name:'Rainbow Ball', emoji:'🌈', desc:'Unlock: 50 stars',       unlock:50 },
];

const SKIN_COLORS = {
  default: ['#FFA040','#FF6B00','#C04000'],
  fire:    ['#FF6030','#FF2000','#800000'],
  ice:     ['#A0E8FF','#40B0FF','#0060C0'],
  galaxy:  ['#6030C0','#301870','#100030'],
  gold:    ['#FFE040','#FFB000','#806000'],
  rainbow: null, // special: drawn with hue rotation
};

function getActiveSkin() { try { return localStorage.getItem(pk('gr_active_skin')) || 'default'; } catch(e) { return 'default'; } }
function setActiveSkin(id) { try { localStorage.setItem(pk('gr_active_skin'), id); } catch(e) {} updateBallThumb(); scheduleProgressPush(); }
function getTotalStars() { try { return parseInt(localStorage.getItem(pk('gr_total_stars')) || '0'); } catch(e) { return 0; } }
function isSkinUnlocked(id) {
  const skin = SKINS.find(s => s.id === id);
  return skin && getTotalStars() >= skin.unlock;
}

function checkSkinUnlocks(prev, curr) {
  SKINS.forEach(s => {
    if (s.unlock > 0 && prev < s.unlock && curr >= s.unlock) {
      setTimeout(() => {
        spawnScreenConfetti(80);
        showToast(`🎉 New skin unlocked: ${s.emoji} ${s.name}! Equip it in 🎨 Skins.`, 5000);
      }, 1500);
    }
  });
}

function renderUnlockProgress(total) {
  const el = document.getElementById('unlock-progress');
  if (!el) return;
  const next = SKINS.find(s => s.unlock > total);
  if (!next) { el.textContent = '🌈 You have unlocked every ball skin!'; return; }
  const prev = [...SKINS].reverse().find(s => s.unlock <= total)?.unlock || 0;
  const pct = Math.round(((total - prev) / (next.unlock - prev)) * 100);
  el.innerHTML = `⭐ ${next.unlock - total} more star${next.unlock - total > 1 ? 's' : ''} to unlock ${next.emoji} ${esc(next.name)}
    <div class="unlock-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>`;
}

function skinBallStyle(id) {
  if (id === 'rainbow') return 'background:conic-gradient(#FF5E5E,#FFD166,#06D6A0,#4A90D9,#8B5CF6,#FF5E5E);';
  const [a, b, c] = SKIN_COLORS[id];
  return `background:radial-gradient(circle at 35% 30%, ${a}, ${b} 55%, ${c});`;
}

function showSkinsMenu() {
  const total = getTotalStars();
  const active = getActiveSkin();
  const next = SKINS.find(s => !isSkinUnlocked(s.id));
  const el = qzOpenScreen('skins-overlay', '#FF8C42', '#6b2f4a');
  el.innerHTML = `<div class="qz-wrap">
    <button class="qz-close" onclick="closeSkinsMenu()" aria-label="Close">✕</button>
    <div class="qz-badge" style="background:linear-gradient(145deg,#FF8C42,#EF476F);">🎨</div>
    <h2 class="qz-title">Ball Skins</h2>
    <p class="qz-sub">⭐ ${total} stars${next ? ` · ${next.unlock - total} more for ${next.name}` : ' · every skin unlocked!'}</p>
    <div class="skin-grid">
      ${SKINS.map(s => {
        const unlocked = isSkinUnlocked(s.id);
        const isActive = active === s.id;
        const pct = Math.min(100, Math.round((total / Math.max(1, s.unlock)) * 100));
        return `<button class="skin-card ${isActive ? 'active' : ''} ${unlocked ? '' : 'locked'}" ${unlocked ? `onclick="pickSkin('${s.id}')"` : 'disabled'}
            aria-label="${esc(s.name)}${isActive ? ', equipped' : unlocked ? ', tap to equip' : `, needs ${s.unlock} stars`}">
          <div class="skin-ball" style="${skinBallStyle(s.id)}">${unlocked ? '' : '🔒'}</div>
          <div class="skin-name">${esc(s.name)}</div>
          ${isActive ? '<div class="skin-state on">✓ Equipped</div>'
            : unlocked ? '<div class="skin-state">Tap to equip</div>'
            : `<div class="skin-state">⭐ ${s.unlock}</div><div class="unlock-bar" style="height:5px;margin-top:4px;"><div style="width:${pct}%"></div></div>`}
        </button>`;
      }).join('')}
    </div>
  </div>`;
}


function pickSkin(id) {
  setActiveSkin(id);
  closeSkinsMenu();
  showSkinsMenu(); // refresh
}

function closeSkinsMenu() {
  const el = document.getElementById('skins-overlay');
  if (el) el.remove();
}

// ══════════════════════════════════════════════
//  DAILY CHALLENGE
// ══════════════════════════════════════════════
function getDailyQuestions() {
  // Collect all questions, seed shuffle by current date
  const all = [];
  LEVEL_KEYS.forEach(k => {
    GRAMMAR_DB[k].questions.filter(isMcqQuestion).forEach(q => all.push({...q, _lvlKey: k}));
  });
  // Date-seeded shuffle using mulberry32 PRNG
  const today = new Date();
  const seed = today.getFullYear()*10000 + (today.getMonth()+1)*100 + today.getDate();
  let s = seed;
  const rand = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let i = all.length-1; i > 0; i--) {
    const j = Math.floor(rand() * (i+1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, 10); // 10 questions per day
}

function getDailyDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDailyProgress() {
  try { return JSON.parse(localStorage.getItem(pk('gr_daily'))||'{}'); } catch(e) { return {}; }
}

// ── Shared quiz-screen helpers (Daily Challenge, Speed Run) ──
let activeQuizPick = null; // lets keys 1/2/3 answer on quiz screens

function qzOpenScreen(id, accent, glow) {
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.className = 'qz-screen';
  el.id = id;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.style.setProperty('--qz-accent', accent);
  el.style.setProperty('--qz-glow', glow);
  document.body.appendChild(el);
  return el;
}

function qzStat(id, value, label, color) {
  return `<div class="qz-stat"><div class="qz-stat-val" id="${id}" style="color:${color}">${value}</div><div class="qz-stat-label">${label}</div></div>`;
}

function qzBump(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 200);
}

function qzQuestionHTML(q) {
  const topic = GRAMMAR_DB[q._lvlKey]?.topic;
  return `${topic ? `<span class="qz-topic">${esc(topic)}</span>` : ''}${esc(q.q).replace('___', '<span class="qz-blank">?</span>')}`;
}

function qzSpeakButton(card, q) {
  const b = document.createElement('button');
  b.className = 'speak-btn';
  b.textContent = '🔊';
  b.setAttribute('aria-label', 'Read the question aloud');
  b.onclick = () => speakQuestion(q);
  card.appendChild(b);
}

function qzRenderOptions(container, q, onPick) {
  const options = [{ text: q.correct, correct: true }, ...q.wrong.map(w => ({ text: w, correct: false }))];
  for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
  container.innerHTML = '';
  let done = false;
  const buttons = options.map((o, i) => {
    const b = document.createElement('button');
    b.className = 'qz-opt';
    b.innerHTML = `<span class="qz-key"><span>${i + 1}</span></span>${esc(o.text)}`;
    b.setAttribute('aria-label', `Answer ${i + 1}: ${o.text}`);
    b.onclick = () => pick(i);
    container.appendChild(b);
    return b;
  });
  const pick = i => {
    if (done) return;
    done = true;
    activeQuizPick = null;
    buttons.forEach((b, j) => {
      b.disabled = true;
      if (options[j].correct) b.classList.add('correct');
      else if (j === i) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    onPick(options[i].correct);
  };
  activeQuizPick = pick;
}

function qzConfetti(count = 70) {
  if (prefersReducedMotion()) return;
  const colours = ['#FFD166', '#06D6A0', '#EF476F', '#4A90D9', '#8B5CF6', '#FF8C42'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = 'qz-confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colours[i % colours.length];
    c.style.animationDuration = `${2 + Math.random() * 2}s`;
    c.style.animationDelay = `${Math.random() * 0.6}s`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5000);
  }
}

function qzStars(n) {
  return Array.from({ length: 3 }, (_, i) => `<span class="${i < n ? '' : 'off'}" style="animation-delay:${0.2 + i * 0.18}s">⭐</span>`).join('');
}

// ══════════════════════════════════════════════
//  DAILY CHALLENGE
// ══════════════════════════════════════════════
let dcQuestions = [], dcQIdx = 0, dcScore = 0, dcCorrect = 0, dcStreak = 0, dcBestStreak = 0;
let dcResults = [], dcWrong = [], dcReplay = false;

function showDailyChallenge() {
  const el = qzOpenScreen('daily-overlay', '#FFD166', '#4a2f8f');
  const done = getDailyProgress()[getDailyDateStr()];
  const dateLabel = new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' });
  el.innerHTML = `<div class="qz-wrap">
    <button class="qz-close" onclick="closeDailyChallenge()" aria-label="Close">✕</button>
    <div class="qz-badge">📅</div>
    <h2 class="qz-title">Daily Challenge</h2>
    <p class="qz-sub">${dateLabel}</p>
    <div id="dc-body"></div>
  </div>`;
  const body = el.querySelector('#dc-body');
  if (done) {
    body.innerHTML = `
      <div class="qz-intro" style="text-align:center;">
        <div style="font-family:'Fredoka One',cursive;font-size:1.3rem;color:#5EF0C8;">✅ Done for today!</div>
        <div class="qz-stats" style="margin:12px 0 0;">
          ${qzStat('dc-done-score', done.score, 'Score', '#FFD166')}
          ${qzStat('dc-done-acc', done.accuracy + '%', 'Accuracy', '#5EF0C8')}
          ${qzStat('dc-done-streak', getPlayStreak().count, 'Day streak', '#FF9DB5')}
        </div>
        <p style="color:rgba(255,255,255,.7);font-weight:700;margin:12px 0 0;">Come back tomorrow for 10 new questions!</p>
      </div>
      <button class="btn btn-primary" style="width:100%;" onclick="startDailyChallenge(true)">🔁 Play again for fun</button>`;
  } else {
    body.innerHTML = `
      <ul class="qz-intro">
        <li>📝 10 questions from every world</li>
        <li>🔥 Get answers in a row for bonus points</li>
        <li>🗓️ A brand-new set every day</li>
      </ul>
      <button class="btn btn-primary" style="width:100%;" onclick="startDailyChallenge()">🚀 Start today's challenge</button>`;
  }
}

function startDailyChallenge(replay = false) {
  dcReplay = replay;
  dcQuestions = getDailyQuestions();
  dcQIdx = 0; dcScore = 0; dcCorrect = 0; dcStreak = 0; dcBestStreak = 0;
  dcResults = []; dcWrong = [];
  document.getElementById('dc-body').innerHTML = `
    <div class="qz-stats">
      ${qzStat('dc-score', 0, 'Score', '#FFD166')}
      ${qzStat('dc-streak', 0, 'Streak', '#FF9DB5')}
      ${qzStat('dc-count', `1/${dcQuestions.length}`, 'Question', '#93C5FD')}
    </div>
    <div class="qz-progress" id="dc-progress"></div>
    <div class="qz-card" id="dc-question"></div>
    <div class="qz-options" id="dc-options"></div>
    <div class="qz-feedback" id="dc-feedback"></div>`;
  dcShowQuestion();
}

function dcShowQuestion() {
  if (dcQIdx >= dcQuestions.length) { dcFinish(); return; }
  const q = dcQuestions[dcQIdx];
  document.getElementById('dc-progress').innerHTML = dcQuestions.map((_, i) =>
    `<div class="qz-seg ${dcResults[i] === true ? 'right' : dcResults[i] === false ? 'wrong' : i === dcQIdx ? 'current' : ''}"></div>`).join('');
  qzBump('dc-count', `${dcQIdx + 1}/${dcQuestions.length}`);
  const card = document.getElementById('dc-question');
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  card.innerHTML = qzQuestionHTML(q);
  qzSpeakButton(card, q);
  if (getSettings().autoRead) speakQuestion(q);
  document.getElementById('dc-feedback').innerHTML = '';
  qzRenderOptions(document.getElementById('dc-options'), q, dcAnswer);
}

function dcAnswer(correct) {
  const q = dcQuestions[dcQIdx];
  dcResults[dcQIdx] = correct;
  dcQIdx++;
  const fb = document.getElementById('dc-feedback');
  if (correct) {
    dcCorrect++; dcStreak++; dcBestStreak = Math.max(dcBestStreak, dcStreak);
    const mult = dcStreak >= 10 ? 5 : dcStreak >= 5 ? 3 : dcStreak >= 3 ? 2 : 1;
    dcScore += 100 * mult;
    Audio.correct(dcStreak);
    fb.innerHTML = `<div class="qz-fb good">✅ Correct!${mult > 1 ? ` 🔥 ${mult}× streak bonus!` : ''}</div>`;
    setTimeout(dcShowQuestion, 900);
  } else {
    dcStreak = 0;
    Audio.wrong();
    srRecordWrong(q._lvlKey, q.q);
    dcWrong.push(q);
    fb.innerHTML = `<div class="qz-fb bad">❌ The answer is "${esc(q.correct)}".${q.tip ? `<span class="qz-tip">💡 ${esc(q.tip)}</span>` : ''}</div>`;
    const next = document.createElement('button');
    next.className = 'btn btn-secondary';
    next.style.cssText = 'width:100%;margin-top:10px;';
    next.textContent = dcQIdx < dcQuestions.length ? 'Next ▶' : 'See my results ▶';
    next.onclick = dcShowQuestion;
    fb.appendChild(next);
    activeQuizPick = () => dcShowQuestion();
    next.focus();
  }
  qzBump('dc-score', dcScore);
  qzBump('dc-streak', dcStreak);
}

function dcFinish() {
  activeQuizPick = null;
  const accuracy = Math.round((dcCorrect / dcQuestions.length) * 100);
  const stars = accuracy >= 90 ? 3 : accuracy >= 60 ? 2 : 1;
  if (!dcReplay) {
    const prog = getDailyProgress();
    prog[getDailyDateStr()] = { score: dcScore, accuracy };
    try { localStorage.setItem(pk('gr_daily'), JSON.stringify(prog)); } catch(e) {}
    addLBEntry('daily', getPlayerName() || 'Player', dcScore, stars);
    updateAchStats({ dailyDone: 1, maxStreak: dcBestStreak, totalScore: dcScore });
  }
  markPlayedToday();
  const title = accuracy >= 90 ? 'Brilliant!' : accuracy >= 60 ? 'Great job!' : 'Good try!';
  document.getElementById('dc-body').innerHTML = `
    <div class="qz-result">
      <div class="qz-result-emoji">${accuracy >= 90 ? '🏆' : accuracy >= 60 ? '🌟' : '💪'}</div>
      <h3 class="qz-title" style="font-size:1.9rem;">${title}</h3>
      <div class="qz-result-stars">${qzStars(stars)}</div>
      <div class="qz-stats">
        ${qzStat('dc-r-score', dcScore, 'Score', '#FFD166')}
        ${qzStat('dc-r-acc', accuracy + '%', 'Accuracy', '#5EF0C8')}
        ${qzStat('dc-r-streak', dcBestStreak, 'Best streak', '#FF9DB5')}
      </div>
      ${dcReplay ? '<p class="qz-sub">Replay — today\'s saved score stays the same.</p>' : '<p class="qz-sub">Come back tomorrow for a new set!</p>'}
      <div class="qz-btn-row">
        ${dcWrong.length ? '<button class="btn btn-primary" id="dc-practise">🎯 Practise mistakes</button>' : ''}
        <button class="btn btn-secondary" onclick="closeDailyChallenge()">🏠 Menu</button>
      </div>
    </div>`;
  document.getElementById('dc-practise')?.addEventListener('click', () => { const qs = dcWrong; closeDailyChallenge(); startPractice(qs); });
  if (accuracy >= 60) { qzConfetti(); Audio.star(); }
}

function closeDailyChallenge() {
  activeQuizPick = null;
  document.getElementById('daily-overlay')?.remove();
}

// ══════════════════════════════════════════════
//  TIME CHALLENGE MODE
// ══════════════════════════════════════════════
const TC_SECONDS = 60;
const TC_RING = 2 * Math.PI * 52;
let tcTimer = null, tcTimeLeft = TC_SECONDS, tcScore = 0, tcStreak = 0, tcBestStreak = 0;
let tcQuestions = [], tcQIdx = 0, tcActive = false, tcAnswered = 0, tcRight = 0;

function tcBest() { return getLB('time-challenge')[0]?.score || 0; }

function showTimeChallenge() {
  const el = qzOpenScreen('tc-overlay', '#06D6A0', '#0f4f6b');
  el.innerHTML = `<div class="qz-wrap">
    <button class="qz-close" onclick="closeTimeChallenge()" aria-label="Close">✕</button>
    <div class="qz-badge" style="background:linear-gradient(145deg,#06D6A0,#0891B2);">⏱️</div>
    <h2 class="qz-title">Speed Run</h2>
    <p class="qz-sub">How many can you answer in ${TC_SECONDS} seconds?</p>
    <div id="tc-body">
      <ul class="qz-intro">
        <li>⚡ Questions from every world, as fast as you can</li>
        <li>🔥 Answers in a row multiply your points</li>
        <li>🏆 Your best: <strong style="color:#5EF0C8;">${tcBest()}</strong> points</li>
      </ul>
      <button class="btn btn-primary" style="width:100%;" onclick="startTimeChallenge()">🚀 Start!</button>
    </div>
  </div>`;
}

function startTimeChallenge() {
  tcQuestions = [];
  LEVEL_KEYS.forEach(k => GRAMMAR_DB[k].questions.filter(isMcqQuestion).forEach(q => tcQuestions.push({ ...q, _lvlKey: k })));
  for (let i = tcQuestions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tcQuestions[i], tcQuestions[j]] = [tcQuestions[j], tcQuestions[i]]; }
  tcQIdx = 0; tcScore = 0; tcStreak = 0; tcBestStreak = 0; tcTimeLeft = TC_SECONDS; tcActive = true; tcAnswered = 0; tcRight = 0;
  document.getElementById('tc-body').innerHTML = `
    <div class="qz-timer" id="tc-timer-wrap">
      <svg width="120" height="120" viewBox="0 0 120 120"><circle class="qz-timer-track" cx="60" cy="60" r="52"/>
        <circle class="qz-timer-arc" id="tc-arc" cx="60" cy="60" r="52" stroke-dasharray="${TC_RING}" stroke-dashoffset="0"/></svg>
      <div class="qz-timer-num"><span id="tc-timer">${TC_SECONDS}</span><small>SECONDS</small></div>
    </div>
    <div class="qz-stats">
      ${qzStat('tc-score', 0, 'Score', '#FFD166')}
      ${qzStat('tc-streak', 0, 'Streak', '#FF9DB5')}
      ${qzStat('tc-right', 0, 'Correct', '#5EF0C8')}
    </div>
    <div class="qz-card" id="tc-question"></div>
    <div class="qz-options" id="tc-options"></div>
    <div class="qz-feedback" id="tc-feedback"></div>`;
  clearInterval(tcTimer);
  tcTimer = setInterval(() => {
    tcTimeLeft--;
    const num = document.getElementById('tc-timer');
    if (!num) { clearInterval(tcTimer); return; }
    num.textContent = tcTimeLeft;
    document.getElementById('tc-arc').style.strokeDashoffset = TC_RING * (1 - tcTimeLeft / TC_SECONDS);
    document.getElementById('tc-timer-wrap').classList.toggle('urgent', tcTimeLeft <= 10);
    if (tcTimeLeft <= 0) endTimeChallenge();
  }, 1000);
  tcShowQuestion();
}

function tcShowQuestion() {
  if (!tcActive) return;
  if (tcQIdx >= tcQuestions.length) tcQIdx = 0;
  const q = tcQuestions[tcQIdx];
  const card = document.getElementById('tc-question');
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  card.innerHTML = qzQuestionHTML(q);
  document.getElementById('tc-feedback').innerHTML = '';
  qzRenderOptions(document.getElementById('tc-options'), q, tcAnswer);
}

function tcAnswer(correct) {
  if (!tcActive) return;
  const q = tcQuestions[tcQIdx];
  tcQIdx++;
  tcAnswered++;
  const fb = document.getElementById('tc-feedback');
  if (correct) {
    tcRight++;
    tcStreak++;
    tcBestStreak = Math.max(tcBestStreak, tcStreak);
    const mult = tcStreak >= 10 ? 5 : tcStreak >= 5 ? 3 : tcStreak >= 3 ? 2 : 1;
    tcScore += 100 * mult;
    Audio.correct(tcStreak);
    const plus = document.createElement('div');
    plus.className = 'qz-plus';
    plus.textContent = `+${100 * mult}`;
    document.getElementById('tc-timer-wrap').appendChild(plus);
    setTimeout(() => plus.remove(), 900);
    fb.innerHTML = mult > 1 ? `<div class="qz-fb good">🔥 ${mult}× streak!</div>` : '';
  } else {
    tcStreak = 0;
    Audio.wrong();
    srRecordWrong(q._lvlKey, q.q);
    fb.innerHTML = `<div class="qz-fb bad">❌ The answer is "${esc(q.correct)}".</div>`;
  }
  qzBump('tc-score', tcScore);
  qzBump('tc-streak', tcStreak);
  qzBump('tc-right', tcRight);
  setTimeout(() => { if (tcActive) tcShowQuestion(); }, correct ? 350 : 1100);
}

function endTimeChallenge() {
  tcActive = false;
  activeQuizPick = null;
  clearInterval(tcTimer);
  const previousBest = tcBest();
  addLBEntry('time-challenge', getPlayerName() || 'Player', tcScore, tcBestStreak >= 5 ? 3 : tcBestStreak >= 3 ? 2 : 1);
  updateAchStats({ maxStreak: tcBestStreak, totalScore: tcScore });
  markPlayedToday();
  const newBest = tcScore > previousBest && tcScore > 0;
  const accuracy = tcAnswered ? Math.round((tcRight / tcAnswered) * 100) : 0;
  document.getElementById('tc-body').innerHTML = `
    <div class="qz-result">
      <div class="qz-result-emoji">${newBest ? '🏆' : '🏁'}</div>
      <h3 class="qz-title" style="font-size:1.9rem;">${newBest ? 'New best score!' : "Time's up!"}</h3>
      <p class="qz-sub">${newBest ? `You beat your old best of ${previousBest}!` : `Your best is ${Math.max(previousBest, tcScore)} points`}</p>
      <div class="qz-stats">
        ${qzStat('tc-r-score', tcScore, 'Score', '#FFD166')}
        ${qzStat('tc-r-right', `${tcRight}/${tcAnswered}`, `Correct (${accuracy}%)`, '#5EF0C8')}
        ${qzStat('tc-r-streak', tcBestStreak, 'Best streak', '#FF9DB5')}
      </div>
      <div class="qz-btn-row">
        <button class="btn btn-primary" onclick="startTimeChallenge()">🔄 Play again</button>
        <button class="btn btn-secondary" onclick="closeTimeChallenge()">🏠 Menu</button>
      </div>
    </div>`;
  if (newBest || accuracy >= 70) { qzConfetti(); Audio.star(); }
}

function closeTimeChallenge() {
  tcActive = false;
  activeQuizPick = null;
  clearInterval(tcTimer);
  document.getElementById('tc-overlay')?.remove();
}

