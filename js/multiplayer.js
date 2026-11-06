// ══════════════════════════════════════════════
//  MULTIPLAYER
// ══════════════════════════════════════════════
const MP_SERVER = window.location.origin; // bug4 fix: connect to same origin, not hardcoded localhost
let socket = null;
let mpRoom = null;       // current room code
let mpRole = null;       // 'host' | 'guest'
let mpConnected = false;

// Ghost opponent state (lerp target)
const opponent = {
  x: 0, y: 0,
  vx: 0, vy: 0,
  rot: 0,
  targetX: 0, targetY: 0, targetRot: 0,
  name: 'Lawan',
  avatar: null,   // HTMLImageElement or null
  score: 0, currentQ: 0, hearts: 3,
  active: false,
};

function mpConnect() {
  if (socket && socket.connected) return;
  socket = io(MP_SERVER, { transports: ['websocket'] });
  socket._coopWired = false; // reset per new socket instance

  socket.on('connect', () => {
    mpConnected = true;
    console.log('[MP] Connected to server');
  });

  socket.on('disconnect', () => {
    mpConnected = false;
    console.log('[MP] Disconnected');
  });

  socket.on('opponentJoined', ({ name, avatar }) => {
    mpSetOpponent(name, avatar);
    document.getElementById('mp-status').textContent = `${name} has joined! Game starting...`;
    document.getElementById('mp-status').classList.remove('waiting');
    setTimeout(() => {
      closeMultiplayer();
      const levelKey = document.getElementById('mp-level-select').value;
      startLevel(...levelKey.split('-').map(Number));
    }, 1500);
  });

  socket.on('opponentDataUpdate', ({ name, avatar }) => mpSetOpponent(name, avatar));

  socket.on('opponentPosition', ({ x, y, vx, vy, rot }) => {
    opponent.targetX = x; opponent.targetY = y;
    opponent.vx = vx; opponent.vy = vy;
    opponent.targetRot = rot;
  });

  socket.on('opponentScore', ({ score, currentQ, hearts }) => {
    opponent.score = score; opponent.currentQ = currentQ; opponent.hearts = hearts;
    updateOpponentHUD();
  });

  socket.on('opponentReady', ({ levelKey }) => {
    // Guest: start same level
    closeMultiplayer();
    startLevel(...levelKey.split('-').map(Number));
  });

  socket.on('raceResult', ({ winner, score, stars }) => {
    const isMe = winner === document.getElementById('mp-name-input').value.trim();
    document.getElementById('race-result-title').textContent = isMe ? '🏆 You Win!' : '😢 You Lose';
    document.getElementById('race-result-sub').textContent = isMe
      ? `Congratulations! Score: ${score}`
      : `${winner} wins with score ${score}!`;
    document.getElementById('race-result').classList.remove('hidden');
  });

  socket.on('opponentLeft', () => {
    opponent.active = false;
    document.getElementById('opponent-hud').classList.remove('visible');
    showBanner('Opponent has left the room', '#EF476F');
  });

  socket.on('connect_error', () => {
    document.getElementById('mp-error').textContent = 'Cannot connect to server. Please check your connection.';
  });
}

function mpSetOpponent(name, avatarB64) {
  opponent.name = name;
  opponent.active = true;
  if (avatarB64) {
    const img = new Image();
    img.src = avatarB64;
    img.onload = () => { opponent.avatar = img; };
  }
  updateOpponentHUD();
  document.getElementById('opponent-hud').classList.add('visible');
}

function updateOpponentHUD() {
  document.getElementById('opp-name').textContent = opponent.name;
  document.getElementById('opp-score').textContent = `${opponent.score} pts`;
  document.getElementById('opp-q').textContent = `Question ${opponent.currentQ + 1}`;
  const avatarEl = document.getElementById('opp-avatar');
  if (opponent.avatar) {
    avatarEl.innerHTML = `<img src="${opponent.avatar.src}" alt="">`;
  } else {
    avatarEl.textContent = '👤';
  }
}

function showMultiplayer() {
  mpConnect();
  document.getElementById('mp-step-name').style.display = '';
  document.getElementById('mp-step-waiting').style.display = 'none';
  document.getElementById('mp-error').textContent = '';
  document.getElementById('mp-overlay').classList.remove('hidden');
  // Show connecting status while socket connects
  if (!mpConnected) {
    document.getElementById('mp-error').textContent = '⏳ Connecting to server...';
    const waitId = setInterval(() => {
      if (mpConnected) {
        document.getElementById('mp-error').textContent = '';
        clearInterval(waitId);
      }
    }, 300);
    setTimeout(() => { clearInterval(waitId); }, 5000);
  }
}

function closeMultiplayer() {
  document.getElementById('mp-overlay').classList.add('hidden');
}

function mpCreateRoom() {
  const name = document.getElementById('mp-name-input').value.trim();
  if (!name) { document.getElementById('mp-error').textContent = 'Please enter your name.'; return; }
  if (!socket || !socket.connected) {
    document.getElementById('mp-error').textContent = '⏳ Still connecting... try again shortly.';
    setTimeout(mpCreateRoom, 800); return;
  }

  const avatar = selfieDataURL || null;
  socket.emit('createRoom', { name, avatar }, ({ ok, code, error }) => {
    if (!ok) { document.getElementById('mp-error').textContent = error; return; }
    mpRoom = code; mpRole = 'host';
    document.getElementById('mp-code-val').textContent = code;
    document.getElementById('mp-step-name').style.display = 'none';
    document.getElementById('mp-step-waiting').style.display = '';
  });
}

function mpJoinRoom() {
  const name = document.getElementById('mp-name-input').value.trim();
  const code = document.getElementById('mp-join-code').value.trim().toUpperCase();
  if (!name) { document.getElementById('mp-error').textContent = 'Please enter your name.'; return; }
  if (code.length !== 4) { document.getElementById('mp-error').textContent = 'Room code must be 4 characters.'; return; }
  if (!socket || !socket.connected) { document.getElementById('mp-error').textContent = '⏳ Still connecting... try again shortly.'; return; }

  const avatar = selfieDataURL || null;
  socket.emit('joinRoom', { code, name, avatar }, ({ ok, error, opponent: oppData }) => {
    if (!ok) { document.getElementById('mp-error').textContent = error; return; }
    mpRoom = code; mpRole = 'guest';
    if (oppData) mpSetOpponent(oppData.name, oppData.avatar);
    // Tell host which level guest wants (host's selection is authoritative via opponentReady)
    const levelKey = document.getElementById('mp-level-select').value;
    socket.emit('levelReady', { levelKey });
    closeMultiplayer();
    startLevel(...levelKey.split('-').map(Number));
  });
}

function closeRaceResult() {
  document.getElementById('race-result').classList.add('hidden');
  opponent.active = false;
  document.getElementById('opponent-hud').classList.remove('visible');
  showMenu();
}

// ══════════════════════════════════════════════
//  CO-OP MODE
// ══════════════════════════════════════════════
let coopMode = false;
let coopRoom = null;
let coopPartnerName = '';
let coopMyAnswered = false;   // did I answer current question?
let coopPartnerAnswered = false; // did partner answer current question?
let coopCurrentQIdx = -1;

function showCoopMenu() {
  mpConnect(); // reuse same socket
  document.getElementById('coop-step-name').style.display = '';
  document.getElementById('coop-step-waiting').style.display = 'none';
  document.getElementById('coop-error').textContent = '';
  document.getElementById('coop-overlay').classList.remove('hidden');
  // Wire co-op socket events once per socket instance
  if (!socket._coopWired) {
    socket._coopWired = socket.id || true; // unique per connection

    socket.on('coopPartnerJoined', ({ name }) => {
      coopPartnerName = name;
      document.getElementById('coop-status').textContent = `${name} joined! Starting...`;
      document.getElementById('coop-status').classList.remove('waiting');
      setTimeout(() => {
        closeCoopMenu();
        coopStartLevel();
      }, 1500);
    });

    socket.on('coopPartnerAnswered', ({ qIdx, correct }) => {
      coopPartnerAnswered = true;
      document.getElementById('coop-partner-status').textContent = correct ? '✅ Answered!' : '❌ Wrong...';
    });

    socket.on('coopResult', ({ qIdx, allCorrect }) => {
      document.getElementById('coop-wait-banner').classList.add('hidden');
      coopMyAnswered = false;
      coopPartnerAnswered = false;
      document.getElementById('coop-partner-status').textContent = 'Waiting...';
      if (allCorrect) {
        // Both correct — advance the game
        coopAdvance();
      } else {
        // At least one wrong — show retry message
        showBanner('❌ Not both correct — try again!', '#EF476F');
        setTimeout(() => {
          if (game) {
            // Clear so MCQ re-triggers for this question
            game.mcqAnsweredSet.delete(game.currentQ);
            game.mcqCorrectSet.delete(game.currentQ);
            game.state = 'playing';
            showMCQ(game);
          }
        }, 1200);
      }
    });

    socket.on('coopPartnerLeft', () => {
      coopMode = false;
      coopRoom = null;
      document.getElementById('coop-hud').classList.remove('visible');
      showBanner('Partner has left the room', '#EF476F');
    });
  }
}

function closeCoopMenu() {
  document.getElementById('coop-overlay').classList.add('hidden');
}

function coopCreate() {
  const name = document.getElementById('coop-name-input').value.trim() || 'Player';
  if (!mpConnected) { document.getElementById('coop-error').textContent = '⏳ Still connecting…'; return; }
  socket.emit('coopCreate', { name }, ({ ok, code, error }) => {
    if (!ok) { document.getElementById('coop-error').textContent = error; return; }
    coopRoom = code;
    document.getElementById('coop-code-val').textContent = code;
    document.getElementById('coop-step-name').style.display = 'none';
    document.getElementById('coop-step-waiting').style.display = '';
  });
}

function coopJoin() {
  const name = document.getElementById('coop-name-input').value.trim() || 'Player';
  const code = document.getElementById('coop-join-code').value.trim().toUpperCase();
  if (!code) { document.getElementById('coop-error').textContent = 'Enter a room code.'; return; }
  if (!mpConnected) { document.getElementById('coop-error').textContent = '⏳ Still connecting…'; return; }
  socket.emit('coopJoin', { code, name }, ({ ok, partnerName, error }) => {
    if (!ok) { document.getElementById('coop-error').textContent = error; return; }
    coopRoom = code;
    coopPartnerName = partnerName;
    closeCoopMenu();
    coopStartLevel();
  });
}

function coopStartLevel() {
  coopMode = true;
  coopMyAnswered = false;
  coopPartnerAnswered = false;
  document.getElementById('coop-partner-name').textContent = coopPartnerName || 'Partner';
  document.getElementById('coop-partner-status').textContent = 'In game';
  document.getElementById('coop-hud').classList.add('visible');
  const levelKey = document.getElementById('coop-level-select').value;
  startLevel(...levelKey.split('-').map(Number));
}

// Called after both players answer correctly — advance the question
function coopAdvance() {
  if (!game) return;
  const g = game;
  g.combo++;
  const multiplier = g.combo >= 10 ? 5 : g.combo >= 5 ? 3 : g.combo >= 3 ? 2 : 1;
  const earned = 100 * multiplier;
  g.score += earned;
  g.answeredQuestions.add(g.currentQ);
  Audio.correct(g.combo);
  spawnParticles(g.px, g.py, '#10B981', 25, 9);
  spawnTextParticle(g.px, g.py-50, `+${earned} 🤝 Co-op!`, '#10B981');
  showCorrectBanner(g.combo, multiplier);
  updateComboHUD(g.combo);
  g.correctGlow = 30;
  g.currentQ = Math.min(g.currentQ + 1, g.level.questions.length - 1);
  updateQuestionUI(g);
  updateHUD(g);
  g.state = 'playing';
  if (g.answeredQuestions.size >= g.level.questions.length) {
    setTimeout(() => { if (game) triggerWin(game); }, 600);
  }
}

// Called from selectAnswer when coopMode is on
function coopSubmitAnswer(qIdx, correct) {
  coopCurrentQIdx = qIdx;
  coopMyAnswered = true;
  if (correct) {
    // Show wait banner; pause physics until coopResult arrives
    document.getElementById('coop-wait-banner').classList.remove('hidden');
    if (game) game.state = 'coop-waiting';
    // Safety: escape coop-waiting after 10s if server never responds
    setTimeout(() => {
      if (game && game.state === 'coop-waiting') {
        game.state = 'playing';
        document.getElementById('coop-wait-banner').classList.add('hidden');
        showBanner('⚠️ Connection timeout — continuing solo', '#F59E0B');
      }
    }, 10000);
  } else {
    // Wrong: let game resume normally (partner will get notified, retry on result)
    if (game) game.state = 'playing';
  }
  socket.emit('coopAnswer', { qIdx, correct });
}

// Broadcast position every frame during multiplayer
let mpLastPosTick = 0;
function mpSendPosition(g) {
  if (!socket || !mpRoom || !opponent.active) return;
  const now = Date.now();
  if (now - mpLastPosTick < 50) return; // 20Hz
  mpLastPosTick = now;
  socket.emit('positionUpdate', { x: g.px, y: g.py, vx: g.pvx, vy: g.pvy, rot: g.pRot });
}

function mpSendScore(g) {
  if (!socket || !mpRoom) return;
  socket.emit('scoreUpdate', { score: g.score, currentQ: g.currentQ, hearts: g.hearts });
}

function mpSendWin(g) {
  if (!socket || !mpRoom) return;
  const name = document.getElementById('mp-name-input').value.trim() || 'Murid';
  const answeredAll = g.answeredQuestions.size >= g.level.questions.length;
  const stars = answeredAll && g.hearts >= g.maxHearts ? 3 : answeredAll ? 2 : 1;
  socket.emit('playerWon', { name, score: g.score, stars });
}

// Draw ghost opponent on canvas
function drawOpponent(ctx, camX, camY) {
  if (!opponent.active) return;
  // Lerp toward target
  opponent.x += (opponent.targetX - opponent.x) * 0.2;
  opponent.y += (opponent.targetY - opponent.y) * 0.2;
  opponent.rot += (opponent.targetRot - opponent.rot) * 0.2;

  const sx = opponent.x - camX;
  const sy = opponent.y - camY;
  const r = BALL_R;

  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.translate(sx, sy);
  ctx.rotate(opponent.rot);

  // Ghost ball (cyan tint)
  const grad = ctx.createRadialGradient(-r*0.3,-r*0.3,r*0.1,0,0,r);
  grad.addColorStop(0,'rgba(100,220,255,0.9)');
  grad.addColorStop(1,'rgba(0,120,200,0.8)');
  ctx.beginPath();
  ctx.arc(0,0,r,0,Math.PI*2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Avatar or emoji
  if (opponent.avatar) {
    ctx.save();
    ctx.rotate(-opponent.rot);
    ctx.beginPath();
    ctx.arc(0,0,r-2,0,Math.PI*2);
    ctx.clip();
    ctx.drawImage(opponent.avatar,-r+2,-r+2,(r-2)*2,(r-2)*2);
    ctx.restore();
  } else {
    ctx.rotate(-opponent.rot);
    ctx.font = `${r*1.1}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('👤',0,2);
  }

  // Name tag above
  ctx.rotate(0); // undo rotation for text
  ctx.font = 'bold 11px Nunito,sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillStyle='rgba(100,220,255,0.9)';
  ctx.fillText(opponent.name, 0, -r-4);

  ctx.restore();
}
