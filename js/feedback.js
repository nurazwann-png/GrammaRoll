// ══════════════════════════════════════════════
//  PLAYER REVIEWS: form after World 1 + reviews wall
// ══════════════════════════════════════════════
const FB_MOODS = [
  ['🤔', 'Tap a star to rate!'],
  ['😞', 'Not for me'],
  ['😕', 'It\'s okay'],
  ['🙂', 'Good!'],
  ['😄', 'Great!'],
  ['🤩', 'AWESOME!'],
];
const FB_TAGS = [
  ['fun', '🎮 Fun to play'], ['learn', '📚 Helped me learn'], ['story', '📖 Great story'],
  ['graphics', '🎨 Nice graphics'], ['sounds', '🔊 Voices & sounds'], ['boss', '👑 Boss fights'],
];
const FB_ROLES = {
  student:     { icon: '🎒', label: 'Student',     org: 'School (optional)' },
  teacher:     { icon: '🧑‍🏫', label: 'Teacher',     org: 'School (optional)' },
  parent:      { icon: '👨‍👩‍👧', label: 'Parent',      org: 'Town or state (optional)' },
  institution: { icon: '🏫', label: 'Institution', org: 'Institution name' },
  public:      { icon: '🌍', label: 'Public',      org: 'Town or state (optional)' },
};
const FB_ASKED_KEY = 'gr_review_asked';

let fbRating = 0, fbRole = '', fbTags = new Set(), fbOnDone = null, fbFromWall = false;

function hasAskedFeedback() {
  try { return !!localStorage.getItem(pk(FB_ASKED_KEY)); } catch (e) { return true; }
}

function showFeedbackForm(onDone, fromWall = false) {
  try { localStorage.setItem(pk(FB_ASKED_KEY), '1'); } catch (e) {}
  fbOnDone = onDone || null;
  fbFromWall = fromWall;
  fbRating = 0; fbRole = ''; fbTags = new Set();
  document.getElementById('fb-title').textContent = fromWall ? 'Rate Grammar Ball' : 'World 1 complete! 🎉';
  document.getElementById('fb-sub').textContent = fromWall ? 'Tell everyone what you think!' : 'How do you like Grammar Ball so far?';
  document.getElementById('fb-trophy').textContent = fromWall ? '⭐' : '🏆';
  document.getElementById('fb-later').textContent = fromWall ? 'Cancel' : 'Maybe later';
  let saved = '';
  try { saved = localStorage.getItem(pk('gr_player_name')) || ''; } catch (e) {}
  document.getElementById('fb-name').value = saved;
  document.getElementById('fb-org').value = '';
  document.getElementById('fb-comment').value = '';
  document.getElementById('fb-count').textContent = '0/500';
  document.getElementById('fb-error').textContent = '';
  document.getElementById('fb-form').classList.remove('hidden');
  document.getElementById('fb-thanks').classList.add('hidden');
  fbRenderStars(0);
  fbRenderChips();
  document.getElementById('fb-form-overlay').classList.remove('hidden');
}

function closeFeedbackForm() {
  document.getElementById('fb-form-overlay').classList.add('hidden');
  const done = fbOnDone;
  fbOnDone = null;
  if (fbFromWall) loadFeedbackWall();
  if (done) done();
}

function fbRenderStars(preview) {
  const shown = preview || fbRating;
  document.querySelectorAll('#fb-stars .fb-star').forEach((b, i) => {
    b.classList.toggle('on', i < shown);
    b.setAttribute('aria-checked', String(i + 1 === fbRating));
  });
  const [emoji, text] = FB_MOODS[shown];
  const mood = document.getElementById('fb-mood');
  document.getElementById('fb-mood-emoji').textContent = emoji;
  document.getElementById('fb-mood-text').textContent = text;
  mood.dataset.level = shown;
}

function fbPickRating(v) {
  fbRating = v;
  fbRenderStars(0);
  const mood = document.getElementById('fb-mood');
  mood.classList.remove('pop'); void mood.offsetWidth; mood.classList.add('pop');
  try { Audio.collect(); } catch (e) {}
  if (v === 5) fbConfetti();
}

function fbConfetti() {
  if (prefersReducedMotion()) return;
  const colors = ['#FFD166', '#06D6A0', '#EF476F', '#38BDF8', '#A855F7'];
  for (let i = 0; i < 40; i++) {
    const c = document.createElement('div');
    c.className = 'qz-confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.zIndex = 300;
    c.style.animationDuration = (1.4 + Math.random() * 1.4) + 's';
    c.style.animationDelay = (Math.random() * 0.3) + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3200);
  }
}

function fbRenderChips() {
  document.getElementById('fb-tags').innerHTML = FB_TAGS.map(([id, label]) =>
    `<button type="button" class="fb-chip${fbTags.has(id) ? ' on' : ''}" aria-pressed="${fbTags.has(id)}" onclick="fbToggleTag('${id}')">${label}</button>`).join('');
  document.getElementById('fb-roles').innerHTML = Object.entries(FB_ROLES).map(([id, r]) =>
    `<button type="button" class="fb-chip role${fbRole === id ? ' on' : ''}" aria-pressed="${fbRole === id}" onclick="fbPickRole('${id}')">${r.icon} ${r.label}</button>`).join('');
  document.getElementById('fb-org').placeholder = fbRole ? FB_ROLES[fbRole].org : 'School or organisation (optional)';
}
function fbToggleTag(id) { fbTags.has(id) ? fbTags.delete(id) : fbTags.add(id); fbRenderChips(); }
function fbPickRole(id) { fbRole = id; fbRenderChips(); }

async function submitFeedback() {
  const err = document.getElementById('fb-error');
  if (!fbRating) { err.textContent = '⭐ Please tap a star to rate the game.'; return; }
  if (!fbRole) { err.textContent = '👤 Please choose who you are.'; return; }
  err.textContent = '';
  const btn = document.getElementById('fb-submit');
  btn.disabled = true;
  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rating: fbRating, role: fbRole, tags: [...fbTags],
        name: document.getElementById('fb-name').value,
        organisation: document.getElementById('fb-org').value,
        comment: document.getElementById('fb-comment').value,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Could not send your review.');
    document.getElementById('fb-form').classList.add('hidden');
    document.getElementById('fb-thanks').classList.remove('hidden');
    document.getElementById('fb-thanks-stars').textContent = '★'.repeat(fbRating);
    try { Audio.star(); } catch (e) {}
    fbConfetti();
  } catch (e) {
    err.textContent = navigator.onLine === false ? '📶 You are offline. Please try again later.' : `⚠️ ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

// ── Reviews wall ──
let fbWallData = null, fbWallFilter = 'all';

function showFeedbackWall() {
  document.getElementById('fb-wall-overlay').classList.remove('hidden');
  loadFeedbackWall();
}
function closeFeedbackWall() {
  document.getElementById('fb-wall-overlay').classList.add('hidden');
}
function openFeedbackFormFromWall() { showFeedbackForm(null, true); }

async function loadFeedbackWall() {
  const list = document.getElementById('fb-list');
  if (!fbWallData) list.innerHTML = '<div class="fb-empty">Loading reviews…</div>';
  try {
    const res = await fetch('/api/reviews');
    if (!res.ok) throw new Error();
    fbWallData = await res.json();
    renderFeedbackWall();
  } catch (e) {
    list.innerHTML = '<div class="fb-empty">📶 Could not load reviews. Check your connection.</div>';
  }
}

function fbStars(n) {
  return `<span class="fb-stars-on">${'★'.repeat(n)}</span><span class="fb-stars-off">${'★'.repeat(5 - n)}</span>`;
}

function renderFeedbackWall() {
  const { reviews, summary } = fbWallData;
  const max = Math.max(1, ...summary.dist);
  document.getElementById('fb-summary').innerHTML = summary.count ? `
    <div class="fb-avg">
      <div class="fb-avg-num">${summary.average.toFixed(1)}</div>
      <div class="fb-avg-stars">${fbStars(Math.round(summary.average))}</div>
      <div class="fb-avg-count">${summary.count} review${summary.count === 1 ? '' : 's'}</div>
    </div>
    <div class="fb-bars">${[5, 4, 3, 2, 1].map(s => `
      <div class="fb-bar-row"><span>${s}★</span><div class="fb-bar"><div style="width:${(summary.dist[s - 1] / max) * 100}%"></div></div><span>${summary.dist[s - 1]}</span></div>`).join('')}
    </div>` : '';

  const counts = { all: reviews.length };
  for (const r of reviews) counts[r.role] = (counts[r.role] || 0) + 1;
  document.getElementById('fb-filter').innerHTML = [['all', '✨ All'], ...Object.entries(FB_ROLES).map(([id, r]) => [id, `${r.icon} ${r.label}s`])]
    .filter(([id]) => id === 'all' || counts[id])
    .map(([id, label]) => `<button type="button" class="fb-chip${fbWallFilter === id ? ' on' : ''}" onclick="fbSetFilter('${id}')">${label} <b>${counts[id] || 0}</b></button>`).join('');

  const teacher = typeof guruToken === 'function' && !!guruToken();
  const shown = reviews.filter(r => fbWallFilter === 'all' || r.role === fbWallFilter);
  document.getElementById('fb-list').innerHTML = shown.length ? shown.map(r => {
    const role = FB_ROLES[r.role] || FB_ROLES.public;
    const tags = (r.tags || []).map(t => FB_TAGS.find(x => x[0] === t)?.[1]).filter(Boolean);
    const date = new Date(r.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
    return `<div class="fb-review">
      <div class="fb-review-head">
        <div class="fb-avatar">${role.icon}</div>
        <div class="fb-who">
          <div class="fb-name">${esc(r.name)}</div>
          <div class="fb-role">${role.label}${r.organisation ? ' · ' + esc(r.organisation) : ''}</div>
        </div>
        <div class="fb-review-stars" aria-label="${r.rating} out of 5 stars">${fbStars(r.rating)}</div>
      </div>
      ${tags.length ? `<div class="fb-review-tags">${tags.map(t => `<span>${t}</span>`).join('')}</div>` : ''}
      ${r.comment ? `<p class="fb-comment">${esc(r.comment)}</p>` : ''}
      <div class="fb-date">${date}${teacher ? ` <button class="fb-del" onclick="fbDelete(${Number(r.id)})" title="Remove review">🗑 Remove</button>` : ''}</div>
    </div>`;
  }).join('') : `<div class="fb-empty">${reviews.length ? 'No reviews from this group yet.' : 'No reviews yet. Be the first! ✨'}</div>`;
}

function fbSetFilter(id) { fbWallFilter = id; renderFeedbackWall(); }

async function fbDelete(id) {
  if (!confirm('Remove this review for everyone?')) return;
  try {
    const res = await fetch(`/api/teacher/reviews/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${guruToken()}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not remove it.');
    showToast('🗑 Review removed');
    loadFeedbackWall();
  } catch (e) { showToast(`⚠️ ${e.message}`); }
}

document.addEventListener('DOMContentLoaded', () => {
  const stars = document.getElementById('fb-stars');
  stars.innerHTML = [1, 2, 3, 4, 5].map(v =>
    `<button type="button" class="fb-star" role="radio" aria-label="${v} star${v > 1 ? 's' : ''}" data-v="${v}" style="--i:${v}">★</button>`).join('');
  stars.addEventListener('click', e => { const b = e.target.closest('.fb-star'); if (b) fbPickRating(Number(b.dataset.v)); });
  stars.addEventListener('mouseover', e => { const b = e.target.closest('.fb-star'); if (b) fbRenderStars(Number(b.dataset.v)); });
  stars.addEventListener('mouseleave', () => fbRenderStars(0));
  document.getElementById('fb-comment').addEventListener('input', e => {
    document.getElementById('fb-count').textContent = `${e.target.value.length}/500`;
  });
});
