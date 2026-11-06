// ══════════════════════════════════════════════
//  PUBLIC API (called from HTML buttons)
// ══════════════════════════════════════════════
function startLevel(world, level) {
  startLevelKey(`${world}-${level}`);
}

function startLevelKey(key) {
  if (!GRAMMAR_DB[key]) { showToast('That level is not available yet!'); return; }
  currentLevelKey = key;

  closeLevelPicker();
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('win-overlay').classList.add('hidden');
  document.getElementById('pause-btn').style.display='flex';
  document.getElementById('selfie-indicator').style.display='flex';

  game = createGame(key);
  updateQuestionUI(game);
  updateHUD(game);
  updateWordHUD(game);
  updatePowerUpHUD(game);
  updateComboHUD(0);
  playWorldMusic(key);
  updateRotateTip();
}

function restartLevel() {
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('win-overlay').classList.add('hidden');
  closeCertificate();
  document.getElementById('mcq-overlay').classList.add('hidden');
  stopMCQTimer(); // clear any ghost timer from previous game
  coopMyAnswered = false;
  coopPartnerAnswered = false;
  document.getElementById('coop-wait-banner').classList.add('hidden');
  // Small delay so overlay fade-out doesn't fight the new game state
  setTimeout(() => {
    confettiList = [];
    game = createGame(currentLevelKey);
    updateQuestionUI(game);
    updateHUD(game);
    updateWordHUD(game);
    updatePowerUpHUD(game);
    updateComboHUD(0);
  }, 50);
}

function nextLevel() {
  document.getElementById('win-overlay').classList.add('hidden');
  const idx = LEVEL_KEYS.indexOf(currentLevelKey);
  const nk = idx >= 0 ? LEVEL_KEYS[idx + 1] : null;
  if (nk) {
    startLevelKey(nk);
  } else {
    showMenu();
    if (idx >= 0) showToast('🏆 Congratulations! You have completed every level!', 5000);
  }
}

// ── Level progress & unlocking ──
const PROGRESS_KEY = 'gr_level_stars';
function getLevelStars() { try { return JSON.parse(localStorage.getItem(pk(PROGRESS_KEY)) || '{}'); } catch(e) { return {}; } }
function recordLevelStars(key, stars) {
  if (!LEVEL_KEYS.includes(key)) return;
  const all = getLevelStars();
  all[key] = Math.max(all[key] || 0, stars);
  try { localStorage.setItem(pk(PROGRESS_KEY), JSON.stringify(all)); } catch(e) {}
}
function isLevelUnlocked(key) {
  const i = LEVEL_KEYS.indexOf(key);
  if (i <= 0 || getSettings().unlockAll) return true;
  if (getAssignedLevels().includes(key)) return true;
  return !!getLevelStars()[LEVEL_KEYS[i - 1]];
}
function levelLabel(key) {
  const [w, l] = key.split('-');
  return GRAMMAR_DB[key].difficulty === 'boss' ? `W${w} Boss` : `L${w}-${l}`;
}

// ── Main menu: world map, continue button, top bar ──
let menuWorld = null; // world number currently shown on the map
const worldNumbers = () => [...new Set(LEVEL_KEYS.map(k => k.split('-')[0]))];
const worldLevels = w => LEVEL_KEYS.filter(k => k.startsWith(`${w}-`));
const worldName = w => GRAMMAR_DB[`${w}-1`].world.replace(/\s*Boss\s*/i, ' ').trim();

// Homework first, then the next unlocked level without stars
function nextLevelToPlay() {
  const stars = getLevelStars();
  return getAssignedLevels().find(k => !stars[k] && isLevelUnlocked(k))
    || LEVEL_KEYS.find(k => isLevelUnlocked(k) && !stars[k])
    || LEVEL_KEYS[LEVEL_KEYS.length - 1];
}

function renderMenuWorlds() {
  const next = nextLevelToPlay();
  if (!menuWorld || !worldNumbers().includes(menuWorld)) menuWorld = next.split('-')[0];
  renderWorldCard();
  renderMenuProgress();
  const d = GRAMMAR_DB[next];
  const started = Object.keys(getLevelStars()).length > 0;
  document.getElementById('menu-continue').innerHTML =
    `<span class="cont-main">▶ ${started ? 'Continue' : 'Start'}</span><span class="cont-sub">${esc(levelLabel(next))} · ${esc(d.topic)}</span>`;
  startMenuBackground();
}

function renderWorldCard() {
  const w = menuWorld;
  const keys = worldLevels(w);
  const stars = getLevelStars();
  const assigned = getAssignedLevels();
  const open = isLevelUnlocked(keys[0]);
  const earned = keys.reduce((s, k) => s + (stars[k] || 0), 0);
  const card = document.getElementById('wm-card');
  card.className = open ? '' : 'locked';
  card.setAttribute('aria-label', `World ${w}: ${worldName(w)}. ${earned} of ${keys.length * 3} stars${open ? '' : '. Locked'}`);
  const prevBoss = LEVEL_KEYS[LEVEL_KEYS.indexOf(keys[0]) - 1];
  card.innerHTML = `
    <canvas class="wm-scene" aria-hidden="true"></canvas>
    <div class="wm-head"><span class="wm-title">${esc(worldName(w))}</span><span class="wm-progress">⭐ ${earned}/${keys.length * 3}</span></div>
    <div class="wm-levels"></div>
    ${open ? '' : `<div class="wm-lock">🔒 Beat ${esc(levelLabel(prevBoss))} to open this world</div>`}`;
  const list = card.querySelector('.wm-levels');
  keys.forEach(key => {
    const d = GRAMMAR_DB[key];
    const unlocked = isLevelUnlocked(key);
    const s = stars[key] || 0;
    const b = document.createElement('button');
    b.className = 'wm-level' + (unlocked ? '' : ' locked') + (assigned.includes(key) ? ' assigned' : '') + (d.difficulty === 'boss' ? ' boss' : '');
    b.innerHTML = `<span class="wl-icon">${unlocked ? d.icon : '🔒'}</span>
      <span class="wl-text"><span class="wl-name">${esc(levelLabel(key))}${assigned.includes(key) ? ' 📋' : ''}</span><span class="wl-topic">${esc(d.topic)}</span></span>
      <span class="wl-stars">${[0, 1, 2].map(i => `<i class="${i < s ? 'on' : ''}">★</i>`).join('')}</span>`;
    b.setAttribute('aria-label', `${levelLabel(key)}: ${d.topic}. ${unlocked ? `${s} of 3 stars` : 'Locked'}`);
    b.onclick = () => unlocked ? startLevelKey(key) : showToast('🔒 Finish the previous level to unlock this one!');
    list.appendChild(b);
  });
  paintScene(card.querySelector('.wm-scene'), WORLD_THEMES[w], 0, 0.55);

  const worlds = worldNumbers();
  const i = worlds.indexOf(w);
  document.getElementById('wm-prev').disabled = i <= 0;
  document.getElementById('wm-next').disabled = i >= worlds.length - 1;
  document.getElementById('wm-dots').innerHTML = worlds.map(x =>
    `<button role="tab" aria-selected="${x === w}" aria-label="World ${x}: ${esc(worldName(x))}" class="wm-dot ${x === w ? 'on' : ''}" onclick="showWorld('${x}')"></button>`).join('');
}

function showWorld(w) { menuWorld = w; renderWorldCard(); }
function moveWorld(step) {
  const worlds = worldNumbers();
  const i = Math.min(worlds.length - 1, Math.max(0, worlds.indexOf(menuWorld) + step));
  if (worlds[i] !== menuWorld) showWorld(worlds[i]);
}
// Swipe left/right on the world map
(() => {
  const el = document.getElementById('world-map');
  let startX = null;
  el.addEventListener('pointerdown', e => { startX = e.clientX; });
  el.addEventListener('pointerup', e => {
    if (startX !== null && Math.abs(e.clientX - startX) > 45) moveWorld(e.clientX < startX ? 1 : -1);
    startX = null;
  });
})();

function continuePlaying() {
  const key = nextLevelToPlay();
  const seen = (() => { try { return localStorage.getItem(CS_INTRO_KEY); } catch (e) { return '1'; } })();
  if (!seen) {
    try { localStorage.setItem(CS_INTRO_KEY, '1'); } catch (e) {}
    showIntroCutscene(() => startLevelKey(key));
    return;
  }
  startLevelKey(key);
}

// Draw a world's scenery into any canvas (menu background, world card)
function paintScene(canvas, theme, camX, scale = 1) {
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  if (!theme) { ctx.fillStyle = '#1e1b4b'; ctx.fillRect(0, 0, w, h); return; }
  const saveW = CW, saveH = CH;
  CW = w / scale; CH = h / scale;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  try { drawThemedBackground(ctx, theme, camX, WORLD_GROUND_Y - CH * 0.86); }
  finally { ctx.restore(); CW = saveW; CH = saveH; }
}

// Live, slowly scrolling scenery behind the menu
let menuBgRaf = null, menuBgX = 0;
function startMenuBackground() {
  if (menuBgRaf) return;
  const canvas = document.getElementById('menu-bg');
  const frame = () => {
    const menu = document.getElementById('menu-screen');
    if (game || menu.classList.contains('hidden')) { menuBgRaf = null; return; }
    if (!prefersReducedMotion()) menuBgX += 0.5;
    paintScene(canvas, WORLD_THEMES[menuWorld], menuBgX);
    menuBgRaf = requestAnimationFrame(frame);
  };
  menuBgRaf = requestAnimationFrame(frame);
}

function renderMenuProgress() {
  const prof = currentProfile();
  document.getElementById('menu-player').innerHTML = prof
    ? `<span class="mp-avatar">${prof.avatar}</span><span class="mp-name">${esc(prof.name)}</span>`
    : `<span class="mp-avatar">👤</span><span class="mp-name">Who's playing?</span>`;
  const counters = document.getElementById('menu-counters');
  const total = getTotalStars();
  const nextSkin = SKINS.find(s => !isSkinUnlocked(s.id));
  const streak = getPlayStreak();
  const cls = getClassInfo();
  const hwLeft = cls?.assignment?.levels?.length ? cls.assignment.levels.filter(k => !getLevelStars()[k]).length : null;
  counters.innerHTML = `
    <span class="counter" title="${nextSkin ? `${nextSkin.unlock - total} more stars for ${esc(nextSkin.name)}` : 'All skins unlocked'}">⭐ ${total}</span>
    <span class="counter ${streak.count && !streak.playedToday ? 'warn' : ''}" title="${streak.playedToday ? 'Day streak' : 'Play today to keep your streak!'}">🔥 ${streak.count}</span>
    ${hwLeft !== null ? `<button class="counter hw" onclick="showLevelPicker()" title="Homework">📋 ${hwLeft ? hwLeft : '✓'}</button>` : ''}`;
}

function showLevelPicker() {
  const grid = document.getElementById('level-picker-grid');
  const stars = getLevelStars();
  const assigned = getAssignedLevels();
  const cls = getClassInfo();
  document.getElementById('level-picker-sub').textContent =
    cls?.assignment?.message ? `📋 ${cls.assignment.message}` : `Difficulty: ${difficultyConfig().label} · change it in ⚙️ Settings`;
  grid.innerHTML = '';
  LEVEL_KEYS.forEach(key => {
    const d = GRAMMAR_DB[key];
    const unlocked = isLevelUnlocked(key);
    const s = stars[key] || 0;
    const card = document.createElement('button');
    card.className = 'level-card' + (unlocked ? '' : ' locked') + (assigned.includes(key) ? ' assigned' : '');
    card.innerHTML = `<span class="lc-icon">${unlocked ? d.icon : '🔒'}</span><span class="lc-name">${levelLabel(key)}${assigned.includes(key) ? ' 📋' : ''}</span>
      <span class="lc-topic">${esc(d.topic)}</span><span class="lc-stars">${'⭐'.repeat(s)}${'☆'.repeat(3 - s)}</span>`;
    card.setAttribute('aria-label', `${levelLabel(key)}: ${d.topic}. ${unlocked ? `${s} of 3 stars` : 'Locked'}${assigned.includes(key) ? '. Homework' : ''}`);
    card.onclick = () => unlocked ? startLevelKey(key) : showToast('🔒 Finish the previous level to unlock this one!');
    grid.appendChild(card);
  });
  document.getElementById('level-picker-overlay').classList.remove('hidden');
  grid.querySelector('.level-card:not(.locked)')?.focus();
}
function closeLevelPicker() { document.getElementById('level-picker-overlay').classList.add('hidden'); }

// ── Daily play streak ──
const STREAK_KEY = 'gr_play_days';
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function markPlayedToday() {
  let days = [];
  try { days = JSON.parse(localStorage.getItem(pk(STREAK_KEY)) || '[]'); } catch(e) {}
  const today = localDateStr();
  if (!days.includes(today)) days.push(today);
  try { localStorage.setItem(pk(STREAK_KEY), JSON.stringify(days.slice(-60))); } catch(e) {}
  const s = getPlayStreak();
  const stats = getAchStats();
  if ((stats.bestStreakDays || 0) < s.count) { stats.bestStreakDays = s.count; saveAchStats(stats); checkAchievements(stats); }
  scheduleProgressPush();
}

// ── Class membership (pupil side) ──
const CLASS_KEY = 'gr_class';
function getClassInfo() { try { return JSON.parse(localStorage.getItem(CLASS_KEY) || 'null'); } catch(e) { return null; } }
function setClassInfo(info) { try { info ? localStorage.setItem(CLASS_KEY, JSON.stringify(info)) : localStorage.removeItem(CLASS_KEY); } catch(e) {} }
function getAssignedLevels() { return (getClassInfo()?.assignment?.levels || []).filter(k => GRAMMAR_DB[k]); }
function getPlayerName() { try { return localStorage.getItem(pk('gr_player_name')) || ''; } catch(e) { return ''; } }

async function fetchClass(code) {
  const res = await fetch(`/api/class/${encodeURIComponent(code)}`);
  if (res.status === 404) throw new Error('No class with that code. Check with your teacher.');
  if (!res.ok) throw new Error('Could not reach the class server.');
  return res.json();
}

async function joinClassFromSettings() {
  const code = document.getElementById('settings-classcode').value.trim().toUpperCase();
  const name = document.getElementById('settings-name').value.trim();
  const status = document.getElementById('settings-class-status');
  if (!code) { setClassInfo(null); status.textContent = 'Left the class.'; renderMenuWorlds(); return; }
  if (!name) { status.textContent = 'Please type your name so your teacher knows it is you.'; return; }
  status.textContent = 'Joining…';
  try {
    const data = await fetchClass(code);
    try { localStorage.setItem(pk('gr_player_name'), name); } catch(e) {}
    const prof = currentProfile();
    if (prof && prof.name !== name) saveProfiles(getProfiles().map(p => p.id === prof.id ? { ...p, name } : p));
    setClassInfo({ code, name: data.name, assignment: data.assignment, questions: data.questions || {} });
    status.textContent = `✅ Joined ${data.name || code}!`;
    await pullProgress();
    renderMenuWorlds();
  } catch (e) {
    status.textContent = `⚠️ ${e.message}`;
  }
}

async function refreshClassInfo() {
  const cls = getClassInfo();
  if (!cls?.code) return;
  try {
    const data = await fetchClass(cls.code);
    setClassInfo({ ...cls, name: data.name, assignment: data.assignment, questions: data.questions || {} });
    renderMenuWorlds();
  } catch (e) { /* offline: keep cached class info */ }
}

// ── "Turn your phone sideways" tip: touch screens held upright, during a level ──
function updateRotateTip() {
  const show = !!game && window.matchMedia?.('(pointer: coarse)').matches && innerHeight > innerWidth * 1.15 &&
    !sessionStorage.getItem('gr_rotate_tip_closed');
  document.getElementById('rotate-tip').classList.toggle('show', show);
}
function dismissRotateTip() {
  try { sessionStorage.setItem('gr_rotate_tip_closed', '1'); } catch (e) {}
  updateRotateTip();
}
window.addEventListener('resize', updateRotateTip);

// ── Background music while playing ──
let worldMusic = { el: null, track: null };
function playWorldMusic(key) {
  const data = GRAMMAR_DB[key];
  const track = data?.difficulty === 'boss' ? 'music-dark' : `music-w${key === 'practice' ? 1 : parseInt(key, 10)}`;
  const entry = csSfxManifest[track];
  if (!getSettings().music || !entry) { stopWorldMusic(); return; }
  if (worldMusic.track === track && worldMusic.el && !worldMusic.el.paused) return;
  stopWorldMusic();
  const el = document.createElement('audio');
  el.src = `/audio/story/${entry.file}`;
  el.loop = true;
  el.volume = 0;
  worldMusic = { el, track };
  csFade(el, 0.11);
}
function stopWorldMusic() {
  if (worldMusic.el) csFade(worldMusic.el, 0);
  worldMusic = { el: null, track: null };
}

// ── Player profiles ──
const PROFILE_AVATARS = ['🦊', '🐼', '🐯', '🐸', '🦄', '🐙', '🐨', '🦁', '🐧', '🐵', '🐰', '🐢'];
function getProfiles() { try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); } catch (e) { return []; } }
function saveProfiles(list) { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch (e) {} }
function currentProfile() { return getProfiles().find(p => p.id === currentProfileId()) || null; }

function createProfile(name, avatar) {
  const list = getProfiles();
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try {
    // The first player keeps any progress saved on this device before profiles existed
    if (!list.length) PER_PUPIL_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) localStorage.setItem(`${k}@${id}`, v); });
    localStorage.setItem(`gr_player_name@${id}`, name);
  } catch (e) {}
  list.push({ id, name, avatar });
  saveProfiles(list);
  return id;
}

async function switchProfile(id) {
  try { localStorage.setItem(CURRENT_PROFILE_KEY, id); } catch (e) {}
  closeProfilePicker();
  await pullProgress();
  renderMenuWorlds();
  updateBallThumb();
  const p = currentProfile();
  if (p) showToast(`${p.avatar} Hi ${p.name}! Let's play.`);
}

function deleteProfile(id) {
  const p = getProfiles().find(x => x.id === id);
  if (!p || !confirm(`Delete ${p.name}'s progress on this device?`)) return;
  try { [...PER_PUPIL_KEYS, 'gr_synced_at', 'gr_dirty'].forEach(k => localStorage.removeItem(`${k}@${id}`)); } catch (e) {}
  saveProfiles(getProfiles().filter(x => x.id !== id));
  if (currentProfileId() === id) { try { localStorage.removeItem(CURRENT_PROFILE_KEY); } catch (e) {} }
  showProfilePicker(true);
}

function profileStars(id) {
  try { return parseInt(localStorage.getItem(`gr_total_stars@${id}`) || '0', 10); } catch (e) { return 0; }
}

function showProfilePicker(manage = false) {
  const el = qzOpenScreen('profile-overlay', '#8B5CF6', '#3b2a8a');
  const list = getProfiles();
  let avatar = PROFILE_AVATARS[list.length % PROFILE_AVATARS.length];
  el.innerHTML = `<div class="qz-wrap">
    ${list.length && currentProfileId() ? '<button class="qz-close" onclick="closeProfilePicker()" aria-label="Close">✕</button>' : ''}
    <div class="qz-badge" style="background:linear-gradient(145deg,#8B5CF6,#EC4899);">👋</div>
    <h2 class="qz-title">Who's playing?</h2>
    <p class="qz-sub">${list.length ? 'Tap your name to keep your own stars and badges.' : 'Make a player so your stars and badges are saved just for you.'}</p>
    <div class="profile-grid">
      ${list.map(p => `<div class="profile-card ${p.id === currentProfileId() ? 'active' : ''}">
        <button class="profile-pick" data-id="${p.id}" aria-label="Play as ${esc(p.name)}">
          <span class="profile-avatar">${p.avatar}</span>
          <span class="profile-name">${esc(p.name)}</span>
          <span class="profile-stars">⭐ ${profileStars(p.id)}</span>
        </button>
        ${manage ? `<button class="profile-del" data-id="${p.id}" aria-label="Delete ${esc(p.name)}">🗑️</button>` : ''}
      </div>`).join('')}
    </div>
    <div class="qz-intro" style="text-align:center;">
      <div style="font-family:'Fredoka One',cursive;color:#fff;margin-bottom:8px;">➕ New player</div>
      <div class="avatar-row" id="avatar-row">${PROFILE_AVATARS.map(a => `<button class="avatar-opt ${a === avatar ? 'on' : ''}" data-a="${a}" aria-label="Choose ${a}">${a}</button>`).join('')}</div>
      <input class="guru-input" id="new-profile-name" maxlength="20" placeholder="Your name" style="margin-top:10px;">
      <button class="btn btn-primary" style="width:100%;" id="new-profile-btn">Let's go!</button>
      <div class="settings-hint" id="new-profile-msg"></div>
    </div>
    <div class="qz-btn-row">
      ${list.length ? `<button class="btn btn-secondary" onclick="showProfilePicker(${!manage})">${manage ? '✓ Done' : '⚙️ Manage players'}</button>` : ''}
      ${!currentProfileId() ? '<button class="btn btn-secondary" onclick="closeProfilePicker()">Just play</button>' : ''}
    </div>
  </div>`;
  el.querySelectorAll('.profile-pick').forEach(b => b.onclick = () => switchProfile(b.dataset.id));
  el.querySelectorAll('.profile-del').forEach(b => b.onclick = () => deleteProfile(b.dataset.id));
  el.querySelectorAll('.avatar-opt').forEach(b => b.onclick = () => {
    avatar = b.dataset.a;
    el.querySelectorAll('.avatar-opt').forEach(x => x.classList.toggle('on', x === b));
  });
  const input = el.querySelector('#new-profile-name');
  const create = () => {
    const name = input.value.trim();
    const msg = el.querySelector('#new-profile-msg');
    if (!name) { msg.textContent = 'Please type your name.'; input.focus(); return; }
    if (getProfiles().some(p => p.name.toLowerCase() === name.toLowerCase())) { msg.textContent = 'That name is already here — tap it above.'; return; }
    switchProfile(createProfile(name, avatar));
  };
  el.querySelector('#new-profile-btn').onclick = create;
  input.onkeydown = e => { if (e.key === 'Enter') create(); };
}
function closeProfilePicker() { document.getElementById('profile-overlay')?.remove(); }

// ── Progress sync with the class server ──
function collectProgress() {
  const data = {};
  PER_PUPIL_KEYS.forEach(k => {
    if (k === 'gr_player_name') return;
    try { const v = localStorage.getItem(pk(k)); if (v !== null) data[k] = v; } catch (e) {}
  });
  return data;
}
let pushTimer = null;
function scheduleProgressPush() {
  if (!currentProfileId()) return;
  try { localStorage.setItem(pk('gr_dirty'), '1'); } catch (e) {}
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushProgress, 1500);
}
function progressUrl() {
  const cls = getClassInfo(), p = currentProfile();
  return cls?.code && p ? `/api/class/${cls.code}/progress/${encodeURIComponent(p.name)}` : null;
}
async function pushProgress() {
  const url = progressUrl();
  if (!url) return;
  try {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: collectProgress() }) });
    if (!res.ok) return;
    const { updated_at } = await res.json();
    localStorage.setItem(pk('gr_synced_at'), updated_at);
    localStorage.removeItem(pk('gr_dirty'));
  } catch (e) { /* offline: stays dirty and is sent next time */ }
}
// Unsent changes on this device win; otherwise newer progress from the server is loaded
async function pullProgress() {
  const url = progressUrl();
  if (!url) return;
  try {
    if (localStorage.getItem(pk('gr_dirty'))) { await pushProgress(); return; }
    const res = await fetch(url);
    if (res.status === 404) { await pushProgress(); return; }
    if (!res.ok) return;
    const remote = await res.json();
    if (remote.updated_at <= (localStorage.getItem(pk('gr_synced_at')) || '')) return;
    Object.entries(remote.data || {}).forEach(([k, v]) => { if (PER_PUPIL_KEYS.includes(k)) localStorage.setItem(pk(k), v); });
    localStorage.setItem(pk('gr_synced_at'), remote.updated_at);
    renderMenuWorlds();
  } catch (e) { /* offline */ }
}

function postAttempt(g, won, stars) {
  const cls = getClassInfo();
  if (!cls?.code || g.level.key === 'practice') return;
  const total = g.level.questions.length;
  const correct = g.answeredQuestions.size;
  fetch('/api/attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      classCode: cls.code,
      playerName: getPlayerName() || 'Pupil',
      levelKey: g.level.key,
      won, stars: won ? stars : 0,
      score: g.score,
      accuracy: total ? Math.round(correct / (correct + g.wrongAnswers.length || 1) * 100) : 0,
      missed: g.wrongAnswers.map(w => w.question).slice(0, 20),
    }),
  }).catch(() => {});
}
function getPlayStreak() {
  let days = [];
  try { days = JSON.parse(localStorage.getItem(pk(STREAK_KEY)) || '[]'); } catch(e) {}
  const set = new Set(days);
  const d = new Date();
  const playedToday = set.has(localDateStr(d));
  if (!playedToday) d.setDate(d.getDate() - 1);
  let count = 0;
  while (set.has(localDateStr(d))) { count++; d.setDate(d.getDate() - 1); }
  return { count, playedToday };
}

// ── Settings UI ──
function showSettings() {
  const s = getSettings();
  const seg = document.getElementById('settings-difficulty');
  seg.innerHTML = '';
  Object.entries(DIFFICULTIES).forEach(([id, d]) => {
    const b = document.createElement('button');
    b.textContent = d.label;
    b.setAttribute('aria-pressed', String(s.difficulty === id));
    b.onclick = () => { saveSettings({ difficulty: id }); showSettings(); };
    seg.appendChild(b);
  });
  document.getElementById('settings-difficulty-hint').textContent = difficultyConfig().desc;
  const modeSeg = document.getElementById('settings-answer-mode');
  modeSeg.innerHTML = '';
  [['jump', '⬆ Jump on the answer'], ['popup', '🔘 Tap a button']].forEach(([id, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('aria-pressed', String(s.answerMode === id));
    b.onclick = () => { saveSettings({ answerMode: id }); showSettings(); };
    modeSeg.appendChild(b);
  });
  document.getElementById('settings-answer-hint').textContent = s.answerMode === 'popup'
    ? 'A question pop-up appears with answer buttons (easier on small screens).'
    : 'Walk under your answer and jump up onto it. Sentence-order questions still use a pop-up.';
  document.getElementById('settings-autoread').checked = !!s.autoRead;
  document.getElementById('settings-narrate').checked = !!s.narrateStory;
  document.getElementById('settings-music').checked = !!s.music;
  document.getElementById('settings-font').checked = !!s.readableFont;
  document.getElementById('settings-motion').checked = !!s.reduceMotion;
  const cls = getClassInfo();
  document.getElementById('settings-classcode').value = cls?.code || '';
  document.getElementById('settings-name').value = (function(){ try { return localStorage.getItem(pk('gr_player_name')) || ''; } catch(e) { return ''; } })();
  document.getElementById('settings-class-status').textContent = cls ? `✅ In class ${cls.code}${cls.name ? ` (${cls.name})` : ''}` : 'Join your class to get homework and the class leaderboard.';
  document.getElementById('settings-overlay').classList.remove('hidden');
}
function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
  renderMenuWorlds();
}
function applyMotionSetting() { document.body.classList.toggle('reduce-motion', !!getSettings().reduceMotion); }
function applyFontSetting() { document.body.classList.toggle('readable-font', !!getSettings().readableFont); }
// Font for text drawn on the game canvas (signs, banners)
function canvasFont(size) {
  return getSettings().readableFont ? `bold ${Math.round(size * 1.05)}px 'Atkinson Hyperlegible', sans-serif` : `${size}px 'Fredoka One', cursive`;
}

function showMenu() {
  closeCertificate();
  document.getElementById('menu-screen').classList.remove('hidden');
  document.getElementById('gameover-overlay').classList.add('hidden');
  document.getElementById('win-overlay').classList.add('hidden');
  document.getElementById('mcq-overlay').classList.add('hidden');
  document.getElementById('name-overlay').classList.add('hidden');
  document.getElementById('leaderboard-overlay').classList.add('hidden');
  document.getElementById('mode-select-overlay').classList.add('hidden');
  document.getElementById('review-overlay').classList.add('hidden'); // bug11 fix: clear review on menu
  document.getElementById('pause-btn').style.display='none';
  document.getElementById('pause-btn').textContent='⏸';
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('selfie-indicator').style.display='none';
  game = null;
  // Reset co-op state
  if (coopMode) {
    coopMode = false;
    coopRoom = null;
    document.getElementById('coop-hud').classList.remove('visible');
    document.getElementById('coop-wait-banner').classList.add('hidden');
  }
  document.getElementById('word-progress').style.display = 'none';
  stopWorldMusic();
  updateRotateTip();
  renderMenuWorlds();
}

function showModeSelect() {
  if (!(function(){ try { return localStorage.getItem(CS_INTRO_KEY); } catch(e){ return null; } })()) {
    try { localStorage.setItem(CS_INTRO_KEY, '1'); } catch(e) {}
    showIntroCutscene(() => {
      document.getElementById('mode-select-overlay').classList.remove('hidden');
    });
    return;
  }
  document.getElementById('mode-select-overlay').classList.remove('hidden');
}
function closeModeSelect() {
  document.getElementById('mode-select-overlay').classList.add('hidden');
}

// ══════════════════════════════════════════════
//  PAUSE
// ══════════════════════════════════════════════
document.getElementById('pause-btn').addEventListener('click', togglePause);
function togglePause() {
  if (!game) return;
  // bug9 fix: don't pause mid-MCQ (state=answering) — that would corrupt MCQ flow
  if (game.state === 'answering') return;
  const isPausing = game.state === 'playing';
  game.state = isPausing ? 'paused' : 'playing';
  if (worldMusic.el) isPausing ? worldMusic.el.pause() : worldMusic.el.play().catch(() => {});
  document.getElementById('pause-btn').textContent = isPausing ? '▶' : '⏸';
  document.getElementById('pause-overlay').classList.toggle('hidden', !isPausing);
}

function quitToMenu() {
  stopMCQTimer(); // bug10 fix: prevent timer from firing after menu is shown
  hideMCQ();
  if (game) game.state = 'playing';
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('pause-btn').textContent = '⏸';
  showMenu();
}

// ══════════════════════════════════════════════
//  SELFIE CAPTURE
// ══════════════════════════════════════════════
function setSelfieStatus(msg) {
  const el = document.getElementById('selfie-status');
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
}

const CAMERA_ERRORS = {
  NotAllowedError:      '🚫 Camera is blocked. Click the camera icon in the address bar to allow it, then try again — or choose a photo below.',
  SecurityError:        '🚫 Camera is blocked on this page. Choose a photo below instead.',
  NotFoundError:        '📷 No camera found on this device. Choose a photo below instead.',
  OverconstrainedError: '📷 No suitable camera found. Choose a photo below instead.',
  NotReadableError:     '⚠️ The camera is being used by another app (e.g. Teams or Zoom). Close it and try again.',
  AbortError:           '⚠️ The camera could not start. Try again, or choose a photo below.',
};

let selfieCameraId = null;
let blackCheckTimer = null;

async function showSelfieScreen() {
  const screen = document.getElementById('selfie-screen');
  const video  = document.getElementById('camera-video');
  const snap   = document.getElementById('capture-btn');
  screen.classList.remove('hidden');
  snap.disabled = true;
  video.style.visibility = 'hidden';
  clearInterval(blackCheckTimer);
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setSelfieStatus('📷 The camera only works on a secure (https) page. Choose a photo below instead.');
    return;
  }
  setSelfieStatus('⏳ Starting camera… if your browser asks, click "Allow".');
  const slowHint = setTimeout(() => setSelfieStatus('⏳ Still waiting — look for the camera permission pop-up near the address bar.'), 6000);
  try {
    const size = { width: { ideal: 640 }, height: { ideal: 640 } };
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: selfieCameraId ? { deviceId: { exact: selfieCameraId }, ...size } : { facingMode: 'user', ...size },
      audio: false,
    });
    if (screen.classList.contains('hidden')) { closeSelfie(); return; } // cancelled while waiting
    selfieCameraId = cameraStream.getVideoTracks()[0]?.getSettings().deviceId || selfieCameraId;
    video.srcObject = cameraStream;
    await video.play();
    video.style.visibility = '';
    setSelfieStatus('');
    snap.disabled = false;
    renderCameraPicker();
    watchForBlackPicture(video);
  } catch (e) {
    if (e.name === 'OverconstrainedError' && selfieCameraId) { selfieCameraId = null; return showSelfieScreen(); }
    setSelfieStatus(CAMERA_ERRORS[e.name] || '⚠️ The camera could not start. Choose a photo below instead.');
    renderCameraPicker();
  } finally {
    clearTimeout(slowHint);
  }
}

// Some cameras stream pure black (privacy shutter, camera-off key, IR or virtual camera)
function watchForBlackPicture(video) {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 32;
  const pc = probe.getContext('2d', { willReadFrequently: true });
  let checks = 0, warned = false;
  clearInterval(blackCheckTimer);
  blackCheckTimer = setInterval(() => {
    if (!cameraStream || video.readyState < 2) return;
    pc.drawImage(video, 0, 0, 32, 32);
    const d = pc.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    const brightness = sum / (d.length / 4) / 3;
    checks++;
    if (brightness < 8) {
      if (checks >= 3 && !warned) {
        warned = true;
        setSelfieStatus('🌑 The camera is on but the picture is black. Open the camera cover or press the camera on/off key' +
          (document.getElementById('selfie-camera-select').options.length > 1 ? ', or pick another camera below.' : ', or choose a photo below.'));
      }
    } else if (warned) {
      warned = false;
      setSelfieStatus('');
    }
  }, 700);
}

async function renderCameraPicker() {
  const sel = document.getElementById('selfie-camera-select');
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    sel.innerHTML = cams.map((c, i) => `<option value="${esc(c.deviceId)}">${esc(c.label || `Camera ${i + 1}`)}</option>`).join('');
    if (selfieCameraId) sel.value = selfieCameraId;
    sel.style.display = cams.length > 1 ? '' : 'none';
  } catch (e) { sel.style.display = 'none'; }
}

function switchSelfieCamera(id) {
  selfieCameraId = id;
  showSelfieScreen();
}

// ══════════════════════════════════════════════
//  POWER-UP SYSTEM
// ══════════════════════════════════════════════
function collectPowerUp(g, type) {
  const info = PU_TYPES[type];
  Audio.star();
  spawnParticles(g.px, g.py, info.color, 14, 5);
  spawnTextParticle(g.px, g.py-40, `${info.icon} ${info.label}!`, info.color);

  if (type === 'shield') {
    g.inv.shield = true;
  } else {
    // time & hint stored, auto-used on next MCQ open
    g.inv[type] = true;
  }
  updatePowerUpHUD(g);
}

function updatePowerUpHUD(g) {
  const bar = document.getElementById('powerup-bar');
  bar.innerHTML = '';
  ['shield','time','hint','double'].forEach(t => {
    if (g.inv[t]) {
      const info = PU_TYPES[t];
      const badge = document.createElement('div');
      badge.className = `pu-badge ${t}`;
      badge.title = info.label;
      badge.textContent = info.icon;
      bar.appendChild(badge);
    }
  });
}

// Called in processAnswerResult when answer is WRONG
function tryShield(g) {
  if (g.inv.shield) {
    g.inv.shield = false;
    updatePowerUpHUD(g);
    spawnParticles(g.px, g.py, '#8B5CF6', 16, 6);
    spawnTextParticle(g.px, g.py-40, '🛡️ Shield Active!', '#8B5CF6');
    Audio.checkpoint();
    return true; // absorbed damage
  }
  return false;
}

// Called in showMCQ — auto-consume stored power-ups
function applyMCQPowerUps(g) {
  if (g.inv.time) {
    g.inv.time = false;
    updatePowerUpHUD(g);
    // Will be read by startMCQTimer via g.bonusTime
    g.bonusTime = 5;
  }
  if (g.inv.hint) {
    g.inv.hint = false;
    updatePowerUpHUD(g);
    g.useHint = true;
  }
  if (g.inv.double) {
    g.inv.double = false;
    updatePowerUpHUD(g);
    g.useDouble = true;
  }
}

function applyHintToButtons() {
  // Grey out one random wrong answer button
  const wrongIdxs = mcqShuffled
    .map((c,i) => ({c,i}))
    .filter(({c}) => !c.isCorrect)
    .map(({i}) => i);
  if (wrongIdxs.length === 0) return;
  const pick = wrongIdxs[Math.floor(Math.random()*wrongIdxs.length)];
  const btn = document.getElementById(`mcq-btn-${pick}`);
  btn.disabled = true;
  btn.style.opacity = '0.3';
  btn.style.textDecoration = 'line-through';
}

// ══════════════════════════════════════════════
//  COMBO SYSTEM
// ══════════════════════════════════════════════
const PRAISE = [
  null,                                  // 0 — no praise
  { main:'Correct! ✓',  sub:'',                   color:'#06D6A0' }, // 1
  { main:'Great! 🔥', sub:'2 in a row!',  color:'#FFD166' }, // 2
  { main:'Amazing! ⚡', sub:'2× Points!',      color:'#FF8C42' }, // 3
  { main:'Excellent! 🌟', sub:'2× Points!',       color:'#FF8C42' }, // 4
  { main:'Genius! 🚀',    sub:'2× Points! Keep going!', color:'#EF476F' }, // 5+
];

let praiseTimer = null;

function showPraise(combo) {
  const idx = Math.min(combo, PRAISE.length-1);
  const p   = PRAISE[idx];
  if (!p) return;

  const popup = document.getElementById('praise-popup');
  const main  = document.getElementById('praise-main');
  const sub   = document.getElementById('praise-sub');

  main.textContent = p.main;
  sub.textContent  = p.sub;
  popup.style.color = p.color;
  popup.style.textShadow = `0 0 40px ${p.color}88, 0 4px 0 rgba(0,0,0,.4)`;

  popup.classList.add('show');
  if (praiseTimer) clearTimeout(praiseTimer);
  praiseTimer = setTimeout(() => popup.classList.remove('show'), 1200);
}

function updateComboHUD(combo) {
  const el    = document.getElementById('combo-display');
  const count = document.getElementById('combo-count');
  if (combo >= 2) {
    const mult = combo >= 10 ? ' 5×' : combo >= 5 ? ' 3×' : combo >= 3 ? ' 2×' : '';
    const icon = combo >= 10 ? '👑' : combo >= 5 ? '🔥' : '⚡';
    count.textContent = `${icon} ${combo} Streak${mult}`;
    el.classList.add('active');
    el.classList.toggle('tier-2', combo >= 5 && combo < 10);
    el.classList.toggle('tier-3', combo >= 10);
  } else {
    el.classList.remove('active', 'tier-2', 'tier-3');
  }
}

let explainToastTimer = null;
let explainToastQ = null;
function showExplainToast(tip, header, q) {
  const toast = document.getElementById('explain-toast');
  const title = document.getElementById('explain-toast-title');
  const body  = document.getElementById('explain-toast-body');
  if (!toast) return;
  explainToastQ = q || null;
  title.textContent = header || '💡 Grammar Tip';
  body.textContent  = tip ? `💡 ${tip}` : '';
  document.getElementById('explain-toast-speak').style.display = q ? '' : 'none';
  toast.classList.add('show');
  if (explainToastTimer) clearTimeout(explainToastTimer);
  explainToastTimer = setTimeout(hideExplainToast, 7000);
}
function hideExplainToast() {
  document.getElementById('explain-toast').classList.remove('show');
}
function speakExplainToast(e) {
  e.stopPropagation();
  const q = explainToastQ;
  if (!q) return;
  const sentence = isSpecial(q) ? correctText(q) : q.q.replace('___', q.correct);
  speak(`${sentence}. ${q.tip || ''}`);
  if (explainToastTimer) clearTimeout(explainToastTimer);
  explainToastTimer = setTimeout(hideExplainToast, 9000);
}

// ══════════════════════════════════════════════
//  SETTINGS, SPEECH, TOASTS
// ══════════════════════════════════════════════
const SETTINGS_KEY = 'gr_settings';
const DIFFICULTIES = {
  easy:   { label:'🌱 Easy',   hearts:5, mcqTime:20, enemies:false, desc:'5 hearts · 20s per question · no enemies' },
  normal: { label:'⚽ Normal', hearts:3, mcqTime:12, enemies:null,  desc:'3 hearts · 12s per question' },
  hard:   { label:'🔥 Hard',   hearts:3, mcqTime:7,  enemies:true,  desc:'3 hearts · 7s per question · enemies everywhere' },
};
function getSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch(e) {}
  return { difficulty:'normal', autoRead:false, reduceMotion:false, narrateStory:true, answerMode:'jump',
    music:true, unlockAll:false, readableFont:false, ...s };
}
function saveSettings(patch) {
  const s = { ...getSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch(e) {}
  return s;
}
function difficultyConfig() { return DIFFICULTIES[getSettings().difficulty] || DIFFICULTIES.normal; }
const prefersReducedMotion = () =>
  getSettings().reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let cachedVoice = null;
let onlineVoiceFailed = false;
// Order: Edge's neural "(Natural)" voices sound most human; then voices installed on the device.
// Other online voices (e.g. Chrome's "Google UK English") fail silently on filtered school networks.
// If an online voice errors, onlineVoiceFailed switches to local voices only.
function pickVoice() {
  if (cachedVoice || !window.speechSynthesis) return cachedVoice;
  const en = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
  const gb = list => list.find(v => /en[-_]GB/i.test(v.lang)) || list[0];
  const natural = onlineVoiceFailed ? [] : en.filter(v => /natural/i.test(v.name));
  const local = en.filter(v => v.localService);
  cachedVoice = gb(natural) || gb(local) || (onlineVoiceFailed ? null : gb(en)) || null;
  return cachedVoice;
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { cachedVoice = null; pickVoice(); };

let currentUtterance = null; // kept referenced so Chrome doesn't garbage-collect it mid-speech
let speakTimer = null;
function speak(text, opts = {}, retried = false) {
  if (!text) return;
  if (!window.speechSynthesis) { showToast('🔇 Read-aloud is not supported in this browser.'); return; }
  const wasBusy = speechSynthesis.speaking || speechSynthesis.pending;
  speechSynthesis.cancel();
  clearTimeout(speakTimer);
  // Chrome drops an utterance queued in the same tick as cancel()
  speakTimer = setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-GB'; }
    u.rate = opts.rate ?? 0.85;
    u.pitch = opts.pitch ?? 1;
    u.volume = 1;
    if (opts.onend) u.onend = opts.onend;
    u.onerror = e => {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      if (!retried && v && !v.localService) {
        onlineVoiceFailed = true; cachedVoice = null;
        speak(text, opts, true);
        return;
      }
      showToast(e.error === 'not-allowed'
        ? '🔇 Tap the 🔊 button to hear it (the browser blocked automatic sound).'
        : '🔇 Read-aloud failed. Check the device volume or install an English voice in Windows settings.', 5000);
    };
    currentUtterance = u;
    speechSynthesis.resume();
    speechSynthesis.speak(u);
  }, wasBusy ? 120 : 30);
}
function speakQuestion(q) {
  if (!q) return;
  if (q.type === 'listen') { playListening(q); return; }
  if (q.type === 'spot') { speak(`Find the mistake. ${joinWords(q.words)}`); return; }
  if (q.type === 'picture') { speak('Look at the picture. Which sentence matches it?'); return; }
  if (q.type === 'order') { speak('Put the words in order.'); return; }
  speak(q.q.replace(/_{3,}/g, ' blank '));
}
function speakCurrentQuestion() {
  if (!game) return;
  const q = mcqMode === 'boss' ? game.bossLastQ : game.level.questions[game.currentQ];
  speakQuestion(q);
}

let toastTimer = null;
function showToast(msg, ms = 3200) {
  let el = document.getElementById('app-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

let screenShakeTimer = 0, screenShakeIntensity = 0;
function triggerScreenShake(intensity, durationMs) {
  if (prefersReducedMotion()) return;
  screenShakeIntensity = intensity;
  screenShakeTimer = Math.round(durationMs / 16);
}

function updateBallThumb() {
  // Updates all ball preview elements (HUD thumb, MCQ preview, menu preview)
  const els = [
    document.getElementById('selfie-thumb'),
    document.getElementById('mcq-ball-preview'),
    document.getElementById('menu-ball-preview'),
  ];
  if (selfieCanvas) {
    const dataUrl = selfieCanvas.toDataURL();
    const imgTag = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    els.forEach(el => { if (el) el.innerHTML = imgTag; });
  } else {
    document.getElementById('selfie-thumb').innerHTML = '😊';
    const mcqPrev = document.getElementById('mcq-ball-preview');
    if (mcqPrev) mcqPrev.innerHTML = '😊';
    const menuPrev = document.getElementById('menu-ball-preview');
    if (menuPrev) menuPrev.innerHTML = '😊';
  }
}

// Crop the centre square of the source into a round 100px ball face
function makeSelfie(source, srcW, srcH, mirror) {
  const SIZE = 100;
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = SIZE;
  const tc = tmp.getContext('2d');
  const side = Math.min(srcW, srcH);
  if (mirror) { tc.translate(SIZE, 0); tc.scale(-1, 1); }
  tc.drawImage(source, (srcW - side) / 2, (srcH - side) / 2, side, side, 0, 0, SIZE, SIZE);
  tc.setTransform(1, 0, 0, 1, 0, 0);
  tc.globalCompositeOperation = 'destination-in';
  tc.beginPath(); tc.arc(SIZE/2, SIZE/2, SIZE/2, 0, Math.PI*2); tc.fill();

  selfieCanvas = tmp;
  selfieDataURL = tmp.toDataURL('image/png');
  updateBallThumb();
  closeSelfie();
  Audio.star();
  showToast('😄 Looking good! Your face is now the ball.');
}

function captureSelfie() {
  const video = document.getElementById('camera-video');
  if (!cameraStream || video.readyState < 2 || !video.videoWidth) {
    setSelfieStatus('⏳ The camera is not ready yet — wait a moment, or choose a photo below.');
    return;
  }
  makeSelfie(video, video.videoWidth, video.videoHeight, true);
}

function selfieFromFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { setSelfieStatus('⚠️ Please choose a picture file.'); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { makeSelfie(img, img.naturalWidth, img.naturalHeight, false); URL.revokeObjectURL(url); };
  img.onerror = () => { setSelfieStatus('⚠️ That picture could not be opened. Try another one.'); URL.revokeObjectURL(url); };
  img.src = url;
}

function closeSelfie() {
  clearInterval(blackCheckTimer);
  if (cameraStream) { cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null; }
  const video = document.getElementById('camera-video');
  video.srcObject = null;
  document.getElementById('selfie-screen').classList.add('hidden');
}

document.getElementById('selfie-indicator').addEventListener('click', showSelfieScreen);

// ══════════════════════════════════════════════
//  INPUT
// ══════════════════════════════════════════════
document.addEventListener('keydown', e => {
  // Don't intercept keys when user is typing in an input/textarea/select
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
    if (e.key === 'Escape') { e.target.blur(); closeTopOverlay(); }
    return;
  }
  if (activeQuizPick && /^[1-3]$/.test(e.key)) { e.preventDefault(); activeQuizPick(Number(e.key) - 1); return; }
  if (e.key === 'Escape') {
    if (closeTopOverlay()) { e.preventDefault(); return; }
    if (game && game.state !== 'answering') togglePause();
    return;
  }
  // Answer shortcuts in the question pop-up
  if (game && game.state === 'answering' && !document.getElementById('mcq-overlay').classList.contains('hidden')) {
    const n = { '1':0,'2':1,'3':2,'a':0,'b':1,'c':2,'A':0,'B':1,'C':2 }[e.key];
    if (n !== undefined && document.getElementById('mcq-choices').style.display !== 'none') { e.preventDefault(); selectAnswer(n); return; }
    if (e.key === 'r' || e.key === 'R') { speakCurrentQuestion(); return; }
  }
  if ((e.key === 'p' || e.key === 'P') && game) { togglePause(); return; }
  if (!game && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !document.getElementById('menu-screen').classList.contains('hidden')) {
    moveWorld(e.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if (!game || game.state !== 'playing') {
    if (e.key === ' ' && e.target === document.body) e.preventDefault();
    return;
  }
  if (['ArrowLeft','a','A'].includes(e.key))  { keys.left=true;  if (!e.repeat) tapFrames.left  = TAP_MIN_FRAMES.left; }
  if (['ArrowRight','d','D'].includes(e.key)) { keys.right=true; if (!e.repeat) tapFrames.right = TAP_MIN_FRAMES.right; }
  if (['ArrowUp','w','W',' '].includes(e.key)) {
    // Only prevent default scroll for ArrowUp and Space, not W
    if (e.key === 'ArrowUp' || e.key === ' ') e.preventDefault();
    keys.up=true;
    if (!e.repeat) tapFrames.up = TAP_MIN_FRAMES.up;
  }
});
window.addEventListener('blur', () => { keys.left = keys.right = keys.up = false; });

// Escape closes the top-most dismissible pop-up; returns true if one was closed
const ESCAPABLE = [
  ['ach-overlay',          () => document.getElementById('ach-overlay').remove()],
  ['skins-overlay',        () => closeSkinsMenu()],
  ['daily-overlay',        () => closeDailyChallenge()],
  ['cert-overlay',         () => closeCertificate()],
  ['settings-overlay',     () => closeSettings()],
  ['level-picker-overlay', () => closeLevelPicker()],
  ['leaderboard-overlay',  () => closeLeaderboard()],
  ['name-overlay',         () => skipName()],
  ['review-overlay',       () => closeReview()],
  ['guru-overlay',         () => closeGuruMode()],
  ['mp-overlay',           () => closeMultiplayer()],
  ['coop-overlay',         () => closeCoopMenu()],
  ['tc-overlay',           () => closeTimeChallenge()],
  ['mode-select-overlay',  () => closeModeSelect()],
  ['selfie-screen',        () => closeSelfie()],
];
function closeTopOverlay() {
  for (const [id, close] of ESCAPABLE) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) { close(); return true; }
  }
  const toast = document.getElementById('explain-toast');
  if (toast.classList.contains('show')) { hideExplainToast(); return true; }
  return false;
}
document.addEventListener('keyup', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (['ArrowLeft','a','A'].includes(e.key)) keys.left=false;
  if (['ArrowRight','d','D'].includes(e.key)) keys.right=false;
  if (['ArrowUp','w','W',' '].includes(e.key)) keys.up=false;
});

// Touch controls
function setupTouch(id, prop) {
  const el=document.getElementById(id);
  el.addEventListener('touchstart',e=>{e.preventDefault();ctrlState[prop]=true;el.classList.add('pressed');},{passive:false});
  el.addEventListener('touchend',e=>{e.preventDefault();ctrlState[prop]=false;el.classList.remove('pressed');},{passive:false});
  el.addEventListener('mousedown',()=>{ctrlState[prop]=true;el.classList.add('pressed');});
  el.addEventListener('mouseup',()=>{ctrlState[prop]=false;el.classList.remove('pressed');});
  el.addEventListener('mouseleave',()=>{ctrlState[prop]=false;el.classList.remove('pressed');});
}
setupTouch('ctrl-left','left');
setupTouch('ctrl-right','right');
setupTouch('ctrl-jump','jump');

// ══════════════════════════════════════════════
//  UTILITY: roundRect helper
// ══════════════════════════════════════════════
function roundRect(ctx, x, y, w, h, r=6) {
  if (typeof r === 'number') r=[r,r,r,r];
  const [tl,tr,br,bl] = r;
  ctx.moveTo(x+tl, y);
  ctx.lineTo(x+w-tr, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+tr);
  ctx.lineTo(x+w, y+h-br);
  ctx.quadraticCurveTo(x+w, y+h, x+w-br, y+h);
  ctx.lineTo(x+bl, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-bl);
  ctx.lineTo(x, y+tl);
  ctx.quadraticCurveTo(x, y, x+tl, y);
}

