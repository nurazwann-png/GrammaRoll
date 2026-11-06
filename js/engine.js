// ══════════════════════════════════════════════
//  AUDIO MANAGER (Web Audio API)
// ══════════════════════════════════════════════
const Audio = (() => {
  let ctx = null;
  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };
  const tone = (freq, type, duration, vol=0.3, delay=0) => {
    try {
      const c = getCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
      o.start(c.currentTime + delay);
      o.stop(c.currentTime + delay + duration);
    } catch(e){}
  };
  return {
    jump()    { tone(320,  'sine',   .12, .25); tone(480, 'sine', .1, .2, .06); },
    land()    { tone(180,  'sine',   .08, .2); },
    correct(combo=1) {
      // Longer arpeggio for higher combos
      const notes  = combo>=3 ? [523,659,784,988,1319] : [523,659,784];
      const delays = combo>=3 ? [0,.1,.2,.3,.42]       : [0,.12,.24];
      delays.forEach((d,i)=>tone(notes[i],'sine',.22,.32,d));
    },
    wrong()   { tone(180, 'sawtooth',.2,.3); tone(120,'sawtooth',.3,.2,.1); },
    collect() { tone(880, 'sine',.1,.2); tone(1100,'sine',.1,.15,.08); },
    death()   { tone(300,'sawtooth',.15,.3);tone(200,'sawtooth',.2,.25,.12);tone(100,'square',.4,.2,.25); },
    enemy()   { tone(400,'square',.1,.2); tone(200,'sawtooth',.15,.25,.08); },
    checkpoint(){ [0,.1,.2,.3].forEach((d,i)=>tone([440,554,659,880][i],'sine',.25,.25,d)); },
    star()    { [0,.08,.16,.24].forEach((d,i)=>tone([659,784,988,1319][i],'sine',.3,.3,d)); },
  };
})();

// ══════════════════════════════════════════════
//  CANVAS + RESIZE
// ══════════════════════════════════════════════
const canvas = document.getElementById('game-canvas');
const ctx2d  = canvas.getContext('2d');
let CW = 0, CH = 0;

function resizeCanvas() {
  const hud = document.getElementById('hud');
  CW = canvas.width  = canvas.offsetWidth;
  CH = canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ══════════════════════════════════════════════
//  PHYSICS CONSTANTS
// ══════════════════════════════════════════════
const GRAV     = 0.48;
const MAX_FALL = 16;
const JUMP_VEL = -13.5;
const SPEED    = 5.2;
const FRICTION = 0.82;
const BOUNCE   = 0.2;
const BALL_R   = 22;
// Jump-to-answer layout: a jump rises ~190px (JUMP_VEL²/2·GRAV), so answers 150px above the walkway
// leave ~40px of margin; 60px gaps stop a jump landing on the neighbouring answer.
const JUMP_ANSWER_RISE = 150;
const JUMP_ANSWER_GAP  = 60;

function answerModeNow() {
  if (typeof coopMode !== 'undefined' && coopMode) return 'popup'; // co-op syncs answers via the pop-up
  return getSettings().answerMode === 'popup' ? 'popup' : 'jump';
}

// ══════════════════════════════════════════════
//  GAME STATE
// ══════════════════════════════════════════════
// bug6 fix: escape user-supplied strings before inserting into innerHTML
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let game = null;
let selfieCanvas  = null;
let selfieDataURL = null;
let cameraStream  = null;
let currentLevelKey = "1-1";
let totalScore = 0;

const keys = { left:false, right:false, up:false };
const ctrlState = { left:false, right:false, jump:false };
const tapFrames = { left:0, right:0, up:0 };
const TAP_MIN_FRAMES = { left:6, right:6, up:2 };
function consumeTapInputs() {
  for (const k in tapFrames) if (tapFrames[k] > 0) tapFrames[k]--;
}

// ══════════════════════════════════════════════
//  CONFETTI SYSTEM
// ══════════════════════════════════════════════
const CONFETTI_COLORS = ['#06D6A0','#FFD166','#FF8C42','#EF476F','#4A90D9','#8B5CF6','#fff'];

class Confetti {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = (Math.random()-0.5) * 14;
    this.vy = -10 - Math.random()*8;
    this.w  = 6 + Math.random()*8;
    this.h  = 3 + Math.random()*5;
    this.rot   = Math.random()*Math.PI*2;
    this.rotV  = (Math.random()-0.5)*0.35;
    this.color = CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)];
    this.life  = 70 + Math.random()*40;
    this.maxLife = this.life;
    this.shape = Math.random() < 0.4 ? 'circle' : 'rect'; // mix of shapes
  }
  update() {
    this.x  += this.vx;
    this.y  += this.vy;
    this.vy += 0.38;           // gravity
    this.vx *= 0.97;           // air drag
    this.rot += this.rotV;
    this.life--;
  }
  draw(ctx, camX, camY) {
    const a = Math.min(1, this.life / (this.maxLife * 0.4));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.translate(this.x - camX, this.y - camY);
    ctx.rotate(this.rot);
    if (this.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, this.w/2, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
    }
    ctx.restore();
  }
}

let confettiList = [];

function spawnConfetti(x, y, count=35) {
  if (prefersReducedMotion()) count = Math.min(count, 8);
  for (let i=0; i<count; i++) confettiList.push(new Confetti(x, y));
}

// Screen-space confetti burst (fixed position, no camera offset)
function spawnScreenConfetti(count=50) {
  if (prefersReducedMotion()) count = Math.min(count, 10);
  const cx = CW/2, cy = CH*0.45;
  for (let i=0; i<count; i++) {
    const c = new Confetti(cx, cy);
    // Wider spread for screen burst
    c.vx = (Math.random()-0.5)*20;
    c.vy = -8 - Math.random()*10;
    confettiList.push(c);
  }
}

let correctBannerTimer = null;

// Generic notification banner (colour, short message, auto-dismiss)
let _bannerTimer = null;
function showBanner(msg, color) {
  const el = document.getElementById('correct-banner');
  document.getElementById('correct-banner-main').textContent = msg;
  document.getElementById('correct-banner-sub').textContent  = '';
  document.getElementById('correct-banner-divider').style.display = 'none';
  el.style.background = color || '#333';
  el.classList.add('show');
  if (_bannerTimer) clearTimeout(_bannerTimer);
  _bannerTimer = setTimeout(() => { el.classList.remove('show'); el.style.background = ''; }, 2000);
}

function showCorrectBanner(combo, multiplier) {
  const TEXTS = [
    ['Correct! ✓',           ''],
    ['Great! 🔥',            '2 in a row!'],
    ['Amazing! ⚡',          `${multiplier}× Points!`],
    ['Excellent! 🌟',        `${multiplier}× Points!`],
    ['ON FIRE! 🔥🔥',        `${multiplier}× Points! Keep going!`],
    ['UNSTOPPABLE! ⚡⚡',    `${multiplier}× Points!`],
    ['LEGENDARY! 👑',        `${multiplier}× Points!`],
    ['ULTRA COMBO! 💥',      `${multiplier}× Points!`],
    ['GODLIKE! 🚀',          `${multiplier}× Points!`],
    ['GRAMMAR KING! 👑🔥',   `MAX ${multiplier}× POINTS!!`],
  ];
  const idx = Math.min(combo-1, TEXTS.length-1);
  const [main, sub] = TEXTS[idx];

  document.getElementById('correct-banner-main').textContent = main;
  document.getElementById('correct-banner-sub').textContent  = sub;
  document.getElementById('correct-banner-divider').style.display = sub ? 'block' : 'none';

  const banner = document.getElementById('correct-banner');
  banner.classList.add('show');
  if (correctBannerTimer) clearTimeout(correctBannerTimer);
  correctBannerTimer = setTimeout(() => banner.classList.remove('show'), 1100);

  // Screen flash
  const flash = document.getElementById('correct-flash');
  flash.style.opacity = '1';
  setTimeout(() => flash.style.opacity = '0', 400);
}

// ══════════════════════════════════════════════
//  PARTICLE SYSTEM
// ══════════════════════════════════════════════
class Particle {
  constructor(x,y,vx,vy,color,size=6,life=40) {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy;
    this.color=color; this.size=size;
    this.life=life; this.maxLife=life;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += 0.3; this.vx *= 0.95;
    this.life--;
  }
  draw(ctx,camX,camY) {
    const a = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x-camX, this.y-camY, this.size*a, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

function spawnParticles(x,y,color,count=12,speed=5) {
  if (!game) return;
  for (let i=0;i<count;i++) {
    const angle = (Math.PI*2*i/count) + Math.random()*0.4;
    const sp    = speed * (0.5 + Math.random());
    game.particles.push(new Particle(x,y, Math.cos(angle)*sp, Math.sin(angle)*sp-2, color, 4+Math.random()*5, 35+Math.random()*25));
  }
}

function spawnTextParticle(x,y,text,color='#FFD166') {
  if (!game) return;
  game.textParticles.push({x,y,vy:-2.5,text,color,life:55,maxLife:55});
}

// ══════════════════════════════════════════════
//  PLATFORM CLASS
// ══════════════════════════════════════════════
class Platform {
  constructor(x,y,w,h,type='solid',data={}) {
    this.x=x; this.y=y; this.w=w; this.h=h;
    this.type=type; // 'solid','grammar','start','goal','cloud'
    this.data=data; // {label, isCorrect, questionIdx}
    this.crumbling=false; this.crumbleTimer=0;
    this.revealed=false; // after landing
    this.glowPhase=Math.random()*Math.PI*2;
    this.bobOffset=Math.random()*Math.PI*2;
  }
  get isGrammar() { return this.type==='grammar'; }
  get isSolid()   { return !this.crumbling; }

  update(dt) {
    this.glowPhase += 0.06;
    this.bobOffset += 0.025;
    // Moving platform oscillation
    this._vx = 0; this._vy = 0;
    if (this.moving) {
      this.movePhase = (this.movePhase||0) + (this.moveSpeed||0.03);
      const delta = Math.sin(this.movePhase) * (this.moveRange||60);
      if (this.moveAxis === 'y') {
        const newY = this._baseY + delta;
        this._vy = newY - this.y;
        this.y = newY;
      } else {
        const newX = this._baseX + delta;
        this._vx = newX - this.x;
        this.x = newX;
      }
    }
    if (this.crumbling) {
      this.crumbleTimer++;
      if (this.crumbleTimer > 50) this.dead = true;
    }
  }

  draw(ctx, camX, camY) {
    const sx = this.x - camX;
    let sy = this.y - camY;
    if (this.isGrammar) sy += Math.sin(this.bobOffset)*3;

    if (this.crumbling) {
      ctx.save();
      ctx.globalAlpha = 1 - this.crumbleTimer/50;
      ctx.translate(sx + this.w/2, sy + this.h/2);
      ctx.rotate((this.crumbleTimer*0.05)*(this.data.shake?1:-1));
      ctx.translate(-(this.w/2), -(this.h/2));
      this._drawBody(ctx, 0, 0);
      ctx.restore();
      return;
    }
    this._drawBody(ctx, sx, sy);
  }

  _drawBody(ctx, sx, sy) {
    const { w, h, type, data, revealed } = this;

    const theme = currentTheme();
    if (theme && (type === 'solid' || type === 'start')) {
      if (this.moving) {
        theme.plank(ctx, this, sx, sy);
        ctx.save();
        ctx.fillStyle = 'rgba(255,220,50,0.95)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.moveAxis === 'x' ? '↔' : '↕', sx + w/2, sy - 5);
        ctx.restore();
      } else {
        theme.ground(ctx, this, sx, sy);
      }
      return;
    }
    if (type === 'solid' || type === 'start') {
      // Grass top
      const grad = ctx.createLinearGradient(sx,sy,sx,sy+h);
      grad.addColorStop(0, '#4CAF50');
      grad.addColorStop(0.3, '#388E3C');
      grad.addColorStop(1, '#5D4037');
      ctx.fillStyle = grad;
      ctx.beginPath();
      roundRect(ctx, sx, sy, w, h, 6);
      ctx.fill();
      // Grass top stripe
      ctx.fillStyle = '#66BB6A';
      ctx.beginPath();
      roundRect(ctx, sx+2, sy, w-4, 8, [6,6,0,0]);
      ctx.fill();
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      roundRect(ctx, sx+4, sy+h-6, w-8, 6, [0,0,6,6]);
      ctx.fill();
      // Moving platform indicator: yellow arrows on the side
      if (this.moving) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,220,50,0.85)';
        const arrowDir = this.moveAxis === 'x' ? '↔' : '↕';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(arrowDir, sx + w/2, sy - 4);
        // Glowing border
        ctx.strokeStyle = 'rgba(255,220,50,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        roundRect(ctx, sx+1, sy+1, w-2, h-2, 6);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    if (type === 'cloud') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      roundRect(ctx, sx, sy, w, h, h/2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      roundRect(ctx, sx-10, sy+4, w+20, h-4, h/3);
      ctx.fill();
      return;
    }

    if (type === 'goal') {
      drawFinishFlag(ctx, this, sx, sy, revealed);
      return;
    }

    if (type === 'grammar') {
      // Determine color based on state
      let baseColor='#1E3A5F', borderColor='#4A90D9', glowColor='rgba(74,144,217,.4)';
      if (revealed) {
        if (data.isCorrect) {
          baseColor='#0A3326'; borderColor='#06D6A0'; glowColor='rgba(6,214,160,.5)';
        } else {
          baseColor='#3D0A12'; borderColor='#EF476F'; glowColor='rgba(239,71,111,.5)';
        }
      } else if (this.wrongAnswered) {
        // Wrong platform after correct MCQ answer — red, no effect on land
        baseColor='#3D0A12'; borderColor='#EF476F'; glowColor='rgba(239,71,111,.4)';
      } else if (this.isHinted) {
        // Correct answer hint — strong green pulse
        borderColor='#06D6A0'; glowColor='rgba(6,214,160,.6)';
        baseColor='#0d3d2a';
      } else if (this.chosen) {
        // Player's chosen answer — yellow highlight
        borderColor='#FFD166'; glowColor='rgba(255,209,102,.6)';
        baseColor='#2d2200';
      }
      const pulse = Math.sin(this.glowPhase)*0.4+0.6;

      // Arrow indicator pointing down to the platform (for chosen/hinted)
      if (!revealed && (this.isHinted || this.chosen)) {
        const arrowColor = this.isHinted ? '#06D6A0' : '#FFD166';
        ctx.fillStyle = arrowColor;
        ctx.globalAlpha = 0.7 + Math.sin(this.glowPhase)*0.3;
        ctx.beginPath();
        const ax = sx+w/2, ay = sy-14;
        ctx.moveTo(ax, ay+10);
        ctx.lineTo(ax-8, ay);
        ctx.lineTo(ax+8, ay);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Glow shadow
      ctx.shadowBlur = (this.isHinted||this.chosen) ? 28*pulse : 18*pulse;
      ctx.shadowColor = revealed ? (data.isCorrect?'#06D6A0':'#EF476F')
        : this.isHinted ? '#06D6A0' : this.chosen ? '#FFD166' : '#4A90D9';

      // Body
      const grad = ctx.createLinearGradient(sx,sy,sx,sy+h);
      grad.addColorStop(0, revealed?(data.isCorrect?'#14533F':'#5A1020'):borderColor);
      grad.addColorStop(1, baseColor);
      ctx.fillStyle = grad;
      ctx.beginPath();
      roundRect(ctx, sx, sy, w, h, 10);
      ctx.fill();

      // Border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      roundRect(ctx, sx+1, sy+1, w-2, h-2, 9);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Answer text
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.min(16,w*0.13)}px 'Fredoka One',cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Symbol prefix so right/wrong never relies on colour alone
      const mark = revealed ? (data.isCorrect ? '✓ ' : '✗ ')
        : this.wrongAnswered ? '✗ ' : this.isHinted ? '✓ ' : '';
      ctx.fillText(mark + (data.label || ''), sx+w/2, sy+h/2);
      return;
    }
  }
}

// ══════════════════════════════════════════════
//  ENEMY CLASS
// ══════════════════════════════════════════════
class Enemy {
  // type: 'ground' (patrol), 'flyer' (sine wave up/down), 'chaser' (speeds up near player)
  constructor(x,y,patrolL,patrolR,label,isCorrect,type='ground',speed=1.8) {
    this.x=x; this.y=y;
    this.w=50; this.h=50;
    this.vx=speed; this.vy=0;
    this.speed=speed;
    this.patrolL=patrolL; this.patrolR=patrolR;
    this.label=label; this.isCorrect=isCorrect;
    this.type=type;
    this.questionIdx = -1; // set after construction to link to a question
    this.alive=true; this.dead=false;
    this.bobPhase=Math.random()*Math.PI*2;
    this.flyPhase=Math.random()*Math.PI*2;
    this.baseY=y;
    this.deathTimer=0; this.onGround=false;
    this.eyeDir=1;
  }
  update(playerX, playerY) {
    if (!this.alive) {
      this.deathTimer++;
      this.vy += 0.5;
      this.y += this.vy;
      this.x += this.vx*0.3;
      if (this.deathTimer > 45) this.dead=true;
      return;
    }
    this.bobPhase += 0.06;

    // Attack mode: rush straight to target, ignore patrol
    if (this.attacking) {
      this.x += this.vx;
      this.y += this.vy;
      return; // collision handled separately
    }

    if (this.type === 'flyer') {
      // Flyer: horizontal patrol + sine wave vertical, ignores gravity
      this.flyPhase += 0.04;
      this.x += this.vx;
      if (this.x <= this.patrolL) { this.x=this.patrolL; this.vx=Math.abs(this.vx); this.eyeDir=1; }
      if (this.x+this.w >= this.patrolR) { this.x=this.patrolR-this.w; this.vx=-Math.abs(this.vx); this.eyeDir=-1; }
      this.y = this.baseY + Math.sin(this.flyPhase)*35;
    } else if (this.type === 'chaser') {
      // Chaser: normal patrol but accelerates when player is close
      const dist = playerX !== undefined ? Math.abs(this.x - playerX) : 999;
      const boost = dist < 200 ? 1.8 : 1.0;
      const spd = this.speed * boost;
      this.vx = this.vx > 0 ? spd : -spd;
      this.x += this.vx;
      if (this.x <= this.patrolL) { this.x=this.patrolL; this.vx=Math.abs(spd); this.eyeDir=1; }
      if (this.x+this.w >= this.patrolR) { this.x=this.patrolR-this.w; this.vx=-Math.abs(spd); this.eyeDir=-1; }
      this.vy += GRAV;
      if (this.vy > MAX_FALL) this.vy=MAX_FALL;
      this.y += this.vy;
    } else {
      // Ground patrol (default)
      this.x += this.vx;
      if (this.x <= this.patrolL) { this.x=this.patrolL; this.vx=Math.abs(this.vx); this.eyeDir=1; }
      if (this.x+this.w >= this.patrolR) { this.x=this.patrolR-this.w; this.vx=-Math.abs(this.vx); this.eyeDir=-1; }
      this.vy += GRAV;
      if (this.vy > MAX_FALL) this.vy=MAX_FALL;
      this.y += this.vy;
    }
  }
  startAttack(targetX, targetY) {
    this.attacking = true;
    this.attackTargetX = targetX;
    this.attackTargetY = targetY;
    // Rush toward player at high speed
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const rushSpeed = 7;
    this.vx = (dx/dist) * rushSpeed;
    this.vy = (dy/dist) * rushSpeed;
  }
  landOn(py) { if (!this.attacking) { this.y = py - this.h; this.vy=0; this.onGround=true; } }
  die(vx=0) {
    this.alive=false;
    this.attacking=false;
    this.vy=-6;
    this.vx=vx*0.4 || 3*(Math.random()<0.5?1:-1);
  }

  draw(ctx, camX, camY) {
    if (this.dead) return;
    const sx = this.x - camX;
    const sy = this.y - camY + (this.alive ? Math.sin(this.bobPhase)*2 : 0);
    const { w, h } = this;

    ctx.save();
    if (!this.alive) {
      ctx.globalAlpha = Math.max(0, 1-this.deathTimer/45);
      ctx.translate(sx+w/2, sy+h/2);
      ctx.rotate(this.deathTimer*0.15);
      ctx.translate(-w/2,-h/2);
    } else {
      ctx.translate(sx,sy);
    }
    const ox = this.alive ? 0 : 0;
    const oy = 0;

    // Flyer wings
    if (this.type === 'flyer') {
      const wingFlap = Math.sin(this.bobPhase * 3) * 8;
      ctx.fillStyle = 'rgba(255,220,100,0.7)';
      ctx.beginPath();
      ctx.ellipse(ox - 14, oy + h/2 - wingFlap, 14, 9, -0.4, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(ox + w + 14, oy + h/2 - wingFlap, 14, 9, 0.4, 0, Math.PI*2);
      ctx.fill();
    }
    // Chaser exclamation glow when near (just a red outline pulse)
    if (this.type === 'chaser' && this.speed > 1.8) {
      ctx.save();
      ctx.shadowColor='#FF4D6D'; ctx.shadowBlur=12*(0.5+0.5*Math.sin(this.bobPhase*2));
      ctx.restore();
    }

    // Body
    const typeColor0 = this.type==='flyer' ? '#7C3AED' : this.type==='chaser' ? '#DC2626' : (this.isCorrect ? '#2563EB' : '#FF8C42');
    const typeColor1 = this.type==='flyer' ? '#4C1D95' : this.type==='chaser' ? '#991B1B' : (this.isCorrect ? '#1E40AF' : '#C0451A');
    const bodyGrad = ctx.createLinearGradient(ox,oy,ox,oy+h);
    bodyGrad.addColorStop(0, typeColor0);
    bodyGrad.addColorStop(1, typeColor1);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    roundRect(ctx, ox, oy, w, h, 10);
    ctx.fill();
    // Border
    ctx.strokeStyle = this.type==='flyer' ? '#C4B5FD' : this.type==='chaser' ? '#FCA5A5' : (this.isCorrect ? '#60A5FA' : '#FFD166');
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(ctx, ox+1, oy+1, w-2, h-2, 9);
    ctx.stroke();

    // Face
    const eyeX1 = ox + (this.eyeDir>0 ? 12 : w-22);
    const eyeX2 = ox + (this.eyeDir>0 ? 24 : w-10);
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(eyeX1, oy+16, 6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeX2, oy+16, 6, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#1a1a2e';
    ctx.beginPath(); ctx.arc(eyeX1+(this.eyeDir), oy+17, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeX2+(this.eyeDir), oy+17, 3, 0, Math.PI*2); ctx.fill();

    // Mouth
    ctx.strokeStyle='#fff'; ctx.lineWidth=2;
    ctx.beginPath();
    if (this.isCorrect) {
      ctx.arc(ox+w/2, oy+30, 8, 0, Math.PI);
    } else {
      ctx.arc(ox+w/2, oy+36, 8, Math.PI, 0);
    }
    ctx.stroke();

    // Label
    ctx.fillStyle='#fff';
    ctx.font=`bold ${Math.min(13,w*0.22)}px 'Fredoka One',cursive`;
    ctx.textAlign='center';
    ctx.textBaseline='bottom';
    ctx.fillText(this.label, ox+w/2, oy+h-4);

    ctx.restore();
  }
}

// ══════════════════════════════════════════════
//  BOSS CLASS
// ══════════════════════════════════════════════
class Boss {
  constructor(x, y, name) {
    this.x = x; this.y = y;
    this.w = BALL_R * 6;   // 3x ball diameter
    this.h = BALL_R * 6;
    this.name = name || 'Grammar King';
    this.hp = 5; this.maxHp = 5;
    this.alive = true; this.dead = false;
    this.bobPhase = 0;
    this.shakeTimer = 0;
    this.flashTimer = 0;
    this.painTimer = 0;   // pain face when hit
    this.chargeTimer = 0; // charge face before attacking
    this.deathTimer = 0;
    this.phase = 1;       // 1=normal, 2=50%HP, 3=25%HP
    this.phaseFlash = 0;  // dramatic flash on phase change
    this.vx = 1.2; // patrol left-right
    this.baseX = x;
    this.patrolRange = 90;
    this.movePhase = 0;
    this.attacking = false;
    this.attackVx = 0; this.attackVy = 0;
  }

  startAttack(targetX, targetY) {
    this.attacking = true;
    const dx = targetX - (this.x + this.w/2);
    const dy = targetY - (this.y + this.h/2);
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const spd = 9;
    this.attackVx = (dx/dist)*spd;
    this.attackVy = (dy/dist)*spd;
  }

  stopAttack() {
    this.attacking = false;
    this.attackVx = 0; this.attackVy = 0;
  }

  takeDamage() {
    const prevHp = this.hp;
    this.hp = Math.max(0, this.hp - 1);
    this.shakeTimer = 22;
    this.flashTimer = 18;
    this.painTimer = 45;
    // Phase transitions
    const pct = this.hp / this.maxHp;
    const prevPct = prevHp / this.maxHp;
    if (prevPct > 0.5 && pct <= 0.5) this.enterPhase(2);
    if (prevPct > 0.25 && pct <= 0.25) this.enterPhase(3);
    if (this.hp <= 0) this.die();
  }

  enterPhase(phase) {
    this.phase = phase;
    this.phaseFlash = 80; // frames of phase flash
    triggerScreenShake(phase === 3 ? 16 : 10, phase === 3 ? 600 : 350);
    if (game) {
      spawnScreenConfetti(phase === 3 ? 100 : 60);
      const msg = phase === 3 ? '😡 FINAL PHASE! 3×!' : '😠 Phase 2! 2×!';
      spawnTextParticle(this.x + this.w/2, this.y - 40, msg, phase === 3 ? '#FF4444' : '#FF8800');
    }
    // Speed up patrol and attack
    this.patrolRange = phase === 3 ? 160 : 120;
    if (phase === 3) { this.vx = 3; }
  }

  startCharge() {
    this.chargeTimer = 30; // show charge face before attacking
  }

  die() {
    this.alive = false;
    this.deathTimer = 0;
  }

  update() {
    if (!this.alive) {
      this.deathTimer++;
      if (this.deathTimer > 80) this.dead = true;
      return;
    }
    this.bobPhase += 0.04;
    if (this.shakeTimer > 0) this.shakeTimer--;
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.painTimer > 0) this.painTimer--;
    if (this.chargeTimer > 0) this.chargeTimer--;
    if (this.phaseFlash > 0) this.phaseFlash--;

    if (this.attacking) {
      this.x += this.attackVx;
      this.y += this.attackVy;
      // Auto-stop if boss drifts too far from base (missed)
      if (Math.abs(this.x - this.baseX) > 500) this.stopAttack();
    } else {
      // Slow patrol oscillation, drifting back to its home height after an attack
      if (this.homeY === undefined) this.homeY = this.y;
      this.movePhase += 0.025;
      this.x = this.baseX + Math.sin(this.movePhase) * this.patrolRange;
      this.y += (this.homeY + Math.sin(this.bobPhase) * 8 - this.y) * 0.08;
    }
  }

  draw(ctx, camX, camY) {
    if (this.dead) return;
    const sx = this.x - camX + (this.shakeTimer > 0 ? (Math.random()-0.5)*8 : 0);
    const sy = this.y - camY;
    const { w, h } = this;
    const alpha = this.alive ? 1 : Math.max(0, 1 - this.deathTimer/80);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Glow aura
    const glowSize = 18 + Math.sin(this.bobPhase*2)*6;
    const grd = ctx.createRadialGradient(sx+w/2, sy+h/2, w/3, sx+w/2, sy+h/2, w/2+glowSize);
    grd.addColorStop(0, 'rgba(220,38,38,0.35)');
    grd.addColorStop(1, 'rgba(220,38,38,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(sx+w/2, sy+h/2, w/2+glowSize, 0, Math.PI*2); ctx.fill();

    // Body — color by phase
    const flash = (this.flashTimer > 0 && this.flashTimer % 3 < 2) || (this.phaseFlash > 0 && this.phaseFlash % 4 < 2);
    const phaseTopColor    = this.phase === 3 ? '#7B0000' : this.phase === 2 ? '#B91C1C' : '#DC2626';
    const phaseBottomColor = this.phase === 3 ? '#1a0000' : this.phase === 2 ? '#4A0808' : '#7F1D1D';
    const phaseBorderColor = this.phase === 3 ? '#FF2020' : this.phase === 2 ? '#F87171' : '#F87171';
    const bodyGrd = ctx.createLinearGradient(sx, sy, sx, sy+h);
    bodyGrd.addColorStop(0, flash ? '#fff' : phaseTopColor);
    bodyGrd.addColorStop(1, flash ? '#fca5a5' : phaseBottomColor);
    ctx.fillStyle = bodyGrd;
    ctx.beginPath(); roundRect(ctx, sx, sy, w, h, 18); ctx.fill();

    // Phase 3: add fiery outer glow ring
    if (this.phase === 3) {
      ctx.strokeStyle = `rgba(255,${Math.round(50+Math.sin(this.bobPhase*3)*50)},0,0.8)`;
      ctx.lineWidth = 5 + Math.sin(this.bobPhase*2)*2;
      ctx.beginPath(); roundRect(ctx, sx-3, sy-3, w+6, h+6, 21); ctx.stroke();
    }

    // Border
    ctx.strokeStyle = flash ? '#fff' : phaseBorderColor;
    ctx.lineWidth = 3;
    ctx.beginPath(); roundRect(ctx, sx+2, sy+2, w-4, h-4, 16); ctx.stroke();

    // Eyes & mouth — swap expression based on state
    const eyeY = sy + h*0.3;
    const isPain   = this.painTimer > 0;
    const isCharge = !isPain && this.chargeTimer > 0;

    if (isPain) {
      // Pain face: X eyes + open-mouth "O"
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      // X left eye
      ctx.beginPath(); ctx.moveTo(sx+w*0.22,eyeY-10); ctx.lineTo(sx+w*0.38,eyeY+6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx+w*0.38,eyeY-10); ctx.lineTo(sx+w*0.22,eyeY+6); ctx.stroke();
      // X right eye
      ctx.beginPath(); ctx.moveTo(sx+w*0.62,eyeY-10); ctx.lineTo(sx+w*0.78,eyeY+6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx+w*0.78,eyeY-10); ctx.lineTo(sx+w*0.62,eyeY+6); ctx.stroke();
      // Brows raised (shocked)
      ctx.strokeStyle='#fff'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(sx+w*0.18,eyeY-18); ctx.lineTo(sx+w*0.42,eyeY-22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx+w*0.82,eyeY-18); ctx.lineTo(sx+w*0.58,eyeY-22); ctx.stroke();
      // Mouth open "O"
      ctx.fillStyle = '#7F1D1D';
      ctx.beginPath(); ctx.ellipse(sx+w/2, sy+h*0.72, 16, 12, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(sx+w/2, sy+h*0.72, 10, 7, 0, 0, Math.PI*2); ctx.fill();
    } else if (isCharge) {
      // Charge face: squinting eyes + gritted teeth (wide angry)
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(sx+w*0.3, eyeY, 14, 8, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx+w*0.7, eyeY, 14, 8, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath(); ctx.arc(sx+w*0.3+2, eyeY, 7, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx+w*0.7+2, eyeY, 7, 0, Math.PI*2); ctx.fill();
      // Heavy brows (very angry)
      ctx.strokeStyle = '#7F1D1D'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx+w*0.15,eyeY-10); ctx.lineTo(sx+w*0.45,eyeY-2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx+w*0.85,eyeY-10); ctx.lineTo(sx+w*0.55,eyeY-2); ctx.stroke();
      // Gritted teeth
      ctx.fillStyle = '#fff';
      ctx.beginPath(); roundRect(ctx, sx+w*0.25, sy+h*0.65, w*0.5, 14, 4); ctx.fill();
      ctx.strokeStyle = '#DC2626'; ctx.lineWidth = 2;
      for (let t=1;t<4;t++) { ctx.beginPath(); ctx.moveTo(sx+w*0.25+t*(w*0.5/4), sy+h*0.65); ctx.lineTo(sx+w*0.25+t*(w*0.5/4), sy+h*0.65+14); ctx.stroke(); }
    } else {
      // Normal angry face
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(sx+w*0.3, eyeY, 14, 16, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx+w*0.7, eyeY, 14, 16, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath(); ctx.arc(sx+w*0.3+2, eyeY+2, 8, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(sx+w*0.7+2, eyeY+2, 8, 0, Math.PI*2); ctx.fill();
      // Angry brows
      ctx.strokeStyle = '#7F1D1D'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx+w*0.18,eyeY-14); ctx.lineTo(sx+w*0.42,eyeY-8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx+w*0.82,eyeY-14); ctx.lineTo(sx+w*0.58,eyeY-8); ctx.stroke();
      // Angry frown
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx+w/2, sy+h*0.72, 18, Math.PI*0.15, Math.PI*0.85); ctx.stroke();
    }

    // Crown 👑 atas kepala boss
    const crownBob = Math.sin(this.bobPhase * 1.5) * 3;
    ctx.font = `${Math.round(w * 0.45)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('👑', sx + w/2, sy - 90 + crownBob);

    // Name tag (below crown, above HP bar)
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath(); roundRect(ctx, sx+w/2-64, sy-80, 128, 26, 10); ctx.fill();
    ctx.fillStyle = '#FFD166';
    ctx.font = "bold 14px 'Fredoka One',cursive";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.name, sx+w/2, sy-67);

    // HP bar (below name tag, just above boss body)
    const barW = w;
    const barH = 10;
    const barX = sx;
    const barY = sy - 52;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); roundRect(ctx, barX, barY, barW, barH, 5); ctx.fill();
    const hpFrac = this.hp / this.maxHp;
    const hpColor = hpFrac > 0.6 ? '#22C55E' : hpFrac > 0.3 ? '#EAB308' : '#EF4444';
    ctx.fillStyle = hpColor;
    ctx.beginPath(); roundRect(ctx, barX, barY, barW*hpFrac, barH, 5); ctx.fill();
    // HP pips
    for (let i=1; i<this.maxHp; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(barX + (barW/this.maxHp)*i - 1, barY, 2, barH);
    }

    ctx.restore();
  }
}

// ══════════════════════════════════════════════
//  POWER-UP CLASS
// ══════════════════════════════════════════════
const PU_TYPES = {
  shield: { icon:'🛡️', label:'Shield',        color:'#8B5CF6', glow:'rgba(139,92,246,.7)'  },
  time:   { icon:'⏱️', label:'+5 Seconds',    color:'#3B82F6', glow:'rgba(59,130,246,.7)'  },
  hint:   { icon:'💡', label:'Hint',           color:'#EAB308', glow:'rgba(234,179,8,.7)'   },
  double: { icon:'2×', label:'Double Points!', color:'#06D6A0', glow:'rgba(6,214,160,.7)'   },
};

class PowerUp {
  constructor(x, y, type) {
    this.x=x; this.y=y; this.type=type;
    this.collected=false; this.dead=false;
    this.bobPhase=Math.random()*Math.PI*2;
    this.glowPhase=Math.random()*Math.PI*2;
    this.r=18;
  }
  update() {
    this.bobPhase  += 0.055;
    this.glowPhase += 0.08;
  }
  draw(ctx, camX, camY) {
    if (this.collected || this.dead) return;
    const sx = this.x - camX;
    const sy = this.y - camY + Math.sin(this.bobPhase)*5;
    const info = PU_TYPES[this.type];
    const pulse = 0.5 + Math.sin(this.glowPhase)*0.5;

    ctx.save();
    ctx.shadowBlur  = 18*pulse;
    ctx.shadowColor = info.glow;

    // Circle bg
    const grad = ctx.createRadialGradient(sx,sy,2,sx,sy,this.r);
    grad.addColorStop(0, info.color+'99');
    grad.addColorStop(1, info.color+'22');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, this.r, 0, Math.PI*2);
    ctx.fill();

    // Border
    ctx.strokeStyle = info.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, this.r, 0, Math.PI*2);
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Icon
    ctx.font = '18px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.icon, sx, sy);
    ctx.restore();
  }
}

// ══════════════════════════════════════════════
//  LEVEL GENERATOR
// ══════════════════════════════════════════════
// Spaced repetition: track wrong counts per question
const SR_KEY = 'gr_sr_wrong';
function srGetData()   { try { return JSON.parse(localStorage.getItem(pk(SR_KEY))||'{}'); } catch(e) { return {}; } }
function srRecordWrong(levelKey, qText) { // bug2 fix: key by question text not index
  const d = srGetData();
  const k = `${levelKey}:${qText}`;
  d[k] = (d[k] || 0) + 1;
  try { localStorage.setItem(pk(SR_KEY), JSON.stringify(d)); } catch(e) {}
}
// Each play draws a fresh set from the level's question bank:
// teacher questions first, then up to 2 the pupil has missed most, then random ones (max 1 sentence-order).
const QUESTIONS_PER_PLAY = 6;
const MAX_TEACHER_QUESTIONS = 10;
const MAX_REVISIT = 2;
function pickQuestions(key, pool, teacherQs) {
  if (key === 'practice') return [...pool];
  const d = srGetData();
  const missed = q => d[`${key}:${questionText(q)}`] || 0;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const count = Math.max(QUESTIONS_PER_PLAY, Math.min(teacherQs.length, MAX_TEACHER_QUESTIONS));
  const picked = teacherQs.slice(0, count);
  // At most one of each pop-up type, and at most two pop-up questions per play
  const typesUsed = new Set(picked.filter(isSpecial).map(q => q.type));
  const add = q => {
    if (picked.length >= count || picked.includes(q)) return;
    if (isSpecial(q)) {
      if (typesUsed.has(q.type) || typesUsed.size >= 2) return;
      typesUsed.add(q.type);
    }
    picked.push(q);
  };
  shuffle(pool.filter(q => missed(q) > 0)).sort((a, b) => missed(b) - missed(a)).slice(0, MAX_REVISIT).forEach(add);
  shuffle([...pool]).forEach(add);
  return picked;
}

function buildLevel(key) {
  const data = GRAMMAR_DB[key] || GRAMMAR_DB["1-1"];
  const questions = pickQuestions(key, data.questions, getGuruQuestions(key));
  const difficulty = data.difficulty || 'easy'; // 'easy' | 'medium' | 'boss'
  const cfg = difficultyConfig();
  const enemiesOn = cfg.enemies === null ? difficulty !== 'easy' : cfg.enemies;
  const letters = [];
  const word = (data.word || '').toUpperCase();
  const platforms = [];
  const enemies   = [];
  const coins     = [];
  const powerups  = [];
  const lifeups   = []; // extra life pickups (♥)
  const jumpMode  = answerModeNow() === 'jump';
  // No question timer in jump mode, so the +5 seconds power-up has no use there
  const puTypes   = jumpMode ? ['shield','hint','double'] : ['shield','time','hint','double'];
  let boss = null; // set for boss levels

  const GH = 420; // ground height in world
  const PLAT_W = 130;
  const PLAT_H = 22;
  const GRAMMAR_W = 120;
  const GRAMMAR_H = 45;
  const GRAMMAR_GAP = 22;

  // Start ground
  platforms.push(new Platform(-200, GH, 600, 40, 'start'));

  let curX = 380;

  questions.forEach((q, qi) => {
    // Gap + stepping stones — alternate moving axes per question
    const p1 = new Platform(curX, GH - 80, PLAT_W, PLAT_H, 'solid');
    p1.moving=true; p1.moveAxis='x'; p1.moveRange=55; p1.moveSpeed=0.028+(qi%3)*0.006;
    p1._baseX=curX; p1._baseY=GH-80; p1.movePhase=qi*1.1;
    platforms.push(p1);

    const p2 = new Platform(curX+160, GH - 140, PLAT_W, PLAT_H, 'solid');
    p2.moving=true; p2.moveAxis= qi%2===0 ? 'y' : 'x';
    p2.moveRange=40; p2.moveSpeed=0.035+(qi%2)*0.008;
    p2._baseX=curX+160; p2._baseY=GH-140; p2.movePhase=qi*0.7+1;
    platforms.push(p2);

    // Letters to collect: spread the level's word across the questions
    for (let li = 0; li < word.length; li++) {
      if (Math.floor(li * questions.length / word.length) !== qi) continue;
      const slot = letters.filter(l => l.qi === qi).length;
      letters.push({ ch: word[li], idx: li, qi, x: curX + 80 + slot * 60, y: GH - 230, collected: false, frame: li });
    }

    if (enemiesOn) {
      const eTypes = ['ground','flyer','chaser'];
      const eType = eTypes[qi % 3];
      const eSpeed = Math.min(1.5 + qi * 0.1, 3.0);
      const stonePatrolL = curX - 120;
      const stonePatrolR = curX + 200;
      const eY = eType === 'flyer' ? GH - 150 : GH - 105;
      const guard = new Enemy(curX - 40, eY, stonePatrolL, stonePatrolR, '!', false, eType, eSpeed);
      guard.questionIdx = qi;
      enemies.push(guard);
      // Musuh kedua dari soalan ke-2 ke atas
      if (qi >= 2) {
        const e2Type = eTypes[(qi+1) % 3];
        const e2Speed = Math.min(1.3 + qi * 0.09, 2.6);
        const e2Y = e2Type === 'flyer' ? GH - 160 : GH - 105;
        const guard2 = new Enemy(curX + 80, e2Y, stonePatrolL, stonePatrolR + 80, '!', false, e2Type, e2Speed);
        guard2.questionIdx = qi;
        enemies.push(guard2);
      }
    }

    curX += 340;

    // Grammar cluster: shuffle 3 platforms
    // For ordering questions, show placeholder labels
    const special = isSpecial(q) ? SPECIAL_TYPES[q.type] : null;
    const cluster = special ? [
      {label: `${special.icon} ${special.label}`, isCorrect: true},
      {label: `${special.icon} ${special.label}`, isCorrect: false},
      {label: `${special.icon} ${special.label}`, isCorrect: false},
    ] : [
      {label: q.correct, isCorrect: true},
      {label: q.wrong[0], isCorrect: false},
      {label: q.wrong[1], isCorrect: false},
    ];
    for (let i=cluster.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [cluster[i],cluster[j]]=[cluster[j],cluster[i]];
    }
    // Jump mode: answers float at one reachable height over a flat walkway, spaced apart,
    // so a pupil walks under their choice and jumps straight up through it.
    const gap = jumpMode ? JUMP_ANSWER_GAP : GRAMMAR_GAP;
    const clusterY = jumpMode ? GH - JUMP_ANSWER_RISE : GH - 160 - (qi%3)*30;
    const totalW = GRAMMAR_W*3 + gap*2;
    const clusterX = jumpMode ? curX + 70 : curX;
    if (jumpMode) platforms.push(new Platform(curX, GH, totalW + 140, 40, 'solid'));
    cluster.forEach((c,i) => {
      const gp = new Platform(
        clusterX + i*(GRAMMAR_W+gap), clusterY,
        GRAMMAR_W, GRAMMAR_H, 'grammar',
        { label:c.label, isCorrect:c.isCorrect, questionIdx:qi, shake: !c.isCorrect }
      );
      gp.clusterX = clusterX; // proximity reference
      platforms.push(gp);
    });

    if (jumpMode) {
      // Coins on the walkway between the answers
      for (let ci=0;ci<2;ci++) {
        coins.push({x: clusterX + GRAMMAR_W + gap/2 + ci*(GRAMMAR_W+gap), y: GH-40, collected:false, frame:Math.random()*Math.PI*2});
      }
    } else {
      // Coins above the grammar platforms
      for (let ci=0;ci<3;ci++) {
        coins.push({x: curX+60+ci*170, y: clusterY-30, collected:false, frame:Math.random()*Math.PI*2});
      }
    }

    curX += totalW + (jumpMode ? 140 : 80);
    // Platform after cluster
    platforms.push(new Platform(curX, GH - 30, 200, 40, 'solid'));

    // Spawn one power-up above this platform (cycle through types)
    powerups.push(new PowerUp(curX + 100, GH - 80, puTypes[qi % puTypes.length]));

    // Nyawa tambahan setiap 2 soalan, letakkan di atas platform ini
    if (qi % 2 === 1) {
      lifeups.push({ x: curX + 50, y: GH - 85, collected: false, frame: qi * 0.8 });
    }

    curX += 250;
  });

  // Final ground + goal
  if (difficulty === 'boss') {
    // Boss arena: wide flat ground, no goal platform — boss takes its place
    platforms.push(new Platform(curX, GH, 600, 40, 'solid'));
    // Boss spawns above arena ground
    const bossX = curX + 220;
    const bossW = BALL_R * 6;
    // In jump mode the boss hovers high so answer bubbles fit between it and the ground
    boss = new Boss(bossX, GH - bossW - (jumpMode ? 170 : 10), data.bossName || 'Grammar King');
    boss.baseX = bossX;
    boss.arena = { x0: curX, x1: curX + 600, groundY: GH };
  } else {
    // Normal ending
    platforms.push(new Platform(curX, GH, 400, 40, 'solid'));
    platforms.push(new Platform(curX+160, GH, 60, 60+GH%60, 'goal'));
  }
  const worldW = curX + 600;

  return { platforms, enemies, coins, powerups, lifeups, letters, word, questions, worldW, groundY: GH, key, boss, difficulty, jumpMode };
}

// ══════════════════════════════════════════════
//  MAIN GAME OBJECT
// ══════════════════════════════════════════════
function createGame(key) {
  const level = buildLevel(key);
  const base  = GRAMMAR_DB[key] || GRAMMAR_DB["1-1"];
  // Full question bank incl. teacher questions, used to look questions up by text
  const guruQs = getGuruQuestions(key);
  const data = guruQs.length > 0
    ? { ...base, questions: [...guruQs, ...base.questions] }
    : base;

  return {
    state: 'playing', // playing | paused | dead | win
    level,
    data,
    currentQ: 0,
    score: 0,
    hearts: difficultyConfig().hearts,
    maxHearts: difficultyConfig().hearts,
    invincible: 0,
    particles: [],
    textParticles: [],
    answeredQuestions: new Set(),
    mcqAnsweredSet: new Set(), // questions whose MCQ has been shown+answered (no re-trigger)
    mcqCorrectSet: new Set(),  // questions answered CORRECTLY via MCQ
    combo: 0,
    // Power-up inventory
    inv: { shield:false, time:false, hint:false, double:false },
    wrongAnswers: [],
    checkpoint: null,
    checkpointPlaced: false,

    // Player
    px: 80, py: 340,
    pvx: 0, pvy: 0,
    pRot: 0,
    pOnGround: false,
    pCoyote: 0,
    pJumpBuffer: 0,

    // Camera
    camX: 0, camY: 0,
    targetCamX: 0,

    // Boss fight state
    bossPhase: 'approach', // 'approach' | 'fight' | 'dead'
    bossMCQActive: false,
    bossCurrentQ: 0, // which boss question (0-4)

    startTime: Date.now(),
  };
}

// ══════════════════════════════════════════════
//  COLLISION HELPERS
// ══════════════════════════════════════════════
function circleRect(cx,cy,r, rx,ry,rw,rh) {
  const nearX = Math.max(rx, Math.min(cx, rx+rw));
  const nearY = Math.max(ry, Math.min(cy, ry+rh));
  const dx = cx-nearX, dy = cy-nearY;
  return dx*dx+dy*dy < r*r;
}

function resolvePlayerPlatform(g, plat) {
  const { px, py, pvx, pvy } = g;
  const { x, y, w, h } = plat;
  if (!circleRect(px, py, BALL_R, x, y, w, h)) return false;
  // Answer platforms are one-way: pass through from below/sides, land only when falling onto the top
  if (plat.type === 'grammar') {
    const prevBottom = py - pvy + BALL_R;
    if (pvy < 0 || prevBottom > y + 6 || px < x - BALL_R * 0.4 || px > x + w + BALL_R * 0.4) return false;
  }

  // Find overlap direction
  const overlapL = (px+BALL_R) - x;
  const overlapR = (x+w) - (px-BALL_R);
  const overlapT = (py+BALL_R) - y;
  const overlapB = (y+h) - (py-BALL_R);

  const minH = Math.min(overlapL, overlapR);
  const minV = Math.min(overlapT, overlapB);

  if (minV < minH) {
    // Vertical collision
    if (overlapT < overlapB) {
      // Landing on top
      g.py = y - BALL_R;
      if (g.pvy > 0) {
        g.pvy = -g.pvy * BOUNCE;
        if (Math.abs(g.pvy)<1) g.pvy=0;
      }
      g.pOnGround = true;
      // Carry ball with moving platform
      if (plat.moving) { g.px += plat._vx; g.py += plat._vy; }
      if (!plat._landed) { plat._landed=true; Audio.land(); }
      return 'top';
    } else {
      g.py = y+h+BALL_R;
      if (g.pvy < 0) g.pvy *= -0.3;
    }
  } else {
    // Horizontal
    if (overlapL < overlapR) {
      g.px = x - BALL_R;
    } else {
      g.px = x+w+BALL_R;
    }
    g.pvx *= -0.3;
  }
  return 'side';
}

// ══════════════════════════════════════════════
//  UPDATE LOOP
// ══════════════════════════════════════════════
function updateGame(g) {
  // Handle ball fly-to-platform animation state
  if (g.state === 'animating') {
    if (g.animTarget) {
      const dx = g.animTarget.x - g.px;
      const dy = g.animTarget.y - g.py;
      g.px += dx * 0.18;
      g.py += dy * 0.18;
      g.pRot += 0.12;
      // Update particles for trail effect
      if (Math.random() < 0.5)
        spawnParticles(g.px, g.py, g.animTarget.color || '#4A90D9', 2, 2);
      for (const p of g.particles) p.update();
      g.particles = g.particles.filter(p=>p.life>0);
      for (const tp of g.textParticles) { tp.y+=tp.vy; tp.vy*=0.95; tp.life--; }
      g.textParticles = g.textParticles.filter(t=>t.life>0);
      g.camX += (Math.max(0, Math.min(g.level.worldW-CW, g.px-CW*0.35)) - g.camX)*0.09;
      if (Math.abs(dx)<3 && Math.abs(dy)<3) {
        g.px = g.animTarget.x;
        g.py = g.animTarget.y;
        g.pvx = 0; g.pvy = 0;
        g.animTarget.onArrive();
        g.animTarget = null;
      }
    }
    return;
  }
  if (g.state !== 'playing') return;
  const { level } = g;

  // Input (tap counters keep very short key presses from being lost)
  const moveL = keys.left  || ctrlState.left  || tapFrames.left  > 0;
  const moveR = keys.right || ctrlState.right || tapFrames.right > 0;
  const jump  = (keys.up   || ctrlState.jump  || tapFrames.up    > 0) ? 1 : 0;

  // Horizontal movement
  if (moveL) g.pvx -= 1.2;
  if (moveR) g.pvx += 1.2;
  g.pvx = Math.max(-SPEED, Math.min(SPEED, g.pvx));
  if (!moveL && !moveR) g.pvx *= FRICTION;

  // Gravity
  g.pvy += GRAV;
  if (g.pvy > MAX_FALL) g.pvy = MAX_FALL;

  // Coyote time
  if (g.pOnGround) g.pCoyote=8; else if(g.pCoyote>0) g.pCoyote--;

  // Jump buffer
  if (jump) g.pJumpBuffer=10; else if(g.pJumpBuffer>0) g.pJumpBuffer--;

  if (level.jumpMode) updateJumpAnswering(g);

  // Execute jump
  if (g.pJumpBuffer>0 && g.pCoyote>0) {
    // Check if there is a grammar cluster nearby (within 500px horizontally)
    // Find the grammar cluster for current question
    const clusterPlats = g.level.platforms.filter(p =>
      p.type==='grammar' &&
      !p.revealed && !p.crumbling && !p.dead &&
      p.data.questionIdx === g.currentQ
    );
    // Trigger when ball enters the cluster zone:
    // from 150px before the leftmost platform up to the rightmost platform edge
    const nearCluster = clusterPlats.length > 0 && (() => {
      const minX = Math.min(...clusterPlats.map(p => p.x)) - 150;
      const maxX = Math.max(...clusterPlats.map(p => p.x + p.w));
      return g.px >= minX && g.px <= maxX;
    })() ? clusterPlats[0] : null;
    const needsPopup = !g.level.jumpMode || isSpecial(g.level.questions[g.currentQ]);
    if (needsPopup && nearCluster && !g.mcqAnsweredSet.has(g.currentQ) && g.bossPhase !== 'fight') {
      // Show MCQ instead of normal jump
      g.pJumpBuffer=0; g.pCoyote=0;
      showMCQ(g);
      return;
    }
    // Normal jump
    g.pvy = JUMP_VEL;
    g.pCoyote=0; g.pJumpBuffer=0;
    Audio.jump();
    spawnParticles(g.px,g.py+BALL_R,'#a0d8ef',6,3);
  }

  // Move
  g.px += g.pvx;
  g.py += g.pvy;
  g.pRot += g.pvx * 0.06;
  g.pOnGround = false;

  // Platform collisions
  const fallSpeed = g.pvy;
  for (const p of level.platforms) {
    if (!p.isSolid || p.dead) continue;
    const result = resolvePlayerPlatform(g, p);

    if (result === 'top' && p.isGrammar && !p.revealed) {
      p.revealed = true;
      handleGrammarLand(g, p);
    }
  }
  // Squash on a hard landing (purely visual)
  if (g.pOnGround && !g.wasOnGround && fallSpeed > 4) {
    g.squash = Math.min(0.32, fallSpeed / 32);
    spawnParticles(g.px, g.py + BALL_R, 'rgba(210,180,140,0.9)', 6, 2.5);
  }
  g.wasOnGround = g.pOnGround;
  g.squash = (g.squash || 0) * 0.82;
  g.trail = g.trail || [];
  g.trail.push({ x: g.px, y: g.py });
  if (g.trail.length > 7) g.trail.shift();

  // World bounds
  if (g.px - BALL_R < -200) { g.px=-200+BALL_R; g.pvx=0; }
  if (g.px + BALL_R > level.worldW) { g.px=level.worldW-BALL_R; g.pvx=0; }

  // Fall off world
  if (g.py > level.groundY + 250 && g.invincible <= 0) {
    playerTakeDamage(g, true);
    return;
  }

  // Enemy collisions
  if (g.invincible <= 0) {
    for (const e of level.enemies) {
      if (!e.alive || e.dead) continue;
      if (!circleRect(g.px, g.py, BALL_R-2, e.x, e.y, e.w, e.h)) continue;

      if (e.attacking) {
        // Attack hit: -0.5 nyawa, musuh hilang dari paparan
        e.alive = false; e.dead = true;
        spawnParticles(e.x+e.w/2, e.y+e.h/2, '#FF4D6D', 16, 7);
        spawnTextParticle(g.px, g.py-30, '-½ ❤', '#FF4D6D');
        playerTakeDamage(g, false, 0.5);
        Audio.enemy();
        continue;
      }

      // Stomp check: player falling + hitting top of enemy
      const stompThresh = e.y + 10;
      if (g.pvy > 0 && g.py < stompThresh) {
        // Stomp → bunuh musuh
        e.die(); Audio.enemy();
        spawnParticles(e.x+e.w/2, e.y+e.h/2, '#FF8C42', 14, 6);
        spawnTextParticle(e.x+e.w/2, e.y-20, '+50 ✓', '#06D6A0');
        g.score += 50;
        g.pvy = JUMP_VEL * 0.6;
      } else {
        // Side hit → damage bola
        playerTakeDamage(g);
      }
    }
  }

  // Power-up collection
  for (const pu of level.powerups) {
    if (pu.collected) continue;
    const dx=g.px-pu.x, dy=g.py-pu.y;
    if (dx*dx+dy*dy < (BALL_R+pu.r)*(BALL_R+pu.r)) {
      pu.collected=true;
      collectPowerUp(g, pu.type);
    }
    pu.update();
  }

  // Coin collection
  for (const c of level.coins) {
    if (c.collected) continue;
    const dx=g.px-c.x, dy=g.py-c.y;
    if (dx*dx+dy*dy < (BALL_R+12)*(BALL_R+12)) {
      c.collected=true;
      Audio.collect();
      spawnParticles(c.x,c.y,'#FFD166',8,4);
      spawnTextParticle(c.x,c.y-20,'+10','#FFD166');
      g.score+=10;
    }
    c.frame+=0.08;
  }

  // Life-up collection (♥ tambahan, max 3)
  if (level.lifeups) {
    for (const lu of level.lifeups) {
      if (lu.collected) continue;
      lu.frame += 0.07;
      const dx=g.px-lu.x, dy=g.py-lu.y;
      if (dx*dx+dy*dy < (BALL_R+14)*(BALL_R+14)) {
        lu.collected=true;
        if (g.hearts < g.maxHearts) {
          g.hearts = Math.min(g.maxHearts, g.hearts + 1);
          spawnParticles(lu.x,lu.y,'#FF4D6D',14,5);
          spawnTextParticle(lu.x,lu.y-25,'+1 ❤','#FF4D6D');
          Audio.correct(1);
          updateHUD(g);
        } else {
          // Full hearts — convert to points
          spawnParticles(lu.x,lu.y,'#FFD166',10,4);
          spawnTextParticle(lu.x,lu.y-25,'+50','#FFD166');
          g.score += 50;
        }
      }
    }
  }

  // Letter collection
  for (const lt of level.letters) {
    if (lt.collected) continue;
    lt.frame += 0.06;
    const dx = g.px - lt.x, dy = g.py - lt.y;
    if (dx*dx + dy*dy < (BALL_R+16)*(BALL_R+16)) {
      lt.collected = true;
      Audio.collect();
      spawnParticles(lt.x, lt.y, '#8B5CF6', 10, 4);
      spawnTextParticle(lt.x, lt.y-24, lt.ch, '#C4B5FD');
      g.score += 20;
      updateWordHUD(g);
      if (level.letters.every(l => l.collected)) {
        g.score += 300;
        g.wordComplete = true;
        Audio.star();
        spawnTextParticle(g.px, g.py-70, `🔤 ${level.word}! +300`, '#C4B5FD');
        showToast(`🔤 You spelled "${level.word}"! +300`);
        updateAchStats({ wordsSpelled: 1 });
      }
    }
  }

  // Goal collision — generous trigger zone (includes flag pole area above platform)
  // Skip goal for boss levels (win triggered by killing boss instead)
  const goalPlat = level.difficulty !== 'boss' ? level.platforms.find(p=>p.type==='goal') : null;
  if (goalPlat && g.state==='playing') {
    const gCentreX = goalPlat.x + goalPlat.w/2;
    const inX = Math.abs(g.px - gCentreX) < goalPlat.w + 20;
    const inY = g.py + BALL_R >= goalPlat.y - 55; // include flag area
    if (inX && inY) {
      goalPlat.revealed = true;
      triggerWin(g);
      return;
    }
  }

  // Checkpoint (midpoint)
  if (!g.checkpointPlaced && g.px > level.worldW*0.45) {
    g.checkpoint = {px:g.px, py:g.py, hearts:g.hearts, score:g.score};
    g.checkpointPlaced=true;
    Audio.checkpoint();
    const el=document.getElementById('checkpoint-flash');
    el.style.opacity='1'; setTimeout(()=>el.style.opacity='0',500);
    spawnTextParticle(g.px,g.py-50,'Checkpoint! 🏁','#06D6A0');
  }

  // Invincibility frames
  if (g.invincible>0) g.invincible--;

  // Platform + enemy update
  for (const p of level.platforms) p.update();
  level.platforms = level.platforms.filter(p=>!p.dead);
  for (const e of level.enemies) e.update(g.px, g.py);
  // Enemy-platform ground collision (only for ground/chaser types)
  for (const e of level.enemies) {
    if (!e.alive || e.type === 'flyer') continue;
    for (const p of level.platforms) {
      if (p.dead || p.type==='goal') continue;
      const overlapX = e.x+e.w > p.x && e.x < p.x+p.w;
      const prevBottom = e.y + e.h - e.vy;
      const curBottom = e.y + e.h;
      if (overlapX && prevBottom <= p.y && curBottom >= p.y) {
        e.landOn(p.y);
      }
    }
    // Ground floor
    if (e.y + e.h >= level.groundY) e.landOn(level.groundY);
  }
  level.enemies = level.enemies.filter(e=>!e.dead);

  // Boss update & fight logic
  if (level.boss && !level.boss.dead) {
    level.boss.update();

    // Trigger boss fight when player reaches boss arena
    if (g.bossPhase === 'approach' && level.boss.alive && g.px >= level.boss.x - 250) {
      g.bossPhase = 'fight';
    }

    // Jump mode: bounce on answer bubbles; pop-up mode: boss question pop-up
    if (level.jumpMode) {
      if (g.bossPhase === 'fight') updateBossBattle(g);
    } else if (g.bossPhase === 'fight' && level.boss.alive && !g.bossMCQActive && g.state !== 'answering') {
      g.bossMCQActive = true;
      const bossPhaseNum = level.boss.phase || 1;
      const mcqDelay = bossPhaseNum === 3 ? 350 : bossPhaseNum === 2 ? 550 : 800;
      setTimeout(() => {
        if (game && game.bossPhase === 'fight' && game.level.boss && game.level.boss.alive && game.state !== 'answering') {
          showBossMCQ(game);
        } else if (game) {
          game.bossMCQActive = false;
        }
      }, mcqDelay);
    }

    // Boss attack collision: boss rushing into ball
    if (level.boss.alive && level.boss.attacking && g.invincible <= 0) {
      const bCx = level.boss.x + level.boss.w/2;
      const bCy = level.boss.y + level.boss.h/2;
      const dx = g.px - bCx, dy = g.py - bCy;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if (dist < BALL_R + level.boss.w/2) {
        level.boss.stopAttack();
        spawnParticles(g.px, g.py, '#FF4D6D', 16, 8);
        spawnTextParticle(g.px, g.py-30, '-½ ❤', '#FF4D6D');
        playerTakeDamage(g, false, 0.5);
        Audio.enemy();
      }
    }

    // Boss dies → win
    if (!level.boss.alive && g.bossPhase === 'fight') {
      g.bossPhase = 'dead';
      setTimeout(() => { if (game === g) triggerWin(g); }, 2000);
    }
  }

  // Particles
  for (const p of g.particles) p.update();
  g.particles = g.particles.filter(p=>p.life>0);
  for (const tp of g.textParticles) { tp.y+=tp.vy; tp.vy*=0.95; tp.life--; }
  g.textParticles = g.textParticles.filter(t=>t.life>0);

  // Confetti
  for (const c of confettiList) c.update();
  confettiList = confettiList.filter(c=>c.life>0);

  // Ball correct glow countdown
  if (g.correctGlow > 0) g.correctGlow--;

  // Camera
  g.targetCamX = g.px - CW*0.35;
  g.targetCamX = Math.max(0, Math.min(level.worldW - CW, g.targetCamX));
  g.camX += (g.targetCamX - g.camX) * 0.09;
  // Small landscape phones: keep the ball high so the touch controls don't cover it.
  // Tall portrait screens have room below, so the world sits lower (camY may go negative = more sky).
  const tallScreen = CH > CW * 1.3;
  const camYOffset = !tallScreen && window.innerWidth < 600 ? CH * 0.42 : CH * 0.55;
  g.camY = tallScreen ? g.py - camYOffset : Math.max(0, g.py - camYOffset);

  updateHUD(g);
}

