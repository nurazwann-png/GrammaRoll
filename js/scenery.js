// ══════════════════════════════════════════════
//  SCENERY: per-world backgrounds and ground art
// ══════════════════════════════════════════════
// Each world has a theme. Background layers are painted once into off-screen canvases
// (tiles that repeat seamlessly) and scrolled at different speeds for depth.
// Worlds without a theme fall back to the original drawing.

const WORLD_GROUND_Y = 420; // must match GH in buildLevel
const SCENE_TILE_W = 1400;
const SCENE_TILE_H = 380;

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLayerCanvas(paint) {
  const c = document.createElement('canvas');
  c.width = SCENE_TILE_W;
  c.height = SCENE_TILE_H;
  paint(c.getContext('2d'), SCENE_TILE_W, SCENE_TILE_H);
  return c;
}

// Hill outline that repeats exactly every tile width (integer wave counts)
function hillY(x, base, waves) {
  return waves.reduce((y, [count, amp, phase]) => y + Math.sin((x / SCENE_TILE_W) * Math.PI * 2 * count + phase) * amp, base);
}
function fillHills(c, W, H, base, waves, fill) {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) c.lineTo(x, hillY(x, base, waves));
  c.lineTo(W, H);
  c.closePath();
  c.fill();
}

function drawRoundTree(c, x, groundY, size, trunk, leaves) {
  c.fillStyle = trunk;
  c.fillRect(x - size * 0.09, groundY - size * 0.9, size * 0.18, size * 0.9);
  c.fillStyle = leaves[0];
  c.beginPath();
  c.arc(x, groundY - size * 1.05, size * 0.5, 0, Math.PI * 2);
  c.arc(x - size * 0.38, groundY - size * 0.82, size * 0.36, 0, Math.PI * 2);
  c.arc(x + size * 0.38, groundY - size * 0.82, size * 0.36, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = leaves[1];
  c.beginPath();
  c.arc(x - size * 0.14, groundY - size * 1.18, size * 0.22, 0, Math.PI * 2);
  c.fill();
}

// ── Playground pieces ──
function drawSwingSet(c, x, gy) {
  c.strokeStyle = '#D0574A'; c.lineWidth = 7; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x - 70, gy); c.lineTo(x - 50, gy - 95); c.lineTo(x - 30, gy);
  c.moveTo(x + 30, gy); c.lineTo(x + 50, gy - 95); c.lineTo(x + 70, gy);
  c.moveTo(x - 55, gy - 92); c.lineTo(x + 55, gy - 92);
  c.stroke();
  c.strokeStyle = 'rgba(80,80,90,0.8)'; c.lineWidth = 2;
  [[-22, -8], [18, 6]].forEach(([dx, sway]) => {
    c.beginPath();
    c.moveTo(x + dx - 8, gy - 92); c.lineTo(x + dx - 8 + sway, gy - 35);
    c.moveTo(x + dx + 8, gy - 92); c.lineTo(x + dx + 8 + sway, gy - 35);
    c.stroke();
    c.fillStyle = '#F2B84B';
    c.fillRect(x + dx - 12 + sway, gy - 37, 24, 6);
  });
}
function drawSlide(c, x, gy) {
  c.strokeStyle = '#3F7FD0'; c.lineWidth = 5;
  c.beginPath();
  c.moveTo(x - 40, gy); c.lineTo(x - 40, gy - 90);
  c.moveTo(x - 20, gy); c.lineTo(x - 20, gy - 90);
  for (let r = 1; r <= 5; r++) { c.moveTo(x - 40, gy - r * 16); c.lineTo(x - 20, gy - r * 16); }
  c.stroke();
  c.fillStyle = '#3F7FD0';
  c.fillRect(x - 46, gy - 96, 34, 8);
  c.strokeStyle = '#F2B84B'; c.lineWidth = 12; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x - 16, gy - 90);
  c.bezierCurveTo(x + 20, gy - 80, x + 30, gy - 10, x + 75, gy - 6);
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x - 14, gy - 93);
  c.bezierCurveTo(x + 20, gy - 84, x + 30, gy - 15, x + 74, gy - 11);
  c.stroke();
}
function drawSeeSaw(c, x, gy) {
  c.fillStyle = '#8E5BC2';
  c.beginPath(); c.moveTo(x - 14, gy); c.lineTo(x, gy - 26); c.lineTo(x + 14, gy); c.closePath(); c.fill();
  c.save(); c.translate(x, gy - 26); c.rotate(-0.22);
  c.fillStyle = '#4FB0A5'; c.fillRect(-70, -5, 140, 10);
  c.fillStyle = '#E8604C'; c.fillRect(-66, -14, 8, 10); c.fillRect(58, -14, 8, 10);
  c.restore();
}
function drawPicketFence(c, x0, x1, gy) {
  c.fillStyle = '#FFF8EC';
  c.fillRect(x0, gy - 26, x1 - x0, 5);
  c.fillRect(x0, gy - 12, x1 - x0, 5);
  for (let x = x0; x < x1; x += 16) {
    c.beginPath();
    c.moveTo(x, gy); c.lineTo(x, gy - 34); c.lineTo(x + 5, gy - 40); c.lineTo(x + 10, gy - 34); c.lineTo(x + 10, gy);
    c.closePath(); c.fill();
  }
}

const PLAYGROUND_THEME = {
  id: 'playground',
  sky: ['#6EC3F2', '#A9E0FA', '#FFF1D2'],
  sun: { x: 0.8, y: 90, r: 46, color: '#FFE38A' },
  belowGround: ['#4C9F57', '#2E6B3A'],
  pit: [10, 30, 20],
  ambient: drawButterflies,
  layers: [
    { factor: 0.1, y: -40, paint(c, W, H) {
      fillHills(c, W, H, H * 0.55, [[2, 26, 0], [5, 12, 1.3]], '#BFE6CB');
      const r = seededRandom(11);
      for (let i = 0; i < 14; i++) {
        const x = r() * W;
        drawRoundTree(c, x, hillY(x, H * 0.55, [[2, 26, 0], [5, 12, 1.3]]) + 6, 26 + r() * 14, '#9BBF9F', ['#A9D9B4', '#B9E3C2']);
      }
    }},
    { factor: 0.3, y: 0, paint(c, W, H) {
      const waves = [[3, 18, 0.7], [7, 6, 2]];
      fillHills(c, W, H, H * 0.7, waves, '#86CC90');
      const gy = x => hillY(x, H * 0.7, waves) + 4;
      drawRoundTree(c, 120, gy(120), 70, '#8A5A35', ['#4FAE5E', '#6CC57A']);
      drawSwingSet(c, 330, gy(330));
      drawRoundTree(c, 560, gy(560), 85, '#8A5A35', ['#45A456', '#62BE72']);
      drawSlide(c, 760, gy(760));
      drawPicketFence(c, 900, 1060, gy(980));
      drawSeeSaw(c, 1170, gy(1170));
      drawRoundTree(c, 1320, gy(1320), 64, '#8A5A35', ['#4FAE5E', '#6CC57A']);
      c.fillStyle = 'rgba(255,255,255,0.12)'; // light haze for depth
      c.fillRect(0, 0, W, H);
    }},
    { factor: 0.55, y: 40, paint(c, W, H) {
      const r = seededRandom(7);
      const base = H * 0.86;
      c.fillStyle = '#3F9B50';
      for (let x = -20; x < W + 40; x += 34 + r() * 20) {
        const rad = 22 + r() * 20;
        c.beginPath(); c.arc(x, base, rad, Math.PI, 0); c.fill();
      }
      c.fillRect(0, base, W, H - base);
      const petals = ['#FF8FB1', '#FFE066', '#FFFFFF', '#C7A6FF'];
      for (let i = 0; i < 70; i++) {
        const x = r() * W, y = base - 4 - r() * 22;
        c.fillStyle = petals[(r() * petals.length) | 0];
        c.beginPath(); c.arc(x, y, 2.5 + r() * 1.5, 0, Math.PI * 2); c.fill();
      }
    }},
  ],
  ground: drawGrassGround,
  plank: drawWoodPlank,
};

// ── Safari pieces ──
function drawAcacia(c, x, gy, size, trunk, leaves) {
  c.strokeStyle = trunk; c.lineCap = 'round';
  c.lineWidth = size * 0.07;
  c.beginPath();
  c.moveTo(x, gy); c.lineTo(x + size * 0.05, gy - size * 0.55);
  c.lineTo(x - size * 0.25, gy - size * 0.85);
  c.moveTo(x + size * 0.05, gy - size * 0.55); c.lineTo(x + size * 0.3, gy - size * 0.82);
  c.stroke();
  c.fillStyle = leaves;
  c.beginPath(); c.ellipse(x + size * 0.02, gy - size * 0.9, size * 0.6, size * 0.13, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(x - size * 0.25, gy - size * 0.95, size * 0.3, size * 0.09, 0, 0, Math.PI * 2); c.fill();
}
function drawGiraffe(c, x, gy, s, col) {
  c.fillStyle = col; c.strokeStyle = col; c.lineCap = 'round';
  c.beginPath(); c.ellipse(x, gy - 46 * s, 22 * s, 11 * s, 0, 0, Math.PI * 2); c.fill();
  c.lineWidth = 5 * s;
  c.beginPath();
  [[-15, -8], [-7, -2], [9, 2], [16, 8]].forEach(([dx, sp]) => { c.moveTo(x + dx * s, gy - 42 * s); c.lineTo(x + (dx + sp * 0.2) * s, gy); });
  c.stroke();
  c.lineWidth = 7 * s;
  c.beginPath(); c.moveTo(x + 16 * s, gy - 50 * s); c.lineTo(x + 30 * s, gy - 98 * s); c.stroke();
  c.beginPath(); c.ellipse(x + 35 * s, gy - 100 * s, 9 * s, 5 * s, 0.3, 0, Math.PI * 2); c.fill();
  c.lineWidth = 2 * s;
  c.beginPath(); c.moveTo(x + 29 * s, gy - 103 * s); c.lineTo(x + 28 * s, gy - 111 * s); c.stroke();
}
function drawElephant(c, x, gy, s, col) {
  c.fillStyle = col;
  c.beginPath(); c.ellipse(x, gy - 34 * s, 34 * s, 22 * s, 0, 0, Math.PI * 2); c.fill();
  [-22, -10, 10, 22].forEach(dx => c.fillRect(x + dx * s - 5 * s, gy - 20 * s, 10 * s, 20 * s));
  c.beginPath(); c.ellipse(x - 34 * s, gy - 40 * s, 15 * s, 14 * s, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(x - 26 * s, gy - 42 * s, 12 * s, 15 * s, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = col; c.lineWidth = 6 * s; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - 46 * s, gy - 38 * s); c.quadraticCurveTo(x - 54 * s, gy - 16 * s, x - 46 * s, gy - 6 * s); c.stroke();
}
function drawSavannaGrass(c, W, base, r, colours) {
  for (let x = 0; x < W; x += 3) {
    const h = 10 + r() * 22;
    c.strokeStyle = colours[(r() * colours.length) | 0];
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, base + 4); c.quadraticCurveTo(x + 2, base - h * 0.5, x + (r() - 0.5) * 8, base - h); c.stroke();
  }
}

const SAFARI_THEME = {
  id: 'safari',
  sky: ['#F38B5A', '#FFC984', '#FFEDBE'],
  sun: { x: 0.72, y: 150, r: 62, color: '#FFB04A' },
  belowGround: ['#8B5A2B', '#3E2410'],
  pit: [40, 20, 6],
  cloudAlpha: 0.55,
  layers: [
    { factor: 0.1, y: -30, paint(c, W, H) {
      const waves = [[2, 14, 0.4], [6, 6, 1]];
      // flat-topped mesas on the horizon
      c.fillStyle = '#E6A877';
      [[90, 260, 70], [520, 200, 55], [930, 300, 80]].forEach(([x, w, h]) => {
        c.beginPath(); c.moveTo(x, H * 0.62); c.lineTo(x + 30, H * 0.62 - h); c.lineTo(x + w - 30, H * 0.62 - h); c.lineTo(x + w, H * 0.62); c.fill();
      });
      fillHills(c, W, H, H * 0.62, waves, '#DDA06A');
      const r = seededRandom(21);
      for (let i = 0; i < 9; i++) { const x = r() * W; drawAcacia(c, x, hillY(x, H * 0.62, waves) + 4, 40 + r() * 20, '#B9824F', '#C79257'); }
    }},
    { factor: 0.3, y: 0, paint(c, W, H) {
      const waves = [[3, 12, 1.1], [8, 4, 0.2]];
      fillHills(c, W, H, H * 0.74, waves, '#C9984C');
      const gy = x => hillY(x, H * 0.74, waves) + 3;
      drawAcacia(c, 140, gy(140), 150, '#5A3A1E', '#6E7F2E');
      drawGiraffe(c, 360, gy(360), 1.25, '#9A5F2C');
      drawElephant(c, 640, gy(640), 1.15, '#8A6A55');
      drawAcacia(c, 880, gy(880), 120, '#5A3A1E', '#748634');
      drawGiraffe(c, 1080, gy(1080), 0.95, '#9A5F2C');
      drawAcacia(c, 1290, gy(1290), 100, '#5A3A1E', '#6E7F2E');
      c.fillStyle = 'rgba(255,214,150,0.12)';
      c.fillRect(0, 0, W, H);
    }},
    { factor: 0.55, y: 40, paint(c, W, H) {
      const base = H * 0.88;
      c.fillStyle = '#9C8434';
      c.fillRect(0, base, W, H - base);
      drawSavannaGrass(c, W, base, seededRandom(5), ['#C9B04B', '#B39A3A', '#D8C16A', '#8E7A2C']);
    }},
  ],
  ground: drawRockyGround,
  plank: drawLog,
  ambient: drawBirds,
};

// ── City pieces ──
function drawBuilding(c, x, w, h, gy, body, windowLit, r) {
  c.fillStyle = body;
  c.fillRect(x, gy - h, w, h);
  const cols = Math.max(2, Math.floor(w / 18)), rows = Math.floor((h - 16) / 22);
  const cw = w / cols;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    c.fillStyle = r() < 0.55 ? windowLit : 'rgba(0,0,0,0.25)';
    c.fillRect(x + i * cw + cw * 0.25, gy - h + 12 + j * 22, cw * 0.5, 11);
  }
}
function drawTwinTowers(c, x, gy, body, lit) {
  [x, x + 92].forEach(tx => {
    const tiers = [[60, 150], [50, 60], [40, 45], [28, 35], [16, 30]];
    let y = gy;
    tiers.forEach(([w, h]) => { c.fillStyle = body; c.fillRect(tx - w / 2, y - h, w, h); y -= h; });
    c.fillRect(tx - 2, y - 45, 4, 45);
    c.fillStyle = lit;
    for (let j = gy - 20; j > y; j -= 12) c.fillRect(tx - 18, j, 36, 3);
  });
  c.fillStyle = body;
  c.fillRect(x + 25, gy - 175, 42, 10); // skybridge
}
function drawStreetLamp(c, x, gy) {
  c.strokeStyle = '#2A2F45'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(x, gy); c.lineTo(x, gy - 70); c.quadraticCurveTo(x, gy - 80, x + 14, gy - 80); c.stroke();
  const g = c.createRadialGradient(x + 16, gy - 76, 1, x + 16, gy - 76, 40);
  g.addColorStop(0, 'rgba(255,230,150,0.9)'); g.addColorStop(1, 'rgba(255,230,150,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x + 16, gy - 76, 40, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#FFE9A8'; c.beginPath(); c.arc(x + 16, gy - 75, 5, 0, Math.PI * 2); c.fill();
}

const CITY_THEME = {
  id: 'city',
  sky: ['#26285E', '#7B4C9C', '#F4A07E'],
  sun: { x: 0.18, y: 175, r: 50, color: '#FFB79A' },
  belowGround: ['#1C1A38', '#08071A'],
  pit: [8, 6, 22],
  cloudAlpha: 0.22,
  stars: true,
  layers: [
    { factor: 0.1, y: -20, paint(c, W, H) {
      const r = seededRandom(31);
      const gy = H * 0.66;
      for (let x = 0; x < W; ) { const w = 40 + r() * 60; drawBuilding(c, x, w, 60 + r() * 120, gy, '#4B4387', 'rgba(255,224,140,0.35)', r); x += w + 4 + r() * 10; }
      drawTwinTowers(c, 620, gy, '#554C93', 'rgba(255,224,140,0.45)');
      c.fillStyle = '#4B4387'; c.fillRect(0, gy, W, H - gy);
    }},
    { factor: 0.3, y: 0, paint(c, W, H) {
      const r = seededRandom(41);
      const gy = H * 0.8;
      for (let x = 0; x < W; ) {
        const w = 60 + r() * 70, h = 90 + r() * 150;
        drawBuilding(c, x, w, h, gy, r() > 0.5 ? '#2D2A5C' : '#332E66', 'rgba(255,214,120,0.85)', r);
        if (r() > 0.6) { c.strokeStyle = '#2D2A5C'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + w / 2, gy - h); c.lineTo(x + w / 2, gy - h - 30); c.stroke(); c.fillStyle = '#FF4D4D'; c.beginPath(); c.arc(x + w / 2, gy - h - 31, 3, 0, Math.PI * 2); c.fill(); }
        x += w + 6 + r() * 14;
      }
      c.fillStyle = '#2D2A5C'; c.fillRect(0, gy, W, H - gy);
    }},
    { factor: 0.55, y: 40, paint(c, W, H) {
      const base = H * 0.88;
      const r = seededRandom(9);
      c.fillStyle = '#1F2B3A';
      for (let x = -10; x < W + 30; x += 26 + r() * 18) { c.beginPath(); c.arc(x, base, 16 + r() * 12, Math.PI, 0); c.fill(); }
      c.fillRect(0, base, W, H - base);
      for (let x = 60; x < W; x += 230) drawStreetLamp(c, x, base);
    }},
  ],
  ground: drawRooftopGround,
  plank: drawSteelBeam,
  ambient: drawCityLights,
};

// ── Safari / City ground pieces ──
function drawRockyGround(ctx, p, sx, sy) {
  const { w, h } = p;
  const r = seededRandom(Math.round(p.x * 5 + p.y));
  const dirt = ctx.createLinearGradient(sx, sy, sx, sy + h);
  dirt.addColorStop(0, '#C9824A'); dirt.addColorStop(1, '#8A4F27');
  ctx.fillStyle = dirt;
  ctx.beginPath(); roundRect(ctx, sx, sy + 3, w, h - 3, 8); ctx.fill();
  for (let i = 0; i < w / 30; i++) {
    const rx = sx + 8 + r() * (w - 16), ry = sy + 14 + r() * Math.max(4, h - 20);
    ctx.fillStyle = 'rgba(110,70,40,0.55)';
    ctx.beginPath(); ctx.ellipse(rx, ry, 5 + r() * 6, 3 + r() * 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,180,0.25)';
    ctx.beginPath(); ctx.ellipse(rx - 1, ry - 1, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#C8B054';
  ctx.beginPath(); roundRect(ctx, sx - 2, sy - 2, w + 4, 9, [8, 8, 2, 2]); ctx.fill();
  ctx.strokeStyle = '#A8913A'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = sx + 3; x < sx + w - 3; x += 5 + r() * 4) { const hh = 4 + r() * 9; ctx.moveTo(x, sy + 1); ctx.lineTo(x + (r() - 0.5) * 4, sy - hh); }
  ctx.stroke();
}
function drawLog(ctx, p, sx, sy) {
  const { w, h } = p;
  const bark = ctx.createLinearGradient(sx, sy, sx, sy + h);
  bark.addColorStop(0, '#9A6235'); bark.addColorStop(0.5, '#7A4A25'); bark.addColorStop(1, '#5B3519');
  ctx.fillStyle = bark;
  ctx.beginPath(); roundRect(ctx, sx + h / 2, sy, w - h, h, 2); ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,8,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = sx + h; x < sx + w - h; x += 14) { ctx.moveTo(x, sy + 4); ctx.lineTo(x + 8, sy + h - 4); }
  ctx.stroke();
  [sx + h / 2, sx + w - h / 2].forEach(cx => {
    ctx.fillStyle = '#D9A86A';
    ctx.beginPath(); ctx.ellipse(cx, sy + h / 2, h * 0.32, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#A06A35'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, sy + h / 2, h * 0.18, h * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
  });
}
function drawRooftopGround(ctx, p, sx, sy) {
  const { w, h } = p;
  const body = ctx.createLinearGradient(sx, sy, sx, sy + h);
  body.addColorStop(0, '#7C8199'); body.addColorStop(1, '#4D5168');
  ctx.fillStyle = body;
  ctx.beginPath(); roundRect(ctx, sx, sy, w, h, 4); ctx.fill();
  ctx.fillStyle = '#B9BED2';
  ctx.fillRect(sx, sy, w, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(sx, sy, w, 2);
  ctx.fillStyle = 'rgba(30,32,50,0.35)';
  for (let x = sx + 40; x < sx + w - 10; x += 60) ctx.fillRect(x, sy + 6, 2, h - 6);
  ctx.fillStyle = '#3B3F55';
  for (let x = sx + 10; x < sx + w - 6; x += 30) { ctx.beginPath(); ctx.arc(x, sy + 12, 1.8, 0, Math.PI * 2); ctx.fill(); }
}
function drawSteelBeam(ctx, p, sx, sy) {
  const { w, h } = p;
  ctx.fillStyle = '#E07B39';
  ctx.fillRect(sx, sy, w, 5);
  ctx.fillRect(sx, sy + h - 5, w, 5);
  ctx.fillRect(sx + w / 2 - 3, sy, 6, h);
  ctx.strokeStyle = '#E07B39'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = sx; x < sx + w - 10; x += 20) { ctx.moveTo(x, sy + h - 4); ctx.lineTo(x + 10, sy + 4); ctx.lineTo(x + 20, sy + h - 4); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(sx, sy, w, 1.5);
}

// ── Ambient details ──
function drawBirds(ctx, t, camX, groundY) {
  ctx.save();
  ctx.strokeStyle = 'rgba(70,40,30,0.75)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const span = CW + 300;
  for (let i = 0; i < 6; i++) {
    const x = ((i * 70 + t * 30 - camX * 0.15) % span + span) % span - 150;
    const y = groundY - 250 + (i % 3) * 18 + Math.sin(t + i) * 6;
    const flap = Math.sin(t * 8 + i) * 4;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - flap); ctx.quadraticCurveTo(x - 3, y - 3, x, y);
    ctx.quadraticCurveTo(x + 3, y - 3, x + 8, y - flap);
    ctx.stroke();
  }
  ctx.restore();
}
function drawCityLights(ctx, t, camX, groundY) {
  const span = CW + 400;
  const x = ((t * 22 - camX * 0.05) % span + span) % span - 200;
  const y = groundY - 330;
  ctx.save();
  ctx.fillStyle = 'rgba(230,230,255,0.6)';
  ctx.fillRect(x - 14, y - 2, 28, 4);
  ctx.fillRect(x - 4, y - 7, 6, 14);
  if (Math.floor(t * 2) % 2 === 0) {
    ctx.fillStyle = '#FF5A5A';
    ctx.beginPath(); ctx.arc(x - 14, y, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ── Space pieces ──
function drawPlanet(c, x, y, r, colours, ring) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, colours[0]); g.addColorStop(0.6, colours[1]); g.addColorStop(1, colours[2]);
  if (ring) {
    c.strokeStyle = ring; c.lineWidth = r * 0.12;
    c.beginPath(); c.ellipse(x, y, r * 1.7, r * 0.42, -0.25, Math.PI, Math.PI * 2); c.stroke();
  }
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  if (ring) {
    c.strokeStyle = ring; c.lineWidth = r * 0.12;
    c.beginPath(); c.ellipse(x, y, r * 1.7, r * 0.42, -0.25, 0, Math.PI); c.stroke();
  }
}
function drawCrystal(c, x, gy, h, colour) {
  c.fillStyle = colour;
  c.beginPath(); c.moveTo(x - h * 0.18, gy); c.lineTo(x - h * 0.1, gy - h * 0.7); c.lineTo(x, gy - h); c.lineTo(x + h * 0.12, gy - h * 0.65); c.lineTo(x + h * 0.2, gy); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.beginPath(); c.moveTo(x - h * 0.06, gy - h * 0.1); c.lineTo(x, gy - h * 0.9); c.lineTo(x + h * 0.03, gy - h * 0.1); c.closePath(); c.fill();
}
function drawDome(c, x, gy, r) {
  c.fillStyle = '#3B3F6B';
  c.fillRect(x - r - 6, gy - 10, r * 2 + 12, 10);
  const g = c.createRadialGradient(x - r * 0.3, gy - r * 0.6, 2, x, gy, r);
  g.addColorStop(0, 'rgba(200,240,255,0.75)'); g.addColorStop(1, 'rgba(90,160,220,0.35)');
  c.fillStyle = g;
  c.beginPath(); c.arc(x, gy - 10, r, Math.PI, 0); c.fill();
  c.strokeStyle = 'rgba(220,240,255,0.6)'; c.lineWidth = 2; c.stroke();
  c.fillStyle = '#FFE08A';
  for (let i = -1; i <= 1; i++) c.fillRect(x + i * r * 0.45 - 3, gy - 18, 6, 6);
}

const SPACE_THEME = {
  id: 'space',
  sky: ['#0B0A2A', '#2A1B5C', '#5B2C83'],
  sun: { x: 0.82, y: 80, r: 22, color: '#E0E7FF' },
  belowGround: ['#1A1640', '#050414'],
  pit: [5, 4, 20],
  cloudAlpha: 0,
  stars: true,
  layers: [
    { factor: 0.06, y: -60, paint(c, W, H) {
      // nebula clouds and distant planets
      const r = seededRandom(51);
      for (let i = 0; i < 6; i++) {
        const x = r() * W, y = r() * H * 0.6, rad = 120 + r() * 140;
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, i % 2 ? 'rgba(236,72,153,0.22)' : 'rgba(99,102,241,0.24)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      drawPlanet(c, 260, 120, 54, ['#FDE68A', '#F59E0B', '#B45309'], 'rgba(253,230,138,0.6)');
      drawPlanet(c, 900, 80, 26, ['#A5F3FC', '#22D3EE', '#0E7490'], null);
      drawPlanet(c, 1220, 170, 38, ['#F9A8D4', '#DB2777', '#831843'], 'rgba(249,168,212,0.5)');
    }},
    { factor: 0.25, y: 0, paint(c, W, H) {
      const waves = [[2, 22, 0.5], [7, 8, 1.6]];
      fillHills(c, W, H, H * 0.72, waves, '#3E3A78');
      const gy = x => hillY(x, H * 0.72, waves) + 4;
      [[180, 46], [640, 60], [1100, 40]].forEach(([x, r]) => drawDome(c, x, gy(x), r));
      const r = seededRandom(61);
      for (let i = 0; i < 18; i++) { const x = r() * W; drawCrystal(c, x, gy(x), 30 + r() * 50, r() > 0.5 ? 'rgba(167,139,250,0.85)' : 'rgba(45,212,191,0.8)'); }
      c.strokeStyle = '#6B7280'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(400, gy(400)); c.lineTo(400, gy(400) - 110); c.stroke();
      c.fillStyle = '#F87171'; c.beginPath(); c.arc(400, gy(400) - 112, 4, 0, Math.PI * 2); c.fill();
    }},
    { factor: 0.55, y: 40, paint(c, W, H) {
      const base = H * 0.88;
      const r = seededRandom(71);
      c.fillStyle = '#24204A';
      for (let x = -20; x < W + 40; x += 30 + r() * 30) { c.beginPath(); c.ellipse(x, base, 28 + r() * 22, 14 + r() * 14, 0, Math.PI, 0); c.fill(); }
      c.fillRect(0, base, W, H - base);
      for (let i = 0; i < 26; i++) { const x = r() * W; drawCrystal(c, x, base + 2, 14 + r() * 22, r() > 0.5 ? '#A78BFA' : '#2DD4BF'); }
    }},
  ],
  ground: drawMoonGround,
  plank: drawHoverPad,
  ambient: drawShootingStars,
};

function drawMoonGround(ctx, p, sx, sy) {
  const { w, h } = p;
  const r = seededRandom(Math.round(p.x * 3 + p.y));
  const g = ctx.createLinearGradient(sx, sy, sx, sy + h);
  g.addColorStop(0, '#8E8BB8'); g.addColorStop(1, '#4C4878');
  ctx.fillStyle = g;
  ctx.beginPath(); roundRect(ctx, sx, sy, w, h, 8); ctx.fill();
  for (let i = 0; i < w / 45; i++) {
    const cx = sx + 12 + r() * (w - 24), cy = sy + 12 + r() * Math.max(4, h - 18), cr = 4 + r() * 7;
    ctx.fillStyle = 'rgba(40,36,80,0.45)';
    ctx.beginPath(); ctx.ellipse(cx, cy, cr, cr * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(220,215,255,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, cy - 1, cr, cr * 0.6, 0, Math.PI, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#C4C0EA';
  ctx.beginPath(); roundRect(ctx, sx, sy, w, 5, [8, 8, 0, 0]); ctx.fill();
}
function drawHoverPad(ctx, p, sx, sy) {
  const { w, h } = p;
  const glow = ctx.createLinearGradient(sx, sy + h, sx, sy + h + 22);
  glow.addColorStop(0, 'rgba(45,212,191,0.55)'); glow.addColorStop(1, 'rgba(45,212,191,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.moveTo(sx + 10, sy + h); ctx.lineTo(sx + w - 10, sy + h); ctx.lineTo(sx + w - 24, sy + h + 22); ctx.lineTo(sx + 24, sy + h + 22); ctx.closePath(); ctx.fill();
  const body = ctx.createLinearGradient(sx, sy, sx, sy + h);
  body.addColorStop(0, '#CBD5E1'); body.addColorStop(1, '#64748B');
  ctx.fillStyle = body;
  ctx.beginPath(); roundRect(ctx, sx, sy, w, h, h / 2); ctx.fill();
  ctx.fillStyle = '#2DD4BF';
  for (let x = sx + 14; x < sx + w - 10; x += 22) { ctx.beginPath(); ctx.arc(x, sy + h / 2, 2.5, 0, Math.PI * 2); ctx.fill(); }
}
function drawShootingStars(ctx, t, camX, groundY) {
  for (let i = 0; i < 2; i++) {
    const cycle = (t * 0.35 + i * 0.5) % 1;
    if (cycle > 0.25) continue;
    const k = cycle / 0.25;
    const x0 = ((i * 523) % CW) + CW * 0.2, y0 = 40 + i * 60;
    const x = x0 + k * 260, y = y0 + k * 120;
    const g = ctx.createLinearGradient(x - 70, y - 32, x, y);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${0.9 * (1 - k)})`);
    ctx.strokeStyle = g; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x - 70, y - 32); ctx.lineTo(x, y); ctx.stroke();
  }
}

const WORLD_THEMES = { 1: PLAYGROUND_THEME, 2: SAFARI_THEME, 3: CITY_THEME, 4: SPACE_THEME };

function currentTheme() {
  const key = (typeof game !== 'undefined' && game && game.level && game.level.key) || '1-1';
  const world = key === 'practice' ? 1 : parseInt(key, 10);
  return WORLD_THEMES[world] || null;
}

// ── Layer cache ──
const sceneCache = new Map();
function themeLayers(theme) {
  if (!sceneCache.has(theme.id)) sceneCache.set(theme.id, theme.layers.map(l => ({ ...l, canvas: makeLayerCanvas(l.paint) })));
  return sceneCache.get(theme.id);
}

// ── Clouds: puffy sprites drifting with time ──
let cloudSprites = null;
function getCloudSprites() {
  if (cloudSprites) return cloudSprites;
  const r = seededRandom(3);
  cloudSprites = Array.from({ length: 7 }, (_, i) => {
    const w = 140 + r() * 120, h = 70 + r() * 30;
    const c = document.createElement('canvas');
    c.width = w + 20; c.height = h + 20;
    const x = c.getContext('2d');
    // Shaded underside first, then bright puffs on top
    const puffs = [];
    const bottomR = h * 0.2;
    for (let px = 10 + bottomR; px < w - bottomR + 10; px += bottomR * 1.1) puffs.push([px, h * 0.68, bottomR]);
    for (let k = 0; k < 5; k++) puffs.push([25 + r() * (w - 50), h * 0.38 + r() * h * 0.2, h * (0.22 + r() * 0.16)]);
    x.fillStyle = 'rgba(205,228,246,0.95)';
    puffs.forEach(([px, py, pr]) => { x.beginPath(); x.arc(px, py + 4, pr, 0, Math.PI * 2); x.fill(); });
    x.fillStyle = 'rgba(255,255,255,0.97)';
    puffs.forEach(([px, py, pr]) => { x.beginPath(); x.arc(px, py, pr, 0, Math.PI * 2); x.fill(); });
    return { canvas: c, x: i * 340 + r() * 160, y: 30 + r() * 110, speed: 6 + r() * 8 };
  });
  return cloudSprites;
}

function drawThemedBackground(ctx, theme, camX, camY) {
  const t = performance.now() / 1000;
  const groundY = WORLD_GROUND_Y - camY;

  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(CH, groundY + 40));
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(0.55, theme.sky[1]);
  sky.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, CH);

  if (theme.stars) {
    const r = seededRandom(77);
    for (let i = 0; i < 60; i++) {
      const x = ((r() * CW * 1.5 - camX * 0.02) % CW + CW) % CW, y = r() * (groundY - 200);
      ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t * 1.5 + i))})`;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
  }

  // Sun with soft glow
  const sx = CW * theme.sun.x - camX * 0.01, sy = theme.sun.y - camY * 0.05;
  const glow = ctx.createRadialGradient(sx, sy, theme.sun.r * 0.6, sx, sy, theme.sun.r * 4);
  glow.addColorStop(0, 'rgba(255,240,180,0.55)');
  glow.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - theme.sun.r * 4, sy - theme.sun.r * 4, theme.sun.r * 8, theme.sun.r * 8);
  ctx.fillStyle = theme.sun.color;
  ctx.beginPath(); ctx.arc(sx, sy, theme.sun.r, 0, Math.PI * 2); ctx.fill();

  // Clouds
  const band = 7 * 340;
  ctx.globalAlpha = theme.cloudAlpha ?? 1;
  for (const cl of getCloudSprites()) {
    let x = (cl.x + t * cl.speed - camX * 0.06) % band;
    if (x < 0) x += band;
    x -= 200;
    if (x < CW + 50) ctx.drawImage(cl.canvas, x, cl.y - camY * 0.04);
  }
  ctx.globalAlpha = 1;

  // Parallax layers, anchored to the world's ground line
  for (const layer of themeLayers(theme)) {
    const top = groundY - SCENE_TILE_H + layer.y + camY * (1 - layer.factor) * 0.5;
    let off = -((camX * layer.factor) % SCENE_TILE_W);
    if (off > 0) off -= SCENE_TILE_W;
    for (let x = off; x < CW; x += SCENE_TILE_W) ctx.drawImage(layer.canvas, x, top);
    const bottom = top + SCENE_TILE_H;
    if (layer === themeLayers(theme).at(-1) && bottom < CH) {
      const g = ctx.createLinearGradient(0, bottom, 0, CH);
      g.addColorStop(0, theme.belowGround[0]);
      g.addColorStop(1, theme.belowGround[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, bottom - 1, CW, CH - bottom + 1);
    }
  }

  // Below the ground line the scene falls away into shadow, so gaps between platforms read as holes
  const [pr, pg, pb] = theme.pit;
  const pit = ctx.createLinearGradient(0, groundY - 4, 0, groundY + 90);
  pit.addColorStop(0, `rgba(${pr},${pg},${pb},0)`);
  pit.addColorStop(0.35, `rgba(${pr},${pg},${pb},0.65)`);
  pit.addColorStop(1, `rgba(${pr},${pg},${pb},0.95)`);
  ctx.fillStyle = pit;
  ctx.fillRect(0, groundY - 4, CW, CH - groundY + 4);

  if (theme.ambient && !prefersReducedMotion()) theme.ambient(ctx, t, camX, groundY);
}

function drawButterflies(ctx, t, camX, groundY) {
  ctx.save();
  ctx.font = '16px serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < 4; i++) {
    const span = CW + 200;
    let x = ((i * 410 + t * (18 + i * 5) - camX * 0.4) % span + span) % span - 100;
    const y = groundY - 120 - i * 28 + Math.sin(t * 2 + i) * 18;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(Math.abs(Math.sin(t * 9 + i)) * 0.6 + 0.4, 1);
    ctx.fillText('🦋', 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// ── Ground pieces ──
function drawGrassGround(ctx, p, sx, sy) {
  const { w, h } = p;
  const r = seededRandom(Math.round(p.x * 7 + p.y));
  const dirt = ctx.createLinearGradient(sx, sy, sx, sy + h);
  dirt.addColorStop(0, '#9A6440');
  dirt.addColorStop(1, '#6E4128');
  ctx.fillStyle = dirt;
  ctx.beginPath(); roundRect(ctx, sx, sy + 4, w, h - 4, 8); ctx.fill();
  // Pebbles
  for (let i = 0; i < w / 18; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,230,200,0.22)' : 'rgba(60,30,15,0.28)';
    ctx.beginPath();
    ctx.ellipse(sx + 6 + r() * (w - 12), sy + 16 + r() * Math.max(4, h - 22), 2 + r() * 3, 1.5 + r() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Grass band with scalloped edge
  ctx.fillStyle = '#58B947';
  ctx.beginPath(); roundRect(ctx, sx - 2, sy - 2, w + 4, 12, [8, 8, 2, 2]); ctx.fill();
  for (let x = sx + 4; x < sx + w - 2; x += 12) {
    ctx.beginPath(); ctx.arc(x + 2, sy + 9, 6, 0, Math.PI); ctx.fill();
  }
  ctx.fillStyle = '#7ED36A';
  ctx.beginPath(); roundRect(ctx, sx, sy - 2, w, 4, 3); ctx.fill();
  // Tufts and flowers on top
  for (let i = 0; i < w / 40; i++) {
    const x = sx + 8 + r() * (w - 16);
    ctx.strokeStyle = '#3E9A36'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 4, sy - 1); ctx.lineTo(x - 6, sy - 8);
    ctx.moveTo(x, sy - 1); ctx.lineTo(x, sy - 10);
    ctx.moveTo(x + 4, sy - 1); ctx.lineTo(x + 6, sy - 8);
    ctx.stroke();
    if (r() > 0.6) {
      ctx.fillStyle = ['#FF8FB1', '#FFE066', '#FFFFFF'][(r() * 3) | 0];
      ctx.beginPath(); ctx.arc(x + 9, sy - 6, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath(); ctx.arc(x + 9, sy - 6, 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawWoodPlank(ctx, p, sx, sy) {
  const { w, h } = p;
  const wood = ctx.createLinearGradient(sx, sy, sx, sy + h);
  wood.addColorStop(0, '#D99A5B');
  wood.addColorStop(1, '#A8693A');
  ctx.fillStyle = wood;
  ctx.beginPath(); roundRect(ctx, sx, sy, w, h, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(90,45,15,0.45)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = sx + w / 3; x < sx + w - 4; x += w / 3) { ctx.moveTo(x, sy + 2); ctx.lineTo(x, sy + h - 2); }
  ctx.moveTo(sx + 4, sy + h * 0.5); ctx.lineTo(sx + w - 4, sy + h * 0.5);
  ctx.stroke();
  ctx.fillStyle = '#5A3A22';
  [[6, 5], [w - 9, 5], [6, h - 8], [w - 9, h - 8]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(sx + dx, sy + dy, 1.8, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(sx + 3, sy + 2, w - 6, 2);
}

// Finish flag shared by all worlds
function drawFinishFlag(ctx, p, sx, sy, reached) {
  const { w, h } = p;
  ctx.fillStyle = '#3A3F58';
  ctx.beginPath(); roundRect(ctx, sx, sy, w, h, 8); ctx.fill();
  const poleX = sx + w / 2 - 2;
  ctx.fillStyle = '#E5E7EB';
  ctx.fillRect(poleX, sy - 78, 4, 82);
  ctx.fillStyle = '#FFD166';
  ctx.beginPath(); ctx.arc(poleX + 2, sy - 80, 5, 0, Math.PI * 2); ctx.fill();
  const t = performance.now() / 300;
  const fw = 44, fh = 28, cols = 6, rows = 4;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const wave = Math.sin(t + i * 0.7) * 3 * (i / cols);
      ctx.fillStyle = (i + j) % 2 ? '#111827' : (reached ? '#FFD166' : '#FFFFFF');
      ctx.fillRect(poleX + 4 + i * (fw / cols), sy - 76 + j * (fh / rows) + wave, fw / cols + 0.5, fh / rows + 0.5);
    }
  }
  ctx.fillStyle = '#fff';
  ctx.font = "13px 'Fredoka One', cursive";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FINISH', sx + w / 2, sy + h / 2 + 2);
}

// Soft edge darkening that makes the scene feel lit from the centre
function drawVignette(ctx) {
  const g = ctx.createRadialGradient(CW / 2, CH * 0.45, Math.min(CW, CH) * 0.45, CW / 2, CH * 0.45, Math.max(CW, CH) * 0.8);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(10,20,40,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
}
