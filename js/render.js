// ══════════════════════════════════════════════
//  RENDERING
// ══════════════════════════════════════════════
// Clouds data
const CLOUDS = Array.from({length:10},(_,i)=>({
  x: i*700+Math.random()*400, y: 40+Math.random()*120,
  w: 100+Math.random()*120, h: 30+Math.random()*30,
  speed: 0.15+Math.random()*0.2,
}));

let bgGradient = null;

function drawBG(ctx, camX, camY, worldW) {
  const theme = currentTheme();
  if (theme) { drawThemedBackground(ctx, theme, camX, camY); return; }
  // Sky gradient
  const sky = ctx.createLinearGradient(0,0,0,CH);
  sky.addColorStop(0, '#2C5282');
  sky.addColorStop(0.6, '#5BA4CF');
  sky.addColorStop(1, '#A8D8EA');
  ctx.fillStyle=sky;
  ctx.fillRect(0,0,CW,CH);

  // Parallax hills (back)
  const hx1 = -camX*0.2;
  ctx.fillStyle='rgba(72,120,170,0.35)';
  for (let i=0;i<12;i++) {
    const bx=(i*300+hx1)%((12*300)+CW)-150;
    ctx.beginPath();
    ctx.ellipse(bx, CH-80+camY*0.2, 180, 100, 0, Math.PI,0);
    ctx.fill();
  }
  // Front hills
  ctx.fillStyle='rgba(56,142,60,0.4)';
  const hx2 = -camX*0.4;
  for (let i=0;i<10;i++) {
    const bx=(i*260+hx2)%((10*260)+CW)-100;
    ctx.beginPath();
    ctx.ellipse(bx, CH-20+camY*0.4, 140, 80, 0, Math.PI,0);
    ctx.fill();
  }

  // Clouds (parallax)
  ctx.fillStyle='rgba(255,255,255,0.75)';
  CLOUDS.forEach(c => {
    c.x -= c.speed;
    if (c.x+c.w < 0) c.x=CW+c.w;
    const cx = c.x - camX*0.1;
    ctx.beginPath();
    roundRect(ctx, cx, c.y-camY*0.05, c.w, c.h, c.h/2);
    ctx.fill();
    ctx.beginPath();
    roundRect(ctx, cx-c.w*0.15, c.y+c.h*0.3-camY*0.05, c.w*1.3, c.h*0.7, c.h*0.35);
    ctx.fill();
  });
}

function drawCoin(ctx, c, camX, camY) {
  if (c.collected) return;
  const sx = c.x-camX, sy = c.y-camY;
  const pulse = Math.sin(c.frame)*2;
  ctx.save();
  ctx.shadowBlur=10; ctx.shadowColor='#FFD166';
  ctx.fillStyle='#FFD166';
  ctx.beginPath();
  ctx.ellipse(sx, sy+pulse, 10, 10, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.strokeStyle='#B8860B'; ctx.lineWidth=1.5;
  ctx.stroke();
  ctx.fillStyle='#FFF8E1';
  ctx.font='bold 8px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('★', sx, sy+pulse);
  ctx.shadowBlur=0;
  ctx.restore();
}

function drawLetter(ctx, lt, camX, camY) {
  if (lt.collected) return;
  const sx = lt.x - camX;
  const sy = lt.y - camY + Math.sin(lt.frame) * 5;
  if (sx < -40 || sx > CW + 40) return;
  ctx.save();
  ctx.fillStyle = '#7C3AED';
  ctx.strokeStyle = '#EDE9FE';
  ctx.lineWidth = 3;
  ctx.beginPath();
  roundRect(ctx, sx - 16, sy - 16, 32, 32, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = canvasFont(20);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(lt.ch, sx, sy + 1);
  ctx.restore();
}

function drawLifeUp(ctx, lu, camX, camY) {
  if (lu.collected) return;
  const sx = lu.x - camX;
  const sy = lu.y - camY + Math.sin(lu.frame) * 4;
  const scale = 1 + Math.sin(lu.frame * 1.5) * 0.08;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale, scale);
  // Glow
  ctx.shadowBlur = 14 + Math.sin(lu.frame*2)*4;
  ctx.shadowColor = '#FF4D6D';
  // Circle bg
  ctx.fillStyle = 'rgba(255,77,109,0.2)';
  ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#FF4D6D'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.stroke();
  // Heart character
  ctx.shadowBlur = 0;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FF4D6D';
  ctx.fillText('♥', 0, 1);
  ctx.restore();
}

function drawPlayer(g) {
  if (!g) return;
  const ctx = ctx2d;
  const sx = g.px - g.camX;
  const sy = g.py - g.camY;
  const blink = g.invincible>0 && Math.floor(g.invincible/6)%2===0;
  if (blink) return;

  const skinId = getActiveSkin();
  const skinCols = SKIN_COLORS[skinId];

  // Ground shadow: sits on the surface below the ball and shrinks as the ball rises
  let floorY = null;
  for (const p of g.level.platforms) {
    if (p.dead || g.px < p.x || g.px > p.x + p.w || p.y < g.py) continue;
    if (floorY === null || p.y < floorY) floorY = p.y;
  }
  if (floorY !== null && floorY - g.py < 320) {
    const k = 1 - Math.min(1, (floorY - g.py - BALL_R) / 320);
    ctx.fillStyle = `rgba(0,0,0,${0.25 * k})`;
    ctx.beginPath();
    ctx.ellipse(sx, floorY - g.camY + 1, BALL_R * (0.5 + 0.5 * k), BALL_R * 0.22 * (0.5 + 0.5 * k), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Motion trail at speed
  const speed = Math.hypot(g.pvx, g.pvy);
  if (g.trail && speed > 6 && !prefersReducedMotion()) {
    const col = skinId === 'rainbow' ? '#FF80FF' : skinCols[1];
    g.trail.forEach((pt, i) => {
      ctx.globalAlpha = (i / g.trail.length) * 0.25;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pt.x - g.camX, pt.y - g.camY, BALL_R * (0.5 + 0.5 * i / g.trail.length), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // Squash on landing, stretch while flying fast
  const stretch = g.pOnGround ? 0 : Math.min(0.18, Math.abs(g.pvy) / 60);
  const sqX = 1 + (g.squash || 0) - stretch * 0.6;
  const sqY = 1 - (g.squash || 0) + stretch;

  ctx.save();
  ctx.translate(sx, sy + BALL_R * (1 - sqY));
  ctx.scale(sqX, sqY);
  ctx.rotate(g.pRot);

  // Ball body — skin-colored
  const grad = ctx.createRadialGradient(-BALL_R*0.3,-BALL_R*0.3,BALL_R*0.1, 0,0,BALL_R);
  if (skinId === 'rainbow') {
    const hue = (Date.now() / 20) % 360;
    grad.addColorStop(0, `hsl(${hue},100%,70%)`);
    grad.addColorStop(0.6, `hsl(${(hue+60)%360},100%,50%)`);
    grad.addColorStop(1, `hsl(${(hue+120)%360},100%,30%)`);
  } else {
    grad.addColorStop(0, skinCols[0]);
    grad.addColorStop(0.6, skinCols[1]);
    grad.addColorStop(1, skinCols[2]);
  }
  ctx.fillStyle=grad;
  ctx.beginPath();
  ctx.arc(0,0,BALL_R,0,Math.PI*2);
  ctx.fill();

  if (selfieCanvas) {
    // Draw selfie counter-rotated so face stays upright
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, BALL_R-1, 0, Math.PI*2);
    ctx.clip();
    ctx.rotate(-g.pRot); // counter-rotate → face stays upright
    ctx.drawImage(selfieCanvas, -BALL_R, -BALL_R, BALL_R*2, BALL_R*2);
    ctx.restore();
  } else {
    // Emoji face — counter-rotated to stay upright
    ctx.save();
    ctx.rotate(-g.pRot);
    ctx.fillStyle='#1a0a00';
    ctx.beginPath(); ctx.arc(-6,-4,4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(6,-4,4,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#1a0a00'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0, 4, 6, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }

  // Shine on top (always, gives "ball" feel even with selfie)
  ctx.fillStyle='rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.arc(-BALL_R*0.28,-BALL_R*0.28,BALL_R*0.32,0,Math.PI*2);
  ctx.fill();
  // Rolling edge highlight
  ctx.strokeStyle='rgba(255,255,255,0.15)';
  ctx.lineWidth=3;
  ctx.beginPath();
  ctx.arc(0,0,BALL_R-1,0,Math.PI*2);
  ctx.stroke();

  // Green glow after correct answer
  if (g.correctGlow > 0) {
    const t = g.correctGlow / 30;
    ctx.shadowBlur = 30 * t;
    ctx.shadowColor = '#06D6A0';
    ctx.strokeStyle = `rgba(6,214,160,${t})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0,0,BALL_R+4,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;
    // Scale pulse
    const scale = 1 + 0.15 * Math.sin(t * Math.PI);
    ctx.scale(scale, scale);
  }

  // Glow when invincible
  if (g.invincible>0) {
    ctx.strokeStyle=`rgba(255,209,102,${(g.invincible%12)/12})`;
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(0,0,BALL_R+3,0,Math.PI*2); ctx.stroke();
  }

  ctx.restore();
}

function drawTextParticles(g) {
  const ctx=ctx2d;
  for (const t of g.textParticles) {
    const a = t.life/t.maxLife;
    ctx.save();
    ctx.globalAlpha=a;
    ctx.fillStyle=t.color;
    ctx.font=`bold 16px 'Fredoka One',cursive`;
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.shadowBlur=8; ctx.shadowColor=t.color;
    ctx.fillText(t.text, t.x-g.camX, t.y-g.camY);
    ctx.restore();
  }
}

// Question written on a sign above the answer platforms (jump-to-answer mode)
function drawQuestionSign(ctx, g) {
  const c = getClusters(g.level)[g.currentQ];
  const q = g.level.questions[g.currentQ];
  if (!c || !q || g.answeredQuestions.has(g.currentQ)) return;
  const cx = (c.minX + c.maxX) / 2 - g.camX;
  if (cx < -300 || cx > CW + 300) return;
  const top = c.y - 92 - g.camY;
  if (top < 4) return; // no room above the answers (short screens): the top bar already shows the question
  const special = isSpecial(q) ? SPECIAL_TYPES[q.type] : null;
  const text = special ? `${special.icon} ${special.prompt}` : q.q.replace(/_{3,}/, '____');
  const sub = special ? 'Jump onto any platform to start ⬆' : 'Jump onto the right answer ⬆';
  ctx.save();
  ctx.font = canvasFont(20);
  const w = Math.max(ctx.measureText(text).width, 200) + 36;
  ctx.fillStyle = 'rgba(15,10,40,0.88)';
  ctx.strokeStyle = '#FFD166';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); roundRect(ctx, cx - w/2, top, w, 58, 14); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, cx, top + 21);
  ctx.font = "800 12px 'Nunito', sans-serif";
  ctx.fillStyle = '#FFD166';
  ctx.fillText(sub, cx, top + 44);
  ctx.restore();
}

function drawBossBattle(ctx, g) {
  const { camX, camY } = g;
  for (const b of g.bossBubbles || []) {
    const sx = b.x - camX, sy = b.y - camY + Math.sin(b.bob) * 6;
    const scale = b.pop ? 1 + b.pop * 0.04 : 1;
    ctx.save();
    ctx.globalAlpha = b.pop ? Math.max(0, 1 - b.pop / 30) : 1;
    ctx.translate(sx, sy);
    ctx.scale(scale, scale);
    const base = b.pop ? (b.isCorrect ? '#06D6A0' : '#EF476F') : '#7C3AED';
    const grad = ctx.createRadialGradient(-b.r * 0.35, -b.r * 0.35, 2, 0, 0, b.r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, base);
    grad.addColorStop(1, base + 'cc');
    ctx.shadowBlur = 18; ctx.shadowColor = base;
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `${b.label.length > 6 ? 13 : 16}px 'Fredoka One', cursive`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const mark = b.pop ? (b.isCorrect ? '✓ ' : '✗ ') : '';
    ctx.fillText(mark + b.label, 0, 1);
    ctx.restore();
  }
  for (const bolt of g.bossBolts || []) {
    ctx.save();
    ctx.font = '26px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowBlur = 16; ctx.shadowColor = '#FFD166';
    ctx.fillText('⭐', bolt.x - camX, bolt.y - camY);
    ctx.restore();
  }
  for (const blob of g.bossBlobs || []) {
    const sx = blob.x - camX, sy = blob.y - camY;
    ctx.save();
    ctx.fillStyle = '#5B21B6';
    ctx.shadowBlur = 12; ctx.shadowColor = '#A78BFA';
    ctx.beginPath(); ctx.arc(sx, sy, 13, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = "bold 14px 'Fredoka One', cursive"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✗', sx, sy + 1);
    ctx.restore();
  }
  // Question banner across the top while bubbles are up
  const q = g.bossLastQ;
  const live = (g.bossBubbles || []).some(b => !b.pop);
  if (g.bossPhase === 'fight' && q && live) {
    ctx.save();
    ctx.font = canvasFont(20);
    const text = `👑 ${q.q.replace(/_{3,}/, '____')}`;
    const w = Math.min(CW - 24, ctx.measureText(text).width + 40);
    const x = CW / 2 - w / 2, y = 78;
    ctx.fillStyle = 'rgba(40,10,20,0.88)';
    ctx.strokeStyle = '#FF6B6B'; ctx.lineWidth = 2.5;
    ctx.beginPath(); roundRect(ctx, x, y, w, 56, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, CW / 2, y + 21, w - 20);
    ctx.font = "800 12px 'Nunito', sans-serif"; ctx.fillStyle = '#FFB3B3';
    ctx.fillText('Bounce on the right bubble to attack! ⬆', CW / 2, y + 43);
    ctx.restore();
  }
}

function render(g) {
  if (!g) return;
  const ctx=ctx2d;
  ctx.clearRect(0,0,CW,CH);

  // Screen shake
  let shakeX = 0, shakeY = 0;
  if (screenShakeTimer > 0) {
    shakeX = (Math.random()-0.5) * screenShakeIntensity;
    shakeY = (Math.random()-0.5) * screenShakeIntensity;
    screenShakeTimer--;
    if (screenShakeTimer === 0) screenShakeIntensity = 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
  }

  drawBG(ctx, g.camX, g.camY, g.level.worldW);

  // Platforms
  for (const p of g.level.platforms) p.draw(ctx, g.camX, g.camY);
  if (g.level.jumpMode) drawQuestionSign(ctx, g);

  // Coins
  for (const c of g.level.coins) drawCoin(ctx, c, g.camX, g.camY);
  if (g.level.lifeups) for (const lu of g.level.lifeups) drawLifeUp(ctx, lu, g.camX, g.camY);
  for (const lt of g.level.letters) drawLetter(ctx, lt, g.camX, g.camY);

  // Power-ups
  for (const pu of g.level.powerups) pu.draw(ctx, g.camX, g.camY);

  // Enemies
  for (const e of g.level.enemies) e.draw(ctx, g.camX, g.camY);
  if (g.level.boss) g.level.boss.draw(ctx, g.camX, g.camY);
  if (g.level.jumpMode && g.level.boss) drawBossBattle(ctx, g);

  // Particles
  for (const p of g.particles) p.draw(ctx, g.camX, g.camY);

  // Ghost opponent (multiplayer)
  drawOpponent(ctx, g.camX, g.camY);

  // Player
  drawPlayer(g);

  // Text particles
  drawTextParticles(g);

  // Confetti (world-space)
  for (const c of confettiList) c.draw(ctx, g.camX, g.camY);

  if (currentTheme()) drawVignette(ctx);

  // Screen-space confetti (no camera offset)
  // (already drawn above with camX/camY of 0 for screen-burst ones)

  // Answering / animating dim
  if (g.state==='answering') {
    ctx.fillStyle='rgba(5,12,35,0.5)';
    ctx.fillRect(0,0,CW,CH);
  }

  // Paused overlay on canvas
  if (g.state==='paused') {
    ctx.fillStyle='rgba(10,22,50,0.7)';
    ctx.fillRect(0,0,CW,CH);
    ctx.fillStyle='#fff';
    ctx.font="bold 48px 'Fredoka One',cursive";
    ctx.textAlign='center';
    ctx.fillText('PAUSED ⏸', CW/2, CH/2-20);
    ctx.font="20px Nunito,sans-serif";
    ctx.fillStyle='rgba(255,255,255,0.6)';
    ctx.fillText('Press P or Space to continue', CW/2, CH/2+30);
  }

  // Question hint arrow → pointing to grammar platforms
  if (g.state==='playing') {
    const q = g.level.questions[g.currentQ];
    if (q) {
      const unansweredGP = g.level.platforms.filter(p=>
        p.type==='grammar' && p.data.questionIdx===g.currentQ && !p.revealed && !p.crumbling
      );
      if (unansweredGP.length>0) {
        const nearest = unansweredGP.reduce((a,b)=>
          Math.abs(a.x-g.px)<Math.abs(b.x-g.px)?a:b);
        const arrowX = nearest.x+nearest.w/2-g.camX;
        const arrowY = nearest.y-g.camY-20;
        if (arrowX>0 && arrowX<CW) {
          ctx.save();
          ctx.fillStyle='rgba(255,209,102,0.8)';
          ctx.shadowBlur=10; ctx.shadowColor='#FFD166';
          ctx.beginPath();
          const bounce=Math.sin(Date.now()*0.005)*6;
          ctx.moveTo(arrowX, arrowY+bounce);
          ctx.lineTo(arrowX-10, arrowY-10+bounce);
          ctx.lineTo(arrowX+10, arrowY-10+bounce);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  if (shakeX !== 0 || shakeY !== 0) ctx.restore();
}

// ══════════════════════════════════════════════
//  GAME LOOP
// ══════════════════════════════════════════════
let loopId=null;
let lastTime=0;
let stepAccumulator=0;
const STEP_MS = 1000/60;

// Physics runs in fixed 60 Hz steps so speed is the same on 60/120/144 Hz screens
function loop(ts) {
  if (!lastTime) lastTime = ts;
  stepAccumulator += Math.min(ts - lastTime, 100);
  lastTime=ts;
  if (game) {
    let steps = 0;
    while (stepAccumulator >= STEP_MS && steps < 5) {
      if (game.state==='playing' || game.state==='animating') updateGame(game);
      consumeTapInputs();
      stepAccumulator -= STEP_MS;
      steps++;
    }
    if (steps === 5) stepAccumulator = 0;
    render(game);
    mpSendPosition(game);
  }
  loopId=requestAnimationFrame(loop);
}

