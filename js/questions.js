// ══════════════════════════════════════════════
//  GRAMMAR LOGIC
// ══════════════════════════════════════════════
function handleGrammarLand(g, plat) {
  const qIdx = plat.data.questionIdx;
  if (g.answeredQuestions.has(qIdx)) return; // already answered correctly
  // Pop-up question types: in jump mode, landing on their platform opens the question
  if (isSpecial(g.level.questions[qIdx])) {
    plat.revealed = false;
    if (g.level.jumpMode && g.state === 'playing' && Date.now() >= (g.specialCooldownUntil || 0)) {
      g.currentQ = qIdx;
      showMCQ(g);
    }
    return;
  }
  // Wrong platforms always harmless after MCQ answered
  if (g.mcqAnsweredSet.has(qIdx) && !plat.data.isCorrect) return;
  // MCQ was answered WRONG — correct platform gives no reward, just clears and moves on
  if (g.mcqAnsweredSet.has(qIdx) && !g.mcqCorrectSet.has(qIdx) && plat.data.isCorrect) {
    g.answeredQuestions.add(qIdx);
    g.level.platforms.forEach(p => { p.chosen=false; p.isHinted=false; p.wrongAnswered=false; });
    revealSiblingPlatforms(g, qIdx);
    g.currentQ = Math.min(g.currentQ+1, g.level.questions.length-1);
    updateQuestionUI(g);
    return;
  }

  // Clear highlight flags
  g.level.platforms.forEach(p => { p.chosen = false; p.isHinted = false; p.wrongAnswered = false; });

  const label = plat.data.label || '';
  const isCorrect = plat.data.isCorrect;
  if (g.level.jumpMode) {
    g.currentQ = qIdx;
    if (g.mcqOpenTime) {
      (g.answerTimes = g.answerTimes || []).push((Date.now() - g.mcqOpenTime) / 1000);
      g.mcqOpenTime = null;
    }
    if (!isCorrect) {
      // Wrong landing: only this platform breaks; the pupil can try the others
      plat.revealed = true;
      plat.crumbling = true;
      processAnswerResult(g, label, false, null);
      return;
    }
  }
  plat.revealed = true;
  processAnswerResult(g, label, isCorrect, plat);
}

// ── Boss battle (jump mode): bounce on the right answer bubble to fire at the boss ──
const BOSS_BUBBLE_R = 30;
const BOSS_BUBBLE_RISE = 125;           // bubble centre above the arena floor (reachable: jump rises ~190px)
const BOSS_BLOB_EVERY = { 1: 4600, 2: 3300, 3: 2300 }; // ms between dropped blobs per boss phase

function spawnBossQuestion(g) {
  const boss = g.level.boss;
  const qs = g.level.questions.filter(isMcqQuestion);
  if (!qs.length) return;
  const q = qs[g.bossCurrentQ % qs.length];
  g.bossLastQ = q;
  const opts = [{ label: q.correct, isCorrect: true }, ...q.wrong.map(w => ({ label: w, isCorrect: false }))];
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  const { x0, groundY } = boss.arena;
  g.bossBubbles = opts.map((o, i) => ({ ...o, x: x0 + 110 + i * 190, y: groundY - BOSS_BUBBLE_RISE, r: BOSS_BUBBLE_R, bob: i * 1.7, pop: 0 }));
  g.bossAskTime = Date.now();
  document.getElementById('question-box').innerHTML =
    `👑 ${esc(q.q).replace('___', '<span id="question-blank">___</span>')}`;
  if (getSettings().autoRead) speakQuestion(q);
}

function updateBossBattle(g) {
  const boss = g.level.boss;
  g.bossBubbles ||= [];
  g.bossBolts ||= [];
  g.bossBlobs ||= [];
  if (!boss.alive) { g.bossBubbles = []; g.bossBlobs = []; return; }
  if (!g.bossBubbles.length && !g.bossNextAt) g.bossNextAt = Date.now() + 700;
  if (g.bossNextAt && Date.now() >= g.bossNextAt) { g.bossNextAt = 0; spawnBossQuestion(g); }

  // Land on a bubble: falling onto its top answers the question
  for (const b of g.bossBubbles) {
    b.bob += 0.05;
    if (b.pop) { b.pop++; continue; }
    const by = b.y + Math.sin(b.bob) * 6;
    const dx = g.px - b.x;
    const prevBottom = g.py - g.pvy + BALL_R;
    if (g.pvy > 0 && Math.abs(dx) < b.r + BALL_R * 0.5 && prevBottom <= by - b.r + 8 && g.py + BALL_R >= by - b.r) {
      answerBossBubble(g, b);
      break;
    }
  }
  g.bossBubbles = g.bossBubbles.filter(b => b.pop < 30);

  // Star bolts fly from the bubble to the boss
  for (const bolt of g.bossBolts) {
    const tx = boss.x + boss.w / 2, ty = boss.y + boss.h / 2;
    const dx = tx - bolt.x, dy = ty - bolt.y, d = Math.hypot(dx, dy) || 1;
    bolt.x += (dx / d) * 14; bolt.y += (dy / d) * 14;
    if (d < 20) {
      bolt.done = true;
      boss.takeDamage();
      spawnParticles(tx, ty, '#FFD166', 26, 9);
      spawnTextParticle(tx, boss.y - 30, '💥 HIT!', '#06D6A0');
      Audio.enemy();
    }
  }
  g.bossBolts = g.bossBolts.filter(b => !b.done);

  // Dropped "error" blobs to dodge (none on Easy)
  if (getSettings().difficulty !== 'easy') {
    g.bossBlobAt ||= Date.now() + 2500;
    if (Date.now() >= g.bossBlobAt) {
      g.bossBlobAt = Date.now() + BOSS_BLOB_EVERY[boss.phase || 1];
      g.bossBlobs.push({ x: boss.x + boss.w / 2, y: boss.y + boss.h, vx: (g.px - (boss.x + boss.w / 2)) / 70, vy: -2 });
    }
  }
  for (const blob of g.bossBlobs) {
    blob.vy += 0.25; blob.x += blob.vx; blob.y += blob.vy;
    if (blob.y > boss.arena.groundY - 12) { blob.gone = true; spawnParticles(blob.x, blob.y, '#8B5CF6', 8, 3); continue; }
    if (Math.hypot(blob.x - g.px, blob.y - g.py) < BALL_R + 12 && g.invincible <= 0) {
      blob.gone = true;
      spawnTextParticle(g.px, g.py - 30, '-½ ❤', '#FF4D6D');
      if (!tryShield(g)) playerTakeDamage(g, false, 0.5, false);
    }
  }
  g.bossBlobs = g.bossBlobs.filter(b => !b.gone);
}

function answerBossBubble(g, b) {
  const boss = g.level.boss;
  b.pop = 1;
  g.pvy = JUMP_VEL * 0.85; // bounce off the bubble
  if (g.bossAskTime) { (g.answerTimes = g.answerTimes || []).push((Date.now() - g.bossAskTime) / 1000); g.bossAskTime = 0; }
  g.bossCurrentQ++;
  if (b.isCorrect) {
    g.combo++;
    g.score += 100 * (g.useDouble ? 2 : 1);
    g.useDouble = false;
    Audio.correct(g.combo);
    updateComboHUD(g.combo);
    spawnParticles(b.x, b.y, '#06D6A0', 18, 7);
    spawnTextParticle(b.x, b.y - 40, '⚡ ATTACK!', '#FFD166');
    g.bossBolts.push({ x: b.x, y: b.y });
    g.bossBubbles.forEach(o => { if (!o.pop) o.pop = 1; });
  } else {
    g.combo = 0;
    updateComboHUD(0);
    Audio.wrong();
    spawnParticles(b.x, b.y, '#EF476F', 16, 6);
    spawnTextParticle(b.x, b.y - 40, '✗ Wrong!', '#EF476F');
    recordWrong(g, g.bossLastQ, b.label);
    g.bossBubbles.forEach(o => { if (!o.pop) { o.reveal = true; o.pop = 1; } });
    boss.startCharge();
    setTimeout(() => { if (boss.alive && game === g) boss.startAttack(g.px, g.py); }, 450);
    setTimeout(() => { if (boss.alive && game === g) boss.stopAttack(); }, 1300);
  }
  updateHUD(g);
  g.bossNextAt = Date.now() + (b.isCorrect ? 1300 : 2600);
}

// ── Jump-to-answer mode ──
function getClusters(level) {
  if (!level.clusters) {
    level.clusters = {};
    level.platforms.filter(p => p.type === 'grammar').forEach(p => {
      const c = level.clusters[p.data.questionIdx] ||= { minX: Infinity, maxX: -Infinity, y: p.y, plats: [] };
      c.minX = Math.min(c.minX, p.x); c.maxX = Math.max(c.maxX, p.x + p.w); c.plats.push(p);
    });
  }
  return level.clusters;
}

function updateJumpAnswering(g) {
  const clusters = getClusters(g.level);
  // Current question = first unanswered question whose answers are still ahead of (or above) the ball
  let target = null;
  for (let i = 0; i < g.level.questions.length; i++) {
    const c = clusters[i];
    if (!c || g.answeredQuestions.has(i)) continue;
    if (c.maxX + 40 >= g.px) { target = i; break; }
  }
  if (target !== null && target !== g.currentQ) {
    g.currentQ = target;
    g.mcqOpenTime = null;
    updateQuestionUI(g);
  }
  const c = clusters[g.currentQ];
  if (!c) return;
  const q = g.level.questions[g.currentQ];
  const near = g.px >= c.minX - 260 && g.px <= c.maxX + 40;
  if (near && !g.answeredQuestions.has(g.currentQ)) {
    if (!g.mcqOpenTime) g.mcqOpenTime = Date.now();
    if (g.approachedQ !== g.currentQ) {
      g.approachedQ = g.currentQ;
      if (!isSpecial(q)) {
        applyMCQPowerUps(g);
        g.bonusTime = 0;
        if (g.useHint) {
          g.useHint = false;
          const wrong = c.plats.filter(p => !p.data.isCorrect && !p.crumbling && !p.dead);
          const pick = wrong[Math.floor(Math.random() * wrong.length)];
          if (pick) { pick.wrongAnswered = true; spawnTextParticle(pick.x + pick.w/2, pick.y - 30, '💡 Not this one!', '#EAB308'); }
        }
      }
      if (getSettings().autoRead) speakQuestion(q);
    }
  }
  // Aim glow: the answer directly above the ball
  for (const p of c.plats) {
    p.chosen = near && !isSpecial(q) && !p.revealed && !p.crumbling && !p.dead && g.px >= p.x && g.px <= p.x + p.w;
  }
}

function revealSiblingPlatforms(g, qIdx) {
  g.level.platforms.forEach(p => {
    if (p.type==='grammar' && p.data.questionIdx===qIdx && !p.revealed) {
      p.revealed = true;
    }
  });
}

// ══════════════════════════════════════════════
//  MCQ SYSTEM
// ══════════════════════════════════════════════
let mcqShuffled = []; // [{label, isCorrect, platRef}]
let mcqTimerId  = null;
let mcqMode     = 'normal'; // 'normal' | 'boss'

function renderMcqButtons() {
  mcqShuffled.forEach((c,i) => {
    const btn = document.getElementById(`mcq-btn-${i}`);
    btn.textContent = c.label;
    btn.className = `mcq-btn mcq-btn-${['a','b','c'][i]}`;
    btn.setAttribute('aria-label', `Answer ${i+1}: ${c.label}`);
    btn.dataset.key = i + 1;
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.textDecoration = '';
  });
}

function showMCQ(g) {
  hideExplainToast(); // an old explanation must not cover the new question's buttons
  mcqMode = 'normal';
  document.getElementById('mcq-badge').textContent = '🎯 Grammar Question';
  g.state = 'answering';
  g.mcqOpenTime = Date.now(); // for answer timing
  const q = g.level.questions[g.currentQ];
  if (!q) { g.state='playing'; return; }

  // Sentence ordering question type
  if (q.type === 'order') {
    showOrderQuestion(g, q);
    return;
  }
  if (isSpecial(q)) {
    showSpecialQuestion(g, q);
    return;
  }

  // Build shuffled choices from actual grammar platforms for this question
  const platChoices = g.level.platforms.filter(p =>
    p.type==='grammar' && p.data.questionIdx===g.currentQ && !p.crumbling && !p.dead
  );

  // Build choices — link platRef when available even if < 3 platforms survive
  if (platChoices.length === 0) {
    mcqShuffled = [
      {label: q.correct, isCorrect: true, platRef: null},
      {label: q.wrong[0], isCorrect: false, platRef: null},
      {label: q.wrong[1], isCorrect: false, platRef: null},
    ];
  } else {
    // Use platRefs from surviving platforms; fill in missing ones with null
    const byLabel = {};
    platChoices.forEach(p => { byLabel[p.data.label] = p; });
    const allChoices = [
      {label: q.correct,   isCorrect: true,  platRef: byLabel[q.correct]   || null},
      {label: q.wrong[0],  isCorrect: false, platRef: byLabel[q.wrong[0]]  || null},
      {label: q.wrong[1],  isCorrect: false, platRef: byLabel[q.wrong[1]]  || null},
    ];
    mcqShuffled = allChoices;
  }
  // Shuffle
  for (let i=mcqShuffled.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [mcqShuffled[i],mcqShuffled[j]]=[mcqShuffled[j],mcqShuffled[i]];
  }

  // Render question
  const parts = q.q.split('___');
  document.getElementById('mcq-question-text').innerHTML =
    `${esc(parts[0])}<span id="mcq-blank">___</span>${esc(parts[1]||'')}`; // bug6 xss fix
  document.getElementById('mcq-hint').textContent = 'Choose the correct answer! 👇 (or press 1, 2, 3)';
  renderMcqButtons();
  if (getSettings().autoRead) speakQuestion(q);

  // Progress dots
  const total = g.level.questions.length;
  const prog  = document.getElementById('mcq-progress');
  prog.innerHTML = Array.from({length:total},(_,i)=>{
    const cls = i < g.answeredQuestions.size ? 'done'
              : i === g.currentQ ? 'current' : '';
    return `<div class="mcq-dot ${cls}"></div>`;
  }).join('');

  // Update ball preview in MCQ modal
  updateBallThumb();

  // Auto-consume stored power-ups before showing
  applyMCQPowerUps(g);

  document.getElementById('mcq-overlay').classList.remove('hidden');
  startMCQTimer(g);

  // Apply hint after buttons rendered
  if (g.useHint) {
    g.useHint = false;
    requestAnimationFrame(applyHintToButtons);
  }
}

function hideMCQ() {
  document.getElementById('mcq-overlay').classList.add('hidden');
  // Reset ordering / spot panels if visible
  document.getElementById('order-panel').style.display = 'none';
  document.getElementById('spot-panel').style.display = 'none';
  document.getElementById('mcq-choices').style.display = '';
  stopMCQTimer();
}

function startMCQTimer(g) {
  stopMCQTimer();
  const bonus = (g && g.bonusTime) || 0;
  if (g) g.bonusTime = 0;
  let remaining = difficultyConfig().mcqTime + bonus;
  const maxTime = remaining;
  const CIRC = 138.2; // 2π×22

  const arc = document.getElementById('mcq-timer-arc');
  const num = document.getElementById('mcq-timer-num');
  const bar = document.getElementById('mcq-timer-bar');

  // Reset visuals
  arc.style.strokeDashoffset = '0';
  arc.classList.remove('urgent');
  bar.style.width = '100%';
  bar.style.background = 'linear-gradient(90deg,#FFD166,#FF8C42)';
  num.textContent = remaining;

  // Kick off first tick after brief delay so CSS transition fires
  requestAnimationFrame(() => {
    mcqTimerId = setInterval(() => {
      remaining--;
      const pct = remaining / maxTime;
      arc.style.strokeDashoffset = CIRC * (1 - pct);
      bar.style.width = (pct * 100) + '%';
      num.textContent = remaining;

      if (remaining <= 3) {
        arc.classList.add('urgent');
        bar.style.background = 'linear-gradient(90deg,#EF476F,#FF8C42)';
        num.style.color = '#EF476F';
        // Pulse the card
        document.getElementById('mcq-card').style.borderColor = 'rgba(239,71,111,0.6)';
      }

      if (remaining <= 0) {
        stopMCQTimer();
        onTimerExpired();
      }
    }, 1000);
  });
}

// Boss MCQ — reuses the same MCQ UI but with boss questions (cycles through level questions)
function showBossMCQ(g) {
  if (!g.level.boss || !g.level.boss.alive) return;
  const questions = g.level.questions.filter(isMcqQuestion);
  if (!questions || questions.length === 0) return;
  const qi = g.bossCurrentQ % questions.length;
  const q = questions[qi];
  g.bossLastQ = q;
  g.state = 'answering';

  // Build choices — no platRef needed for boss fight
  const choices = [
    {label: q.correct, isCorrect: true, platRef: null},
    {label: q.wrong[0], isCorrect: false, platRef: null},
    {label: q.wrong[1], isCorrect: false, platRef: null},
  ];
  // Shuffle
  for (let i=choices.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [choices[i],choices[j]]=[choices[j],choices[i]];
  }
  mcqShuffled = choices;

  const mcqEl = document.getElementById('mcq-overlay');
  const questionEl = document.getElementById('mcq-question-text');
  const btnContainer = document.getElementById('mcq-choices');
  if (!mcqEl || !questionEl || !btnContainer) { g.state='playing'; g.bossMCQActive=false; return; }

  stopMCQTimer();

  // Boss badge on question text
  questionEl.innerHTML = `<span style="color:#EF4444;font-size:0.8em;">👑 BOSS QUESTION ${qi+1}/${questions.length}</span><br>${esc(q.q)}`; // bug6 xss fix
  // Update hint
  const hint = document.getElementById('mcq-hint');
  if (hint) hint.textContent = 'Attack Grammar King! 👑';
  // Boss badge
  const badge = document.getElementById('mcq-badge');
  if (badge) badge.textContent = '👑 Boss Fight!';

  mcqMode = 'boss';
  renderMcqButtons();
  document.getElementById('mcq-progress').innerHTML = '';
  mcqEl.classList.remove('hidden');
  if (getSettings().autoRead) speakQuestion(q);
}

function selectBossAnswer(choice, g) {
  if (!g || !g.level.boss) return;
  mcqShuffled.forEach((c, i) => {
    const b = document.getElementById(`mcq-btn-${i}`);
    b.disabled = true;
    if (c === choice) b.classList.add(choice.isCorrect ? 'correct-flash' : 'wrong-flash');
    else if (c.isCorrect && !choice.isCorrect) b.classList.add('correct-flash');
  });
  setTimeout(() => {
    hideMCQ();
    g.state = 'playing';
    g.bossCurrentQ++;
    const boss = g.level.boss;

    if (choice.isCorrect) {
      Audio.correct();
      g.score += 100;

      // Flash screen green
      const fl = document.getElementById('correct-flash');
      if (fl) { fl.style.opacity='0.5'; setTimeout(()=>fl.style.opacity='0',300); }

      // Ball rushes toward boss
      const dx = (boss.x + boss.w/2) - g.px;
      const dy = (boss.y + boss.h/2) - g.py;
      const dist = Math.sqrt(dx*dx+dy*dy)||1;
      g.pvx = (dx/dist) * 18;
      g.pvy = (dy/dist) * 14;
      spawnTextParticle(g.px, g.py-35, '⚡ ATTACK!', '#FFD166');

      // Ball hits boss after ~260ms — show impact
      setTimeout(() => {
        if (!boss || !boss.alive) return;
        boss.takeDamage();
        spawnParticles(boss.x+boss.w/2, boss.y+boss.h/2, '#06D6A0', 28, 10);
        spawnParticles(boss.x+boss.w/2, boss.y+boss.h/2, '#FFD166', 14, 7);
        spawnTextParticle(boss.x+boss.w/2, boss.y-30, '💥 HIT!', '#06D6A0');
        g.pvx = -g.pvx * 0.5;
        g.pvy = -8;
      }, 280);

      // Release after animation fully plays (~1800ms total)
      setTimeout(() => { g.bossMCQActive = false; }, 1800);

    } else {
      Audio.wrong();

      // Flash screen red
      const fl = document.getElementById('damage-flash');
      if (fl) { fl.style.opacity='0.6'; setTimeout(()=>fl.style.opacity='0',400); }

      recordWrong(g, g.bossLastQ, choice.label);

      // Boss shows charge face then rushes at ball
      boss.startCharge();
      spawnTextParticle(boss.x+boss.w/2, boss.y-30, '😤 RAGE!', '#FF4D6D');
      setTimeout(() => {
        if (!boss||!boss.alive) return;
        boss.startAttack(g.px, g.py);
        spawnTextParticle(g.px, g.py-40, '💢 Boss attacks!', '#FF4D6D');
      }, 400);

      // Release after boss attack animation (~2500ms total)
      setTimeout(() => { g.bossMCQActive = false; }, 2500);
    }
  }, choice.isCorrect ? 500 : 800);
}

// ── Sentence ordering ──────────────────────────
let orderWords = [], orderBuilt = [], orderGame = null, orderQ = null;

function showOrderQuestion(g, q) {
  orderGame = g; orderQ = q;
  orderWords = [...q.words]; // shuffled copy
  for (let i=orderWords.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[orderWords[i],orderWords[j]]=[orderWords[j],orderWords[i]];}
  orderBuilt = [];

  document.getElementById('mcq-question-text').textContent = '🔤 Put the words in order:';
  document.getElementById('mcq-hint').textContent = 'Tap words to build the sentence!';
  document.getElementById('mcq-choices').style.display = 'none';
  document.getElementById('order-panel').style.display = 'block';
  renderOrderPanel();

  const mcqEl = document.getElementById('mcq-overlay');
  mcqEl.classList.remove('hidden');
  applyMCQPowerUps(g);
  stopMCQTimer();
  startMCQTimer(g);
}

function renderOrderPanel() {
  const built = document.getElementById('order-built');
  built.textContent = orderBuilt.join(' ') || '(tap words below)';
  const wordsEl = document.getElementById('order-words');
  wordsEl.innerHTML = orderWords.map((w,i) =>
    `<button onclick="orderTap(${i})"
      style="padding:8px 14px;border-radius:10px;border:1.5px solid rgba(255,209,102,.5);
             background:rgba(255,209,102,.15);color:#FFD166;font-family:'Fredoka One',cursive;
             font-size:1rem;cursor:pointer;">${esc(w)}</button>` // bug6 xss fix
  ).join('');
}

function orderTap(idx) {
  orderBuilt.push(orderWords[idx]);
  orderWords.splice(idx, 1);
  renderOrderPanel();
}

function orderUndo() {
  if (!orderBuilt.length) return;
  orderWords.push(orderBuilt.pop());
  renderOrderPanel();
}

function orderSubmit() {
  if (!orderGame || !orderQ) return;
  const answer = orderBuilt.join(' ');
  const isCorrect = answer === orderQ.words.join(' ');
  const g = orderGame, q = orderQ;
  orderGame = null; orderQ = null;
  finishSpecialQuestion(g, q, isCorrect, answer || '(no answer)');
}

// Shared ending for pop-up question types (order, spot, listen, picture)
function finishSpecialQuestion(g, q, isCorrect, answerLabel) {
  hideMCQ();
  mcqMode = 'normal';
  specialQ = null;
  g.state = 'playing';
  const qIdx = g.level.questions.indexOf(q);
  if (qIdx >= 0) g.currentQ = qIdx;
  if (g.mcqOpenTime) { (g.answerTimes = g.answerTimes || []).push((Date.now() - g.mcqOpenTime) / 1000); g.mcqOpenTime = null; }
  if (isCorrect) {
    g.answeredQuestions.add(g.currentQ);
    revealSiblingPlatforms(g, g.currentQ);
    g.combo++;
    const multiplier = g.combo>=10?5:g.combo>=5?3:g.combo>=3?2:1;
    const earned = 100 * multiplier * (g.useDouble?2:1);
    g.useDouble = false;
    g.score += earned;
    Audio.correct(g.combo);
    spawnParticles(g.px,g.py,'#06D6A0',20,8);
    spawnTextParticle(g.px,g.py-50,`+${earned} ✅`,'#06D6A0');
    showCorrectBanner(g.combo, multiplier);
    g.correctGlow = 30;
    updateComboHUD(g.combo);
    g.currentQ = Math.min(g.currentQ+1, g.level.questions.length-1);
    updateQuestionUI(g); updateHUD(g); mpSendScore(g);
    g.pvy = -5; g.pvx = 0;
  } else {
    g.combo = 0; updateComboHUD(0);
    spawnParticles(g.px,g.py,'#EF476F',14,5);
    spawnTextParticle(g.px,g.py-30,'Not quite! ✗','#EF476F');
    recordWrong(g, q, answerLabel);
    g.specialCooldownUntil = Date.now() + 1500;
    if (!tryShield(g)) {
      if (g.level.jumpMode) playerTakeDamage(g, false, 0.5, false);
      else playerTakeDamage(g);
    }
  }
}

// ── Spot the mistake, listening and picture questions ──
let specialQ = null;
let specialGame = null;

function showSpecialQuestion(g, q) {
  specialQ = q;
  specialGame = g;
  g.state = 'answering';
  g.mcqOpenTime = Date.now();
  const t = SPECIAL_TYPES[q.type];
  const text = document.getElementById('mcq-question-text');
  const hint = document.getElementById('mcq-hint');
  const spot = document.getElementById('spot-panel');
  document.getElementById('mcq-badge').textContent = `${t.icon} ${t.prompt}`;
  document.getElementById('order-panel').style.display = 'none';
  document.getElementById('mcq-progress').innerHTML = '';
  if (q.type === 'spot') {
    text.textContent = 'One word is wrong. Tap it!';
    hint.textContent = 'Read the whole sentence carefully 🔎';
    document.getElementById('mcq-choices').style.display = 'none';
    spot.style.display = 'flex';
    spot.innerHTML = '';
    q.words.forEach((w, i) => {
      if (/^[.?!,]$/.test(w)) return;
      const b = document.createElement('button');
      b.className = 'spot-word';
      b.textContent = w;
      b.setAttribute('aria-label', `Word ${i + 1}: ${w}`);
      b.onclick = () => spotPick(i, b);
      spot.appendChild(b);
    });
  } else {
    spot.style.display = 'none';
    document.getElementById('mcq-choices').style.display = '';
    if (q.type === 'listen') {
      text.innerHTML = '<button class="listen-big" onclick="playListening(specialQ)" aria-label="Play the sentence again">🔊 Play again</button>';
      hint.textContent = 'Listen, then choose the sentence you heard (press R to replay).';
      playListening(q);
    } else {
      text.innerHTML = `<div class="picture-q" role="img" aria-label="${esc(q.alt || 'picture')}">${esc(q.emoji)}</div>`;
      hint.textContent = 'Which sentence matches the picture?';
    }
    mcqShuffled = [{ label: q.correct, isCorrect: true, platRef: null }, ...q.wrong.map(w => ({ label: w, isCorrect: false, platRef: null }))];
    for (let i = mcqShuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [mcqShuffled[i], mcqShuffled[j]] = [mcqShuffled[j], mcqShuffled[i]]; }
    mcqMode = 'special';
    renderMcqButtons();
  }
  applyMCQPowerUps(g);
  g.bonusTime = (g.bonusTime || 0) + t.extraTime;
  document.getElementById('mcq-overlay').classList.remove('hidden');
  startMCQTimer(g);
  if (g.useHint && q.type !== 'spot') { g.useHint = false; requestAnimationFrame(applyHintToButtons); }
}

function spotPick(i, btn) {
  const q = specialQ, g = specialGame;
  if (!q || !g) return;
  stopMCQTimer();
  const isCorrect = i === q.wrong;
  document.querySelectorAll('#spot-panel .spot-word').forEach(b => { b.disabled = true; });
  btn.classList.add(isCorrect ? 'right' : 'wrong');
  if (!isCorrect) {
    const all = [...document.querySelectorAll('#spot-panel .spot-word')];
    const target = all.find(b => b.getAttribute('aria-label').startsWith(`Word ${q.wrong + 1}:`));
    if (target) { target.classList.add('right'); target.textContent = `${q.words[q.wrong]} → ${q.fix}`; }
  } else {
    btn.textContent = `${q.words[q.wrong]} → ${q.fix}`;
  }
  isCorrect ? Audio.correct() : Audio.wrong();
  setTimeout(() => finishSpecialQuestion(g, q, isCorrect, q.words[i]), isCorrect ? 900 : 1600);
}

function selectSpecialAnswer(idx) {
  const q = specialQ, g = specialGame;
  const choice = mcqShuffled[idx];
  if (!q || !g || !choice) return;
  stopMCQTimer();
  mcqShuffled.forEach((c, i) => {
    const b = document.getElementById(`mcq-btn-${i}`);
    b.disabled = true;
    if (c.isCorrect) b.classList.add('correct-flash');
    else if (i === idx) b.classList.add('wrong-flash');
  });
  choice.isCorrect ? Audio.correct() : Audio.wrong();
  setTimeout(() => finishSpecialQuestion(g, q, choice.isCorrect, choice.label), choice.isCorrect ? 700 : 1300);
}

// Listening clips: pre-generated MP3 when available (npm run listening), otherwise the browser voice
let listenManifest = {};
fetch('/audio/story/listen.json').then(r => r.ok ? r.json() : {}).then(m => { listenManifest = m || {}; }).catch(() => {});
let listenAudio = null;
function playListening(q) {
  if (!q) return;
  if (listenAudio) listenAudio.pause();
  const file = listenManifest[narrationHash(q.say)];
  if (file) {
    listenAudio = document.createElement('audio');
    listenAudio.src = `/audio/story/${file}`;
    listenAudio.play().catch(() => speak(q.say, { rate: 0.8 }));
  } else {
    speak(q.say, { rate: 0.8 });
  }
}

function stopMCQTimer() {
  if (mcqTimerId) { clearInterval(mcqTimerId); mcqTimerId = null; }
  // Reset urgent styling
  const arc = document.getElementById('mcq-timer-arc');
  const num = document.getElementById('mcq-timer-num');
  if (arc) { arc.classList.remove('urgent'); }
  if (num) { num.style.color = '#fff'; }
  const card = document.getElementById('mcq-card');
  if (card) card.style.borderColor = '';
}

function onTimerExpired() {
  if (!game || game.state !== 'answering') return;
  const pending = specialQ || orderQ;
  if (pending) {
    Audio.wrong();
    orderGame = null; orderQ = null;
    finishSpecialQuestion(game, pending, false, '(no answer)');
    return;
  }
  for (let i=0;i<3;i++) document.getElementById(`mcq-btn-${i}`).disabled = true;
  document.getElementById('mcq-hint').textContent = '⏱️ Time\'s up! Try again...';
  document.getElementById('mcq-hint').style.color = '#EF476F';

  Audio.wrong();
  if (game) { game.combo = 0; updateComboHUD(0); recordWrong(game, game.level.questions[game.currentQ], '(no answer)'); }
  setTimeout(() => {
    if (!game) return; // game may have ended during the 900ms delay
    document.getElementById('mcq-hint').style.color = '';
    hideMCQ();
    game.mcqAnsweredSet.add(game.currentQ);
    game.state = 'playing';
    playerTakeDamage(game, false, 0.5);
  }, 900);
}

function selectAnswer(idx) {
  if (!game || game.state !== 'answering') return;
  const choice = mcqShuffled[idx];
  if (!choice) return;
  if (document.getElementById(`mcq-btn-${idx}`).disabled) return;
  if (mcqMode === 'boss') { selectBossAnswer(choice, game); return; }
  if (mcqMode === 'special') { selectSpecialAnswer(idx); return; }

  // Track answer time for progress report
  if (game.mcqOpenTime) {
    const elapsed = (Date.now() - game.mcqOpenTime) / 1000;
    if (!game.answerTimes) game.answerTimes = [];
    game.answerTimes.push(elapsed);
    game.mcqOpenTime = null;
  }

  const btn = document.getElementById(`mcq-btn-${idx}`);

  // Disable all buttons + stop timer immediately
  for (let i=0;i<3;i++) document.getElementById(`mcq-btn-${i}`).disabled=true;
  stopMCQTimer();

  // Flash feedback briefly, then resume game — player must jump to platform manually
  if (choice.isCorrect) {
    btn.classList.add('correct-flash');
    Audio.correct();
  } else {
    btn.classList.add('wrong-flash');
    Audio.wrong();
    mcqShuffled.forEach((c,i) => {
      if (c.isCorrect) document.getElementById(`mcq-btn-${i}`).classList.add('correct-flash');
    });
    recordWrong(game, game.level.questions[game.currentQ], choice.label);
  }

  setTimeout(() => {
    hideMCQ();
    // Mark this question as MCQ-answered so jump won't re-trigger MCQ
    if (game) game.mcqAnsweredSet.add(game.currentQ);
    if (game && choice.isCorrect) game.mcqCorrectSet.add(game.currentQ);

    // Highlight chosen platform so player knows where to jump
    if (choice.platRef && !choice.platRef.dead) {
      choice.platRef.chosen = true;
    }
    // Highlight correct platform; mark wrong platforms red (no effect on land)
    mcqShuffled.forEach(c => {
      if (c.isCorrect && c.platRef && !c.platRef.dead) c.platRef.isHinted = true;
      if (!c.isCorrect && c.platRef && !c.platRef.dead && choice.isCorrect) c.platRef.wrongAnswered = true;
    });

    if (choice.isCorrect && game) {
      // Correct → enemies mati dengan particles
      const qIdx = game.currentQ;
      for (const e of game.level.enemies) {
        if (e.questionIdx === qIdx && e.alive) {
          e.die(0);
          spawnParticles(e.x+e.w/2, e.y+e.h/2, '#06D6A0', 12, 5);
          spawnTextParticle(e.x+e.w/2, e.y-20, '✓ Defeated!', '#06D6A0');
        }
      }
    } else if (game) {
      // Salah → musuh masuk attack mode: terus ke arah bola
      const qIdx = game.currentQ;
      const guardEnemies = game.level.enemies.filter(e => e.questionIdx === qIdx && e.alive);
      if (guardEnemies.length > 0) {
        // Ada musuh — biar musuh attack
        for (const e of guardEnemies) e.startAttack(game.px, game.py);
      } else {
        // Tiada musuh (easy level) — terus bagi -½ nyawa
        playerTakeDamage(game, false, 0.5);
        spawnTextParticle(game.px, game.py - 30, '-½ ❤', '#FF4D6D');
      }
    }
    // Co-op mode: submit answer and wait for partner before resuming
    if (coopMode && socket && coopRoom) {
      const qIdx = game.currentQ;
      if (choice.isCorrect) {
        // Don't let normal platform-landing handle question advancement
        coopSubmitAnswer(qIdx, true);
        // Keep state in 'answering' until coopResult arrives
        return;
      } else {
        coopSubmitAnswer(qIdx, false);
      }
    }
    game.state = 'playing';
  }, choice.isCorrect ? 500 : 900);
}

const joinWords = words => words.join(' ').replace(/ ([.?!,])/g, '$1');
// Stable text used as the key for missed-question tracking
function questionText(q) {
  if (!q) return '';
  if (q.type === 'order') return joinWords(q.words);
  if (q.type === 'spot') return `spot: ${joinWords(q.words)}`;
  if (q.type === 'listen') return `listen: ${q.say}`;
  if (q.type === 'picture') return `picture: ${q.emoji} ${q.correct}`;
  return q.q;
}
function correctText(q) {
  if (q.type === 'order') return joinWords(q.words);
  if (q.type === 'spot') return joinWords(q.words.map((w, i) => i === q.wrong ? q.fix : w));
  return q.correct;
}
// What a pupil sees when the question is listed (review screen)
function questionPrompt(q) {
  if (q.type === 'spot') return `🔎 Find the mistake: ${joinWords(q.words)}`;
  if (q.type === 'listen') return '🎧 Listen and choose';
  if (q.type === 'picture') return `${q.emoji} Which sentence matches?`;
  if (q.type === 'order') return '🔤 Put the words in order';
  return q.q;
}

function recordWrong(g, q, label) {
  if (!q) return;
  const text = questionText(q);
  srRecordWrong(g.level.key, text);
  if (!g.wrongAnswers.find(w => w.question === text)) {
    g.wrongAnswers.push({ q, question: text, wrongLabel: label, correctLabel: correctText(q) });
  }
  showExplainToast(q.tip || '', `✗ Correct answer: "${correctText(q)}"`, q);
}

function processAnswerResult(g, label, isCorrect, plat) {
  const qIdx = g.currentQ;

  if (plat && !plat.revealed) {
    plat.revealed = true;
  }
  // Reveal all sibling platforms (jump mode keeps them open after a wrong landing so the pupil can retry)
  if (isCorrect || !g.level.jumpMode) revealSiblingPlatforms(g, qIdx);

  if (isCorrect) {
    g.answeredQuestions.add(qIdx);
    g.combo++;

    // Streak tiers: 1× base, 2× at 3-streak, 3× at 5-streak, 5× at 10-streak
    const multiplier = g.combo >= 10 ? 5 : g.combo >= 5 ? 3 : g.combo >= 3 ? 2 : 1;
    const base = 100;
    const doubleBonus = g.useDouble ? 2 : 1;
    if (g.useDouble) { g.useDouble = false; spawnTextParticle(g.px, g.py-70, '2× Power-Up! 🟢', '#06D6A0'); }
    const earned = base * multiplier * doubleBonus;
    g.score += earned;

    Audio.correct(g.combo);
    // World-space particles at ball position
    const particleColor = g.combo >= 10 ? '#FF80FF' : g.combo >= 5 ? '#FFE566' : '#06D6A0';
    spawnParticles(g.px, g.py, particleColor, g.combo >= 5 ? 35 : 20, g.combo >= 5 ? 11 : 8);
    spawnConfetti(g.px, g.py, g.combo >= 5 ? 80 : g.combo >= 3 ? 50 : 30);
    spawnTextParticle(g.px, g.py-50,
      multiplier > 1 ? `+${earned} ⚡ ${multiplier}×!` : `+${earned} ⭐`,
      g.combo >= 10 ? '#FF80FF' : g.combo >= 5 ? '#FFE566' : '#06D6A0');

    // Screen-level celebrations
    showCorrectBanner(g.combo, multiplier);
    if (g.combo >= 10) {
      spawnScreenConfetti(120);
      triggerScreenShake(12, 400);
    } else if (g.combo >= 5) {
      spawnScreenConfetti(70);
      triggerScreenShake(6, 250);
    } else if (g.combo >= 3) {
      spawnScreenConfetti(40);
    }

    // Ball glow burst
    g.correctGlow = 30; // frames of green glow on ball
    updateComboHUD(g.combo);

    g.currentQ = Math.min(g.currentQ+1, g.level.questions.length-1);
    updateQuestionUI(g);
    updateHUD(g);
    mpSendScore(g);
    g.pvy = -5; g.pvx = 0;
    g.state = 'playing';
  } else {
    g.combo = 0;
    updateComboHUD(0);
    if (plat) { plat.crumbling = true; }
    spawnParticles(g.px, g.py, '#EF476F', 14, 5);
    spawnTextParticle(g.px, g.py-30, 'Wrong! ✗', '#EF476F');
    recordWrong(g, g.level.questions[qIdx], label);
    g.state = 'playing';
    // Shield absorbs one wrong answer
    if (!tryShield(g)) {
      if (g.level.jumpMode) playerTakeDamage(g, false, 0.5, false);
      else playerTakeDamage(g);
    }
  }
}

function playerTakeDamage(g, fell=false, amount=1, respawn=true) {
  if (g.invincible > 0) return;
  g.damageTaken = (g.damageTaken || 0) + amount; // track for no-damage achievement
  g.hearts = Math.max(0, g.hearts-amount);
  g.invincible = 90;
  Audio.death();
  spawnParticles(g.px, g.py,'#EF476F',20,7);

  const flash = document.getElementById('damage-flash');
  flash.style.opacity='1'; setTimeout(()=>flash.style.opacity='0',400);

  // Shake HUD hearts
  document.getElementById('hud-hearts').classList.add('shake');
  setTimeout(()=>document.getElementById('hud-hearts').classList.remove('shake'),500);

  updateHUD(g);

  if (g.hearts <= 0) {
    g.state='dead';
    hideMCQ();
    markPlayedToday();
    postAttempt(g, false, 0);
    setTimeout(()=>{
      const el=document.getElementById('gameover-overlay');
      el.classList.remove('hidden');
    },600);
    return;
  }

  if (!respawn) { g.pvy = Math.max(g.pvy, 2); return; }

  // Respawn — teleport to a safe position
  if (g.checkpoint) {
    g.px = g.checkpoint.px;
    g.py = g.checkpoint.py - 40;
  } else {
    g.px = 80;
    g.py = g.level.groundY - 60;
  }
  g.pvx = 0;
  g.pvy = -4;
}

function triggerWin(g) {
  if (g.state==='win') return;
  g.state='win';
  // Ensure MCQ overlay is hidden so win screen is fully visible
  hideMCQ();
  stopMCQTimer();
  Audio.star();
  spawnParticles(g.px,g.py,'#FFD166',24,8);

  const elapsed = (Date.now()-g.startTime)/1000;
  const answeredAll = g.answeredQuestions.size >= g.level.questions.length;
  let stars = 1;
  if (answeredAll) stars=2;
  if (answeredAll && g.hearts>=g.maxHearts) stars=3;
  if (elapsed < 60 && answeredAll && g.hearts>1) stars=Math.max(stars,2);

  totalScore += g.score;
  // Achievement stats
  const isBossLevel = g.level.difficulty === 'boss' || (g.level.key && GRAMMAR_DB[g.level.key]?.difficulty === 'boss');
  const noDamage = !g.damageTaken; // true only if playerTakeDamage was never called
  recordLevelStars(g.level.key, stars);
  updateAchStats({
    levelsWon: 1,
    maxStreak: Math.max(0, g.combo),
    totalScore: g.score,
    perfectLevels: (g.wrongAnswers && g.wrongAnswers.length === 0) ? 1 : 0,
    bossDefeated: isBossLevel ? 1 : 0,
    bossDefeatedNoDmg: (isBossLevel && noDamage) ? 1 : 0,
    skinsUnlocked: SKINS.filter(s => isSkinUnlocked(s.id)).length,
  });
  // Accumulate total stars for skin unlocks
  const prevTotalStars = getTotalStars();
  const newTotal = prevTotalStars + stars;
  try { localStorage.setItem(pk('gr_total_stars'), newTotal); } catch(e) {}
  // bug14 fix: persist total score so dbSyncProgress reads a real value
  const prevTotalScore = parseInt((function(){ try { return localStorage.getItem(pk('gr_total_score')); } catch(e){ return '0'; } })() || '0');
  try { localStorage.setItem(pk('gr_total_score'), prevTotalScore + g.score); } catch(e) {}
  checkSkinUnlocks(prevTotalStars, newTotal);
  markPlayedToday();
  postAttempt(g, true, stars);
  renderUnlockProgress(newTotal);
  // Notify multiplayer opponent that we won
  mpSendWin(g);
  document.getElementById('stars-row').textContent = '⭐'.repeat(stars) + '☆'.repeat(3-stars);
  document.getElementById('win-msg').textContent =
    `Score: ${g.score} | Time: ${Math.round(elapsed)}s | ${g.hearts} ❤️ remaining`;

  // Populate progress report
  const totalQ = g.level.questions.length;
  const correctCount = g.answeredQuestions.size;
  const mistakeCount = g.wrongAnswers ? g.wrongAnswers.length : 0;
  const accuracy = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 100;
  const avgTime = g.answerTimes && g.answerTimes.length > 0
    ? (g.answerTimes.reduce((a,b)=>a+b,0)/g.answerTimes.length).toFixed(1) + 's'
    : '—';
  document.getElementById('pr-accuracy').textContent = accuracy + '%';
  document.getElementById('pr-time').textContent = avgTime;
  document.getElementById('pr-mistakes').textContent = mistakeCount;
  const weakEl = document.getElementById('pr-weak');
  const weakList = document.getElementById('pr-weak-list');
  if (mistakeCount > 0 && g.wrongAnswers) {
    const topics = g.wrongAnswers.map(wa => {
      const q = g.data.questions.find(x => x.q === wa.question);
      return q && q.tip ? q.tip.split('.')[0] : wa.question.replace('___','...');
    }).filter((v,i,a)=>a.indexOf(v)===i).slice(0,3);
    weakList.textContent = topics.join(' · ');
    weakEl.style.display = 'block';
  } else {
    weakEl.style.display = 'none';
  }

  // Clear win preview until name submitted
  const prev = document.getElementById('win-lb-preview');
  if (prev) prev.innerHTML = '';

  // Boss level → show ending cutscene before win overlay
  // Delayed steps check the same game is still running (the player may have quit to the menu)
  const showWin = () => {
    if (game !== g) return;
    document.getElementById('win-overlay').classList.remove('hidden');
    setTimeout(() => { if (game === g) promptPlayerName(g.level.key, g.score, stars); }, 600);
  };
  setTimeout(() => {
    if (game !== g) return;
    if (isBossLevel) showEndingCutscene(showWin);
    else showWin();
  }, 800);
}

// ══════════════════════════════════════════════
//  HUD UPDATE
// ══════════════════════════════════════════════
function updateHUD(g) {
  const data = g.data || GRAMMAR_DB[g.level.key];
  document.getElementById('hud-score').textContent = g.score;
  document.getElementById('world-badge').textContent = data.world;

  const heartsEl = document.getElementById('hud-hearts');
  if (heartsEl.children.length !== g.maxHearts) {
    heartsEl.innerHTML = Array.from({length:g.maxHearts}, () => '<div class="heart-icon">♥</div>').join('');
  }
  if (heartsEl.dataset.v !== String(g.hearts)) {
    heartsEl.dataset.v = String(g.hearts);
    heartsEl.setAttribute('aria-label', `${g.hearts} of ${g.maxHearts} hearts`);
    [...heartsEl.children].forEach((h, i) => {
      const full = g.hearts >= i + 1;
      const half = !full && g.hearts >= i + 0.5;
      h.classList.toggle('lost', !full && !half);
      h.classList.toggle('half', half);
    });
  }
}

function updateWordHUD(g) {
  const el = document.getElementById('word-progress');
  const letters = g.level.letters;
  if (!letters.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const shown = [...letters].sort((a, b) => a.idx - b.idx).map(l => l.collected ? l.ch : '_').join(' ');
  el.textContent = `🔤 ${shown}`;
  el.setAttribute('aria-label', `Letters collected: ${shown.replace(/_/g, 'blank')}`);
}

function updateQuestionUI(g) {
  const q = g.level.questions[g.currentQ];
  if (!q) {
    document.getElementById('question-box').innerHTML = '✅ All questions answered!';
    return;
  }
  if (isSpecial(q)) {
    const t = SPECIAL_TYPES[q.type];
    document.getElementById('question-box').textContent = `${t.icon} ${t.prompt}!`;
    return;
  }
  const parts = q.q.split('___');
  document.getElementById('question-box').innerHTML =
    `${esc(parts[0])}<span id="question-blank">___</span>${esc(parts[1] || '')}`; // bug6 xss fix
}

