// ══════════════════════════════════════════════
//  CHARACTER ART
//  The same drawings are used in gameplay (canvas) and in the story scenes,
//  so Grammo, the Errorlings and every boss look identical everywhere.
// ══════════════════════════════════════════════
const CHAR_INK = '#24123a';

function charEllipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}
// Eyes close for a moment every few seconds
function charBlinking(t, seed = 0) { return ((t / 1000 + seed) % 3.7) < 0.13; }

// A friendly cartoon eye: white, ink outline, pupil looking left/right, shine dot
function charEye(ctx, x, y, rx, ry, look, t, seed, pupil = CHAR_INK) {
  if (charBlinking(t, seed)) {
    ctx.strokeStyle = CHAR_INK; ctx.lineWidth = Math.max(1.6, ry * 0.32); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - rx, y); ctx.quadraticCurveTo(x, y + ry * 0.45, x + rx, y); ctx.stroke();
    return;
  }
  charEllipse(ctx, x, y, rx, ry, '#fff');
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = Math.max(1.2, rx * 0.22); ctx.stroke();
  const px = x + look * rx * 0.35, py = y + ry * 0.12;
  charEllipse(ctx, px, py, rx * 0.56, ry * 0.58, pupil);
  charEllipse(ctx, px - rx * 0.2, py - ry * 0.25, rx * 0.2, rx * 0.2, '#fff');
}

// ── GRAMMO ── the player's ball. Drawn centred on 0,0 with radius r.
// mood: 'happy' | 'excited' | 'hurt';  talk: 0..1 opens the mouth;  look: -1..1
function drawGrammoFace(ctx, r, { mood = 'happy', look = 0, t = performance.now(), talk = 0 } = {}) {
  const s = r / 22;
  ctx.save(); ctx.scale(s, s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  charEllipse(ctx, -13, 6, 4.4, 2.8, 'rgba(255,110,140,.5)');
  charEllipse(ctx, 13, 6, 4.4, 2.8, 'rgba(255,110,140,.5)');
  if (mood === 'hurt') {
    ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-11, -8); ctx.lineTo(-4, -4); ctx.lineTo(-11, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, -8); ctx.lineTo(4, -4); ctx.lineTo(11, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 11, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath(); ctx.moveTo(14, -12); ctx.quadraticCurveTo(19, -4, 14, -2); ctx.quadraticCurveTo(9, -4, 14, -12); ctx.fill();
  } else {
    charEye(ctx, -7, -4, 4.6, 5.6, look, t, 0);
    charEye(ctx, 7, -4, 4.6, 5.6, look, t, 0);
    const open = talk;
    if (mood === 'excited' && open < 0.25) {
      // Big open grin
      ctx.beginPath(); ctx.moveTo(-7, 3); ctx.quadraticCurveTo(0, 4, 7, 3); ctx.quadraticCurveTo(6, 13, 0, 13); ctx.quadraticCurveTo(-6, 13, -7, 3); ctx.closePath();
      ctx.fillStyle = '#7a1f2b'; ctx.fill();
      ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 1.8; ctx.stroke();
      charEllipse(ctx, 0, 10.5, 3.6, 2, '#ff8fa3');
    } else if (open > 0.06) {
      const mh = 2 + open * 5;
      ctx.beginPath(); ctx.ellipse(0, 6 + mh * 0.4, 5.2, mh, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7a1f2b'; ctx.fill();
      ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 1.6; ctx.stroke();
      charEllipse(ctx, 0, 6 + mh * 0.85, 3, Math.max(1, mh * 0.35), '#ff8fa3');
    } else {
      ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 4, 6.5, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
    }
  }
  ctx.restore();
}

// Full Grammo ball (body + face), centred on 0,0. cols = [light, mid, dark]
function drawGrammoBall(ctx, r, cols, opts = {}) {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, cols[0]); g.addColorStop(0.6, cols[1]); g.addColorStop(1, cols[2]);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  drawGrammoFace(ctx, r, opts);
  charEllipse(ctx, -r * 0.34, -r * 0.42, r * 0.26, r * 0.16, 'rgba(255,255,255,.35)');
  ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(36,18,58,.55)'; ctx.lineWidth = Math.max(1.5, r * 0.07); ctx.stroke();
}

// ── ERRORLINGS ── Baron's little blob minions (the enemies that carry answers).
// Drawn in a w×h box from 0,0. type: 'ground' | 'flyer' | 'chaser'
const ERRORLING_COLORS = {
  ground:  ['#FFB067', '#E8682A'],
  correct: ['#6FA8FF', '#2F5FD0'],
  flyer:   ['#B48CFF', '#6B3FD1'],
  chaser:  ['#FF7A7A', '#C42A3A'],
};
function drawErrorling(ctx, w, h, { type = 'ground', friendly = false, look = 1, t = performance.now(), seed = 0, label = '' } = {}) {
  const [c0, c1] = ERRORLING_COLORS[type === 'ground' && friendly ? 'correct' : type] || ERRORLING_COLORS.ground;
  const step = Math.sin(t / 120 + seed * 3);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Wings (flyer) or feet (walkers)
  if (type === 'flyer') {
    const flap = Math.sin(t / 70 + seed) * 0.5;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(w / 2 + side * w * 0.42, h * 0.42); ctx.rotate(side * (0.35 + flap)); ctx.scale(side, 1);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(w * 0.32, -h * 0.28, w * 0.42, h * 0.06);
      ctx.quadraticCurveTo(w * 0.28, 0, w * 0.22, h * 0.14); ctx.quadraticCurveTo(w * 0.12, h * 0.04, 0, h * 0.12); ctx.closePath();
      ctx.fillStyle = c1; ctx.fill(); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
  } else {
    for (const [fx, ph] of [[0.3, 1], [0.7, -1]]) {
      charEllipse(ctx, w * fx, h * 0.97 - Math.max(0, step * ph) * 3, w * 0.13, h * 0.07, c1);
      ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  // Chaser spikes
  if (type === 'chaser') {
    ctx.fillStyle = c1;
    for (let i = 0; i < 3; i++) {
      const x = w * (0.32 + i * 0.18);
      ctx.beginPath(); ctx.moveTo(x - w * 0.08, h * 0.16); ctx.lineTo(x, -h * 0.04); ctx.lineTo(x + w * 0.08, h * 0.16); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  // Gumdrop body with a wobbly squash
  const sq = 1 + Math.sin(t / 260 + seed) * 0.03;
  ctx.save(); ctx.translate(w / 2, h * 0.92); ctx.scale(1 / sq, sq);
  ctx.beginPath();
  ctx.moveTo(-w * 0.46, 0);
  ctx.bezierCurveTo(-w * 0.52, -h * 0.55, -w * 0.3, -h * 0.86, 0, -h * 0.86);
  ctx.bezierCurveTo(w * 0.3, -h * 0.86, w * 0.52, -h * 0.55, w * 0.46, 0);
  ctx.quadraticCurveTo(0, h * 0.08, -w * 0.46, 0);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -h * 0.86, 0, 0);
  bg.addColorStop(0, c0); bg.addColorStop(1, c1);
  ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 2.4; ctx.stroke();
  charEllipse(ctx, -w * 0.18, -h * 0.66, w * 0.12, h * 0.06, 'rgba(255,255,255,.35)');
  ctx.restore();
  // Face
  const ey = h * 0.36, er = w * 0.11;
  charEye(ctx, w * 0.36, ey, er, er * 1.15, look, t, seed);
  charEye(ctx, w * 0.64, ey, er, er * 1.15, look, t, seed);
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 2.2;
  if (friendly) {
    ctx.beginPath(); ctx.arc(w / 2, h * 0.5, w * 0.1, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    charEllipse(ctx, w * 0.24, h * 0.5, w * 0.06, h * 0.035, 'rgba(255,255,255,.35)');
    charEllipse(ctx, w * 0.76, h * 0.5, w * 0.06, h * 0.035, 'rgba(255,255,255,.35)');
  } else {
    ctx.beginPath(); ctx.moveTo(w * 0.25, ey - er * 1.6); ctx.lineTo(w * 0.44, ey - er * 1.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.75, ey - er * 1.6); ctx.lineTo(w * 0.56, ey - er * 1.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.38, h * 0.55); ctx.quadraticCurveTo(w / 2, h * 0.49, w * 0.62, h * 0.55); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(w * 0.44, h * 0.535); ctx.lineTo(w * 0.47, h * 0.6); ctx.lineTo(w * 0.5, h * 0.525); ctx.closePath(); ctx.fill();
  }
  // Answer word on a readable badge
  if (label) {
    const fs = Math.min(13, w * 0.24);
    ctx.font = `bold ${fs}px 'Fredoka One', cursive`;
    const tw = Math.min(w * 1.25, ctx.measureText(label).width + 10);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath(); roundRect(ctx, w / 2 - tw / 2, h * 0.66, tw, fs + 6, (fs + 6) / 2); ctx.fill();
    ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = CHAR_INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h * 0.66 + (fs + 6) / 2 + 0.5, w * 1.2);
  }
}

// ── BOSSES ── each world has its own. Drawn in a w×h box from 0,0.
// opts: mood 'normal' | 'charge' | 'pain' | 'defeated', talk 0..1, phase 1..3, look -1..1, t
const BOSSES = {
  jumble: { name: 'King Jumble',      world: 'Playground' },
  rhino:  { name: 'Rumble the Rhino', world: 'Safari' },
  robo:   { name: 'Robo Rush',        world: 'City' },
  baron:  { name: 'Baron Von Error',  world: 'Space' },
};

// Shared boss face pieces (box units 0..100)
function bossEyes(ctx, mood, look, t, lx, rx, y, r, seed) {
  ctx.lineCap = 'round';
  if (mood === 'pain' || mood === 'defeated') {
    ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 4;
    for (const x of [lx, rx]) {
      ctx.beginPath(); ctx.moveTo(x - r * 0.8, y - r * 0.8); ctx.lineTo(x + r * 0.8, y + r * 0.8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + r * 0.8, y - r * 0.8); ctx.lineTo(x - r * 0.8, y + r * 0.8); ctx.stroke();
    }
    return;
  }
  const squint = mood === 'charge' ? 0.55 : 1;
  charEye(ctx, lx, y, r, r * 1.1 * squint, look, t, seed);
  charEye(ctx, rx, y, r, r * 1.1 * squint, look, t, seed);
  // Angry brows
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = mood === 'charge' ? 6 : 4.5;
  ctx.beginPath(); ctx.moveTo(lx - r * 1.2, y - r * 1.7); ctx.lineTo(lx + r * 0.9, y - r * 1.05); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rx + r * 1.2, y - r * 1.7); ctx.lineTo(rx - r * 0.9, y - r * 1.05); ctx.stroke();
}
function bossMouth(ctx, mood, talk, cx, y, mw) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (mood === 'pain' || mood === 'defeated') {
    ctx.beginPath(); ctx.ellipse(cx, y + 4, mw * 0.32, mw * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5a0e1e'; ctx.fill(); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3; ctx.stroke();
    return;
  }
  if (mood === 'charge') {
    ctx.beginPath(); roundRect(ctx, cx - mw / 2, y - 6, mw, 14, 5);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx - mw / 2 + (mw / 4) * i, y - 6); ctx.lineTo(cx - mw / 2 + (mw / 4) * i, y + 8); ctx.stroke(); }
    return;
  }
  // Wicked grin that opens while talking
  const open = 4 + talk * 12;
  ctx.beginPath(); ctx.moveTo(cx - mw / 2, y - 2);
  ctx.quadraticCurveTo(cx, y + open + 6, cx + mw / 2, y - 2);
  ctx.quadraticCurveTo(cx, y + 2 + talk * 3, cx - mw / 2, y - 2);
  ctx.closePath(); ctx.fillStyle = '#5a0e1e'; ctx.fill();
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const side of [-1, 1]) {
    const fx = cx + side * mw * 0.22;
    ctx.beginPath(); ctx.moveTo(fx - 3, y); ctx.lineTo(fx, y + 6); ctx.lineTo(fx + 3, y); ctx.closePath(); ctx.fill();
  }
}
// Colours darken as the boss loses health
function bossShade(cols, phase) { return cols[Math.min(2, Math.max(0, (phase || 1) - 1))]; }

function drawKingJumble(ctx, o) {
  const [c0, c1] = bossShade([['#F2C27B', '#C98B3A'], ['#E8A85E', '#A86A24'], ['#D98A45', '#7E4614']], o.phase);
  // Paper crown
  ctx.beginPath(); ctx.moveTo(22, 14); ctx.lineTo(22, -10); ctx.lineTo(34, 2); ctx.lineTo(50, -16); ctx.lineTo(66, 2); ctx.lineTo(78, -10); ctx.lineTo(78, 14); ctx.closePath();
  ctx.fillStyle = '#FFD166'; ctx.fill(); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3; ctx.stroke();
  for (const [x, c] of [[34, '#EF476F'], [50, '#06D6A0'], [66, '#4A90D9']]) charEllipse(ctx, x, 6, 4, 4, c);
  // Toy block body
  const g = ctx.createLinearGradient(0, 10, 0, 100); g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.beginPath(); roundRect(ctx, 4, 10, 92, 88, 14); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.beginPath(); roundRect(ctx, 12, 18, 76, 72, 9); ctx.strokeStyle = 'rgba(36,18,58,.35)'; ctx.lineWidth = 2.5; ctx.stroke();
  // Painted letters in the corners
  ctx.font = "bold 15px 'Fredoka One', cursive"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [x, y, ch, c] of [[22, 30, 'A', '#EF476F'], [78, 30, 'B', '#4A90D9'], [22, 80, 'C', '#06D6A0'], [78, 80, '?', '#8B5CF6']]) { ctx.fillStyle = c; ctx.fillText(ch, x, y); }
  bossEyes(ctx, o.mood, o.look, o.t, 38, 62, 46, 8, 1);
  bossMouth(ctx, o.mood, o.talk, 50, 70, 30);
}

function drawRhino(ctx, o) {
  const [c0, c1] = bossShade([['#AEB6C4', '#6F7A8C'], ['#9AA3B4', '#5A6476'], ['#848DA0', '#3F4757']], o.phase);
  // Ears
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(50 + side * 34, 18); ctx.rotate(side * 0.5);
    charEllipse(ctx, 0, 0, 9, 14, c1); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3; ctx.stroke();
    charEllipse(ctx, 0, 2, 4.5, 8, '#E8A6B4');
    ctx.restore();
  }
  // Head
  const g = ctx.createLinearGradient(0, 8, 0, 100); g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.beginPath(); ctx.ellipse(50, 56, 46, 42, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3.5; ctx.stroke();
  // Snout
  charEllipse(ctx, 50, 78, 28, 18, c0); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3; ctx.stroke();
  charEllipse(ctx, 41, 77, 3.5, 5, CHAR_INK); charEllipse(ctx, 59, 77, 3.5, 5, CHAR_INK);
  // Big horn and small horn
  ctx.beginPath(); ctx.moveTo(40, 64); ctx.quadraticCurveTo(46, 30, 56, 18); ctx.quadraticCurveTo(58, 44, 60, 64); ctx.closePath();
  ctx.fillStyle = '#FFF1D6'; ctx.fill(); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3; ctx.stroke();
  bossEyes(ctx, o.mood, o.look, o.t, 30, 70, 44, 8, 2);
  bossMouth(ctx, o.mood, o.talk, 50, 90, 22);
}

function drawRobo(ctx, o) {
  const [c0, c1] = bossShade([['#5EC8E5', '#2A7FA8'], ['#4BB0CF', '#1F6A8D'], ['#3A93B0', '#164E68']], o.phase);
  // Antenna with blinking light
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(50, 12); ctx.lineTo(50, -6); ctx.stroke();
  const on = Math.floor(o.t / 400) % 2 === 0;
  charEllipse(ctx, 50, -10, 6, 6, on ? '#FF4D6D' : '#7a1f2b'); ctx.stroke();
  // Body
  const g = ctx.createLinearGradient(0, 10, 0, 100); g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.beginPath(); roundRect(ctx, 6, 12, 88, 86, 16); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3.5; ctx.stroke();
  // Bolts
  for (const [x, y] of [[14, 20], [86, 20], [14, 90], [86, 90]]) charEllipse(ctx, x, y, 2.5, 2.5, 'rgba(36,18,58,.5)');
  // Screen face
  ctx.beginPath(); roundRect(ctx, 16, 24, 68, 52, 10); ctx.fillStyle = '#10213a'; ctx.fill();
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3; ctx.stroke();
  // Traffic-light side panel
  const lit = Math.floor(o.t / 700) % 3;
  ['#FF4D6D', '#FFD166', '#06D6A0'].forEach((c, i) => {
    charEllipse(ctx, 50 + (i - 1) * 16, 88, 5, 5, i === lit ? c : 'rgba(255,255,255,.18)');
    ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 2; ctx.stroke();
  });
  // Digital eyes and mouth on the screen
  const glow = '#7CF7FF';
  ctx.fillStyle = glow; ctx.strokeStyle = glow; ctx.lineCap = 'round';
  if (o.mood === 'pain' || o.mood === 'defeated') {
    ctx.lineWidth = 4;
    for (const x of [36, 64]) {
      ctx.beginPath(); ctx.moveTo(x - 6, 38); ctx.lineTo(x + 6, 50); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 6, 38); ctx.lineTo(x - 6, 50); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(50, 66, 6, 0, Math.PI * 2); ctx.stroke();
  } else {
    const blink = charBlinking(o.t, 3);
    const eh = blink ? 2 : o.mood === 'charge' ? 5 : 11;
    for (const x of [36, 64]) { ctx.beginPath(); roundRect(ctx, x - 7 + o.look * 2, 44 - eh / 2, 14, eh, 3); ctx.fill(); }
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(26, 34); ctx.lineTo(44, 38); ctx.moveTo(74, 34); ctx.lineTo(56, 38); ctx.stroke();
    // Zig-zag "sound wave" mouth that grows while talking
    const amp = 2 + o.talk * 6 + (o.mood === 'charge' ? 3 : 0);
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(34, 64);
    for (let i = 1; i <= 8; i++) ctx.lineTo(34 + i * 4, 64 + (i % 2 ? -amp : amp));
    ctx.stroke();
  }
}

function drawBaron(ctx, o) {
  const [c0, c1] = bossShade([['#C0264B', '#6B0F2A'], ['#A3123A', '#4A0818'], ['#7A0020', '#1A0008']], o.phase);
  // Bat wings
  const flap = Math.sin(o.t / 160) * 0.18;
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(50 + side * 40, 46); ctx.rotate(side * flap); ctx.scale(side, 1);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(22, -26, 34, -12); ctx.quadraticCurveTo(26, -6, 30, 6);
    ctx.quadraticCurveTo(20, 2, 18, 14); ctx.quadraticCurveTo(10, 6, 0, 16); ctx.closePath();
    ctx.fillStyle = '#3B0A2A'; ctx.fill(); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  // Horns
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(50 + side * 22, 18); ctx.quadraticCurveTo(50 + side * 44, 8, 50 + side * 40, -10);
    ctx.quadraticCurveTo(50 + side * 34, 6, 50 + side * 12, 14); ctx.closePath();
    ctx.fillStyle = '#FFF1D6'; ctx.fill(); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3; ctx.stroke();
  }
  // Body
  const g = ctx.createLinearGradient(0, 10, 0, 100); g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.beginPath(); roundRect(ctx, 8, 12, 84, 86, 38); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 3.5; ctx.stroke();
  charEllipse(ctx, 34, 26, 12, 6, 'rgba(255,255,255,.18)');
  // Top hat, tilted
  ctx.save(); ctx.translate(52, 14); ctx.rotate(0.12);
  ctx.beginPath(); roundRect(ctx, -22, -4, 44, 8, 3); ctx.fillStyle = '#1a1026'; ctx.fill(); ctx.strokeStyle = CHAR_INK; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath(); roundRect(ctx, -14, -28, 28, 26, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8B5CF6'; ctx.fillRect(-14, -9, 28, 5);
  ctx.restore();
  bossEyes(ctx, o.mood, o.look, o.t, 34, 66, 46, 8.5, 4);
  // Gold monocle on the right eye
  if (o.mood !== 'pain' && o.mood !== 'defeated') {
    ctx.beginPath(); ctx.arc(66, 46, 12.5, 0, Math.PI * 2); ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(77, 52); ctx.quadraticCurveTo(84, 66, 80, 78); ctx.strokeStyle = '#E8B84A'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // Curly moustache
  ctx.fillStyle = '#2a0f1f';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(50, 62);
    ctx.quadraticCurveTo(50 + side * 14, 56, 50 + side * 24, 64);
    ctx.quadraticCurveTo(50 + side * 28, 56, 50 + side * 22, 54);
    ctx.quadraticCurveTo(50 + side * 30, 54, 50 + side * 28, 66);
    ctx.quadraticCurveTo(50 + side * 14, 72, 50, 66); ctx.closePath(); ctx.fill();
  }
  bossMouth(ctx, o.mood, o.talk, 50, 78, 28);
}

const BOSS_DRAW = { jumble: drawKingJumble, rhino: drawRhino, robo: drawRobo, baron: drawBaron };

function drawBoss(ctx, kind, w, h, opts = {}) {
  const o = { mood: 'normal', talk: 0, phase: 1, look: 0, t: performance.now(), ...opts };
  ctx.save();
  ctx.scale(w / 100, h / 100);
  (BOSS_DRAW[kind] || drawBaron)(ctx, o);
  ctx.restore();
}
