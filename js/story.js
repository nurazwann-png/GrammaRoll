// ══════════════════════════════════════════════
//  CUTSCENE ENGINE
// ══════════════════════════════════════════════
const CS_INTRO_KEY = 'gr_intro_seen';

const INTRO_SCENES = [
  {
    fx:['fireflies'], music:'calm', camera:'zoom', sfx:[['sparkle',400]],
    bg: 'night', stars: true,
    chars: [],
    narrator: true,
    text: 'Once upon a time, in a magical land called...\n\n✨  L I N G U I A  ✨\n\n...words had incredible power.',
  },
  {
    fx:['sunrays','sparkles','flowers'], music:'calm', camera:'pan', sfx:[['sparkle',200]],
    bg: 'kingdom', stars: false,
    chars: [
      { id:'fairy', emoji:'🧚', side:'left', big:true },
      { id:'house', emoji:'🏡', side:'right', big:true, static:true },
    ],
    speaker:'Whisper the Fairy', speakerColor:'#A78BFA',
    text:'Welcome to Linguia! 🌟 Every correct sentence makes flowers bloom, rivers flow, and the sun shine brighter!',
  },
  {
    fx:['rain','lightning'], music:'dark', camera:'zoom',
    bg: 'dark', stars: true,
    chars: [
      { id:'baron', emoji:'👹', side:'right', big:true, shake:true },
    ],
    narrator: true,
    text:'But one stormy night, the evil\n😈  Baron Von Error  😈\narrived from the Land of Confusion...',
  },
  {
    fx:['rain','lightning'], music:'dark', camera:'push',
    bg: 'dark', stars: false,
    chars: [
      { id:'baron', emoji:'👹', side:'center', big:true },
    ],
    speaker:'Baron Von Error', speakerColor:'#EF476F',
    text:'MWAHAHAHA! Grammar is BORING! I shall scramble every sentence until nobody speaks correctly EVER AGAIN!',
  },
  {
    fx:['scramble'], music:'dark', camera:'shake', sfx:[['chaos',150]],
    bg: 'chaos', stars: false,
    chars: [
      { id:'person1', emoji:'😱', side:'left' },
      { id:'person2', emoji:'😰', side:'right' },
    ],
    narrator: true,
    text:'He mixed up articles, broke verbs, and confused everyone! The whole kingdom of Linguia was in CHAOS! 💥',
  },
  {
    fx:['sunrays','sparkles'], music:'calm', camera:'pan', sfx:[['sparkle',300]],
    bg: 'kingdom', stars: false,
    chars: [
      { id:'fairy', emoji:'🧚', side:'left', big:true },
      { id:'grammo', emoji:'😊', side:'right', big:true, ball:true },
    ],
    speaker:'Whisper the Fairy', speakerColor:'#A78BFA',
    text:'Grammo! You are the chosen one! 🌟 Only YOU can bounce through Baron\'s traps and fix all the grammar!',
  },
  {
    fx:['confetti','sparkles'], music:'calm', camera:'zoom', sfx:[['fanfare',200],['boing',900]],
    bg: 'victory', stars: true,
    chars: [
      { id:'grammo', emoji:'😊', side:'center', big:true, ball:true, bounce:true },
    ],
    speaker:'Grammo', speakerColor:'#06D6A0',
    text:'I am READY! 💪 Let\'s show that villain what proper grammar looks like!',
    last: true,
    cta: '🎮 Begin Adventure!',
    ctaAction: 'intro',
  },
];

const ENDING_SCENES = [
  {
    fx:['confetti'], music:'calm', camera:'zoom', sfx:[['boing',300],['fanfare',700]],
    bg: 'victory', stars: true,
    chars: [
      { id:'grammo', emoji:'😊', side:'left', big:true, ball:true, bounce:true },
      { id:'baron',  emoji:'👹', side:'right', big:true, defeated:true },
    ],
    speaker:'Grammo', speakerColor:'#06D6A0',
    text:'Grammar rules! 🏆 And so do I!',
  },
  {
    fx:['rain'], music:'dark', camera:'push', sfx:[['whoosh',200]],
    bg: 'dark', stars: false,
    chars: [
      { id:'baron', emoji:'👹', side:'center', big:true, defeated:true },
    ],
    speaker:'Baron Von Error', speakerColor:'#EF476F',
    text:'NOOOO! Impossible! How did you know ALL those grammar rules?! I... I cannot believe it!',
  },
  {
    fx:['sunrays','confetti','flowers'], music:'calm', camera:'pan', sfx:[['cheer',200]],
    bg: 'kingdom', stars: false,
    chars: [
      { id:'fairy',  emoji:'🧚', side:'left', big:true },
      { id:'confetti', emoji:'🎊', side:'right', big:true, static:true, bounce:true },
    ],
    speaker:'Whisper the Fairy', speakerColor:'#A78BFA',
    text:'You did it, Grammo! 🌈 The words are free! Every sentence is correct again! LINGUIA IS SAVED! 🎉',
  },
  {
    fx:['confetti','sparkles'], music:'calm', camera:'zoom', sfx:[['fanfare',300]],
    bg: 'victory', stars: true,
    chars: [
      { id:'grammo', emoji:'😊', side:'center', big:true, ball:true, bounce:true },
    ],
    narrator: true,
    text:'From that day on, Grammo was celebrated as the greatest Grammar Hero in all of Linguia!\n\nAnd everyone lived happily — and grammatically correctly — ever after! 🌟',
  },
  {
    fx:['fireflies','sparkles'], music:'calm', camera:'zoom', sfx:[['sparkle',300]],
    bg: 'ending', stars: true,
    chars: [],
    narrator: true,
    text:'⭐  T H E   E N D  ⭐\n\nRemember:\n"Good grammar is your SUPERPOWER!" 💪',
    last: true,
    cta: '🏠 Back to Menu',
    ctaAction: 'menu',
  },
];

// Story chapters that play when Grammo first enters each new world
const WORLD_STORIES = {
  2: [
    {
      audioKey: 'jumble',
      fx:['confetti','sparkles'], music:'calm', camera:'zoom', sfx:[['cheer',200],['boing',700]],
      bg: 'playground', stars: false,
      chars: [
        { id:'grammo', side:'left', big:true, bounce:true },
        { id:'jumble', side:'right', big:true, defeated:true },
      ],
      narrator: true,
      text: 'With a POP and a CLATTER, King Jumble tumbled back into the toy box. Grammo had beaten the Playground boss!',
    },
    {
      fx:['fireflies','sparkles'], music:'calm', camera:'zoom', sfx:[['cheer',300]],
      bg: 'victory', stars: true,
      chars: [
        { id:'grammo', emoji:'😊', side:'left', big:true, ball:true, bounce:true },
        { id:'baron',  emoji:'👹', side:'right', big:true, defeated:true },
      ],
      narrator: true,
      text: 'The Playground was saved! The children laughed, and every sentence sparkled again...\n\nBut Baron Von Error was not finished yet.',
    },
    {
      fx:['rain','lightning'], music:'dark', camera:'push', sfx:[['whoosh',200]],
      bg: 'dark', stars: false,
      chars: [ { id:'baron', emoji:'👹', side:'center', big:true, shake:true } ],
      speaker:'Baron Von Error', speakerColor:'#EF476F',
      text: 'You fixed one little playground? HA! I am flying to the Safari. The animals will never say what they are doing correctly!',
    },
    {
      fx:['sunrays','scramble'], music:'dark', camera:'shake', sfx:[['chaos',150]],
      bg: 'safari', stars: false,
      chars: [
        { id:'lion',   emoji:'🦁', side:'left', big:true },
        { id:'monkey', emoji:'🐒', side:'right', shake:true },
      ],
      speaker:'Leo the Lion', speakerColor:'#F59E0B',
      text: 'Help! Baron scrambled our words! Now the monkeys say "I swinging" instead of "I am swinging"!',
    },
    {
      fx:['sunrays','sparkles'], music:'calm', camera:'pan', sfx:[['sparkle',300]],
      bg: 'safari', stars: false,
      chars: [
        { id:'fairy',  emoji:'🧚', side:'left', big:true },
        { id:'grammo', emoji:'😊', side:'right', big:true, ball:true },
      ],
      speaker:'Whisper the Fairy', speakerColor:'#A78BFA',
      text: 'Grammo, the Safari needs you! To say what is happening now, use "am", "is" or "are" with an "ing" word, like "I am swinging"!',
    },
    {
      fx:['confetti','sparkles'], music:'calm', camera:'zoom', sfx:[['boing',300]],
      bg: 'safari', stars: false,
      chars: [ { id:'grammo', emoji:'😊', side:'center', big:true, ball:true, bounce:true } ],
      speaker:'Grammo', speakerColor:'#06D6A0',
      text: 'I am bouncing to the Safari right now! Hold on, Leo! 🦁',
      last: true,
      cta: '🦁 Enter the Safari!',
    },
  ],
  3: [
    {
      audioKey: 'rhino',
      fx:['confetti','sparkles'], music:'calm', camera:'zoom', sfx:[['cheer',200],['boing',700]],
      bg: 'safari', stars: false,
      chars: [
        { id:'grammo', side:'left', big:true, bounce:true },
        { id:'rhino', side:'right', big:true, defeated:true },
      ],
      narrator: true,
      text: 'Rumble the Rhino sneezed, wobbled, and sat down with a big BUMP. Grammo had beaten the Safari boss!',
    },
    {
      fx:['sunrays','confetti'], music:'calm', camera:'pan', sfx:[['cheer',300]],
      bg: 'safari', stars: false,
      chars: [
        { id:'lion',   emoji:'🦁', side:'left', big:true, bounce:true },
        { id:'grammo', emoji:'😊', side:'right', big:true, ball:true, bounce:true },
      ],
      narrator: true,
      text: 'The Safari bloomed again! The lions were roaring, the birds were singing, and the monkeys were swinging happily.',
    },
    {
      fx:['rain','lightning'], music:'dark', camera:'push', sfx:[['whoosh',200]],
      bg: 'dark', stars: false,
      chars: [ { id:'baron', emoji:'👹', side:'center', big:true, shake:true } ],
      speaker:'Baron Von Error', speakerColor:'#EF476F',
      text: 'Grrr! Fine! I will hide in the busy City and mix up every story about yesterday. Nobody will remember what happened!',
    },
    {
      fx:['scramble'], music:'dark', camera:'shake', sfx:[['chaos',150]],
      bg: 'city', stars: true,
      chars: [
        { id:'mayor', emoji:'👩‍💼', side:'left', big:true },
        { id:'bus',   emoji:'🚌', side:'right', static:true, shake:true },
      ],
      speaker:'Mayor Molly', speakerColor:'#38BDF8',
      text: 'Oh no! Yesterday our bus driver said, "I drive to school." But it was yesterday. He drove!',
    },
    {
      fx:['sparkles'], music:'calm', camera:'pan', sfx:[['sparkle',300]],
      bg: 'city', stars: true,
      chars: [
        { id:'fairy',  emoji:'🧚', side:'left', big:true },
        { id:'grammo', emoji:'😊', side:'right', big:true, ball:true },
      ],
      speaker:'Whisper the Fairy', speakerColor:'#A78BFA',
      text: 'Grammo, the City needs help with the past. Yesterday we played, we walked, and we went home!',
    },
    {
      fx:['confetti','sparkles'], music:'calm', camera:'zoom', sfx:[['boing',300]],
      bg: 'city', stars: true,
      chars: [ { id:'grammo', emoji:'😊', side:'center', big:true, ball:true, bounce:true } ],
      speaker:'Grammo', speakerColor:'#06D6A0',
      text: 'Last time, I won. This time, I will win again! Let\'s go! 🏙️',
      last: true,
      cta: '🏙️ Enter the City!',
    },
  ],
  4: [
    {
      audioKey: 'robo',
      fx:['confetti','sparkles'], music:'calm', camera:'zoom', sfx:[['cheer',200],['boing',700]],
      bg: 'city', stars: true,
      chars: [
        { id:'grammo', side:'left', big:true, bounce:true },
        { id:'robo', side:'right', big:true, defeated:true },
      ],
      narrator: true,
      text: 'Robo Rush fizzed, beeped, and switched off with a CLICK. Grammo had beaten the City boss!',
    },
    {
      fx:['fireflies','sparkles'], music:'calm', camera:'pan', sfx:[['cheer',300]],
      bg: 'city', stars: true,
      chars: [
        { id:'mayor',  emoji:'👩‍💼', side:'left', big:true, bounce:true },
        { id:'grammo', emoji:'😊', side:'right', big:true, ball:true, bounce:true },
      ],
      narrator: true,
      text: 'The City lights shone brightly again. Everyone told their stories about yesterday perfectly.',
    },
    {
      fx:['rain','lightning'], music:'dark', camera:'push', sfx:[['whoosh',200]],
      bg: 'dark', stars: true,
      chars: [ { id:'baron', emoji:'👹', side:'center', big:true, shake:true } ],
      speaker:'Baron Von Error', speakerColor:'#EF476F',
      text: 'You have not won yet! I am going to blast into Space. Tomorrow, the whole universe will speak wrongly! MWAHAHAHA!',
    },
    {
      fx:['sparkles'], music:'dark', camera:'shake', sfx:[['chaos',150]],
      bg: 'space', stars: true,
      chars: [
        { id:'nova',   emoji:'👩‍🚀', side:'left', big:true },
        { id:'rocket', emoji:'🚀', side:'right', static:true, shake:true },
      ],
      speaker:'Captain Nova', speakerColor:'#C084FC',
      text: 'Grammo, come quickly! Baron is breaking our future sentences. Our rocket will not launch until we fix them!',
    },
    {
      fx:['sparkles'], music:'calm', camera:'pan', sfx:[['sparkle',300]],
      bg: 'space', stars: true,
      chars: [
        { id:'fairy',  emoji:'🧚', side:'left', big:true },
        { id:'grammo', emoji:'😊', side:'right', big:true, ball:true },
      ],
      speaker:'Whisper the Fairy', speakerColor:'#A78BFA',
      text: 'This is the final battle, Grammo. Use "will" and "going to" for the future. You are faster, braver and smarter than ever!',
    },
    {
      fx:['confetti','sparkles'], music:'calm', camera:'zoom', sfx:[['fanfare',200],['boing',900]],
      bg: 'space', stars: true,
      chars: [ { id:'grammo', emoji:'😊', side:'center', big:true, ball:true, bounce:true } ],
      speaker:'Grammo', speakerColor:'#06D6A0',
      text: 'I will stop Baron Von Error once and for all. Three, two, one... BLAST OFF! 🚀',
      last: true,
      cta: '🚀 Blast off to Space!',
    },
  ],
};

// A short scene before each boss fight (first time only). Bosses use the same art as in the game.
const BOSS_STORIES = {
  '1-3': [
    {
      fx:['scramble'], music:'dark', camera:'push', sfx:[['chaos',150]],
      bg: 'playground', stars: false,
      chars: [ { id:'jumble', side:'center', big:true, shake:true } ],
      speaker:'King Jumble', speakerColor:'#F2C27B',
      text: 'HALT! I am King Jumble, ruler of the toy box! Baron Von Error gave me the power to jumble every sentence in this playground!',
    },
    {
      fx:['sparkles'], music:'calm', camera:'zoom', sfx:[['boing',300]],
      bg: 'playground', stars: false,
      chars: [
        { id:'grammo', side:'left', big:true, bounce:true },
        { id:'jumble', side:'right', big:true },
      ],
      speaker:'Grammo', speakerColor:'#06D6A0',
      text: 'Not so fast! I know my simple present: he plays, she runs, it jumps. Let\'s do this!',
      last: true,
      cta: '⚔️ Fight King Jumble!',
    },
  ],
  '2-3': [
    {
      fx:['scramble'], music:'dark', camera:'push', sfx:[['chaos',150]],
      bg: 'safari', stars: false,
      chars: [ { id:'rhino', side:'center', big:true, shake:true } ],
      speaker:'Rumble the Rhino', speakerColor:'#AEB6C4',
      text: 'GRRRUMBLE! Nobody passes my watering hole! Baron says plurals are too hard. One lion, two lion. Who cares?',
    },
    {
      fx:['sunrays','sparkles'], music:'calm', camera:'zoom', sfx:[['boing',300]],
      bg: 'safari', stars: false,
      chars: [
        { id:'grammo', side:'left', big:true, bounce:true },
        { id:'rhino', side:'right', big:true },
      ],
      speaker:'Grammo', speakerColor:'#06D6A0',
      text: 'I care! One lion, two lions. One box, two boxes. And a rhino HAS a big horn. Charge!',
      last: true,
      cta: '⚔️ Fight Rumble the Rhino!',
    },
  ],
  '3-3': [
    {
      fx:['scramble'], music:'dark', camera:'shake', sfx:[['chaos',150]],
      bg: 'city', stars: true,
      chars: [ { id:'robo', side:'center', big:true, shake:true } ],
      speaker:'Robo Rush', speakerColor:'#7CF7FF',
      text: 'BEEP BOOP. Robo Rush online. Question: Where you going? Who you are? ERROR, ERROR! Ha ha ha!',
    },
    {
      fx:['sparkles'], music:'calm', camera:'zoom', sfx:[['boing',300]],
      bg: 'city', stars: true,
      chars: [
        { id:'grammo', side:'left', big:true, bounce:true },
        { id:'robo', side:'right', big:true },
      ],
      speaker:'Grammo', speakerColor:'#06D6A0',
      text: 'Your questions are all mixed up, Robo! Where ARE you going? Who ARE you? Do you want to lose? Let\'s go!',
      last: true,
      cta: '⚔️ Fight Robo Rush!',
    },
  ],
  '4-3': [
    {
      fx:['rain','lightning'], music:'dark', camera:'push', sfx:[['whoosh',200]],
      bg: 'space', stars: true,
      chars: [ { id:'baron', side:'center', big:true, shake:true } ],
      speaker:'Baron Von Error', speakerColor:'#EF476F',
      text: 'So, you beat all my helpers. Impressive... for a little ball. But now you face ME, Baron Von Error!',
    },
    {
      fx:['sparkles'], music:'calm', camera:'zoom', sfx:[['fanfare',200]],
      bg: 'space', stars: true,
      chars: [
        { id:'grammo', side:'left', big:true, bounce:true },
        { id:'baron', side:'right', big:true },
      ],
      speaker:'Grammo', speakerColor:'#06D6A0',
      text: 'This ends today, Baron! I will fix every sentence, and Linguia will be free!',
      last: true,
      cta: '⚔️ Final battle!',
    },
  ],
};

let csScenes = [];
let csSetId = 'intro';
let csIndex = 0;
let csTyping = false;
let csTypeTimer = null;
let csOnDone = null;

function csSpawnStars(count = 60) {
  const el = document.getElementById('cs-stars');
  el.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'cs-star';
    const size = Math.random() * 3 + 1;
    s.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;top:${Math.random()*80}%;animation-delay:${Math.random()*2}s;animation-duration:${1.5+Math.random()*2}s;opacity:${Math.random()*.7+.3}`;
    el.appendChild(s);
  }
}

function csBuildChar(ch) {
  const wrap = document.createElement('div');
  const classes = ['cs-char', ch.side || 'center'];
  if (ch.big)      classes.push('big');
  if (ch.bounce)   classes.push('bounce');
  if (ch.shake)    classes.push('shake');
  if (ch.defeated) classes.push('defeated');
  if (ch.static)   classes.push('static');
  wrap.className = classes.join(' ');
  wrap.dataset.id = ch.id;
  wrap.style.animationDelay = (ch.delay || 0) + 's';

  if (CS_ART_IDS.includes(ch.id)) {
    const art = document.createElement('canvas');
    art.className = 'cs-art' + (ch.id === 'grammo' ? ' round' : '');
    art.dataset.art = ch.id;
    art.setAttribute('aria-hidden', 'true');
    wrap.appendChild(art);
    const label = document.createElement('div');
    label.className = 'cs-char-name';
    label.textContent = CS_CHAR_NAMES[ch.id] || '';
    wrap.appendChild(label);
    return wrap;
  }

  if (ch.ball) {
    const ball = document.createElement('div');
    ball.className = 'cs-ball';
    ball.textContent = ch.emoji;
    wrap.appendChild(ball);
  } else {
    const em = document.createElement('span');
    em.className = 'cs-char-emoji';
    em.textContent = ch.emoji;
    wrap.appendChild(em);
  }
  const label = document.createElement('div');
  label.className = 'cs-char-name';
  label.textContent = CS_CHAR_NAMES[ch.id] || '';
  wrap.appendChild(label);
  return wrap;
}

function csShowFrame(idx) {
  const scene = csScenes[idx];
  if (!scene) return;

  // Background
  const bg = document.getElementById('cs-bg');
  const cam = prefersReducedMotion() ? '' : ` cam-${scene.camera || 'zoom'}`;
  bg.className = '';
  void bg.offsetWidth; // restart the camera animation
  bg.className = `cs-bg-${scene.bg}${cam}`;
  const charsCam = document.getElementById('cs-chars');
  charsCam.classList.remove('cam-push', 'cam-shake');
  void charsCam.offsetWidth;
  if (cam.includes('push') || cam.includes('shake')) charsCam.classList.add(cam.trim());

  // Stars
  const starsEl = document.getElementById('cs-stars');
  if (scene.stars) {
    starsEl.style.display = '';
    csSpawnStars();
  } else {
    starsEl.style.display = 'none';
    starsEl.innerHTML = '';
  }

  // Characters
  const charsEl = document.getElementById('cs-chars');
  charsEl.innerHTML = '';
  (scene.chars || []).forEach((ch, i) => {
    const el = csBuildChar({ ...ch, delay: i * 0.12 });
    charsEl.appendChild(el);
  });

  // Speaker
  const spkEl = document.getElementById('cs-speaker');
  if (scene.narrator) {
    spkEl.textContent = '📖  Story';
    spkEl.style.color = 'rgba(255,255,255,.45)';
    spkEl.style.fontStyle = 'italic';
  } else if (scene.speaker) {
    spkEl.textContent = scene.speaker;
    spkEl.style.color = scene.speakerColor || '#fff';
    spkEl.style.fontStyle = '';
  } else {
    spkEl.textContent = '';
  }

  // Dots
  const dots = document.getElementById('cs-dots');
  dots.innerHTML = '';
  csScenes.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'cs-dot' + (i === idx ? ' active' : '');
    dots.appendChild(d);
  });

  // CTA
  const ctaEl = document.getElementById('cs-cta');
  const tapEl = document.getElementById('cs-tap');
  if (scene.last) {
    ctaEl.textContent = scene.cta || 'Continue';
    ctaEl.classList.add('hidden');
    tapEl.classList.add('hidden');
  } else {
    ctaEl.classList.add('hidden');
    tapEl.classList.remove('hidden');
  }

  // Typewriter
  csTypeText(scene.text, scene.last, scene);
  csNarrate(scene);
  csStartSceneEffects(scene);
}

// Each character gets a recognisable voice by changing pitch and speed
const CS_VOICES = {
  'Whisper the Fairy': { pitch: 1.6, rate: 0.95 },
  'Baron Von Error':   { pitch: 0.5, rate: 0.8 },
  'Grammo':            { pitch: 1.3, rate: 1.05 },
  'Leo the Lion':      { pitch: 0.7, rate: 0.9 },
  'Mayor Molly':       { pitch: 1.1, rate: 1.0 },
  'Captain Nova':      { pitch: 1.2, rate: 1.0 },
  'King Jumble':       { pitch: 0.8, rate: 1.0 },
  'Rumble the Rhino':  { pitch: 0.45, rate: 0.85 },
  'Robo Rush':         { pitch: 1.4, rate: 1.1 },
};
const CS_CHAR_NAMES = { grammo:'Grammo', fairy:'Whisper', baron:'Baron Von Error', lion:'Leo', mayor:'Mayor Molly', nova:'Captain Nova',
  jumble:'King Jumble', rhino:'Rumble the Rhino', robo:'Robo Rush' };
// Characters drawn with the same art as in the game (characters.js) instead of an emoji
const CS_ART_IDS = ['grammo', 'baron', 'jumble', 'rhino', 'robo'];
function csSpokenText(text) {
  return text
    .replace(/\b(?:[A-Z] ){2,}[A-Z]\b/g, m => m.replace(/ /g, '').toLowerCase().replace(/^./, c => c.toUpperCase()))
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\.{3}/g, '…')
    .replace(/\s*\n+\s*/g, ', ')
    .replace(/([.!?…:])\s*,\s*/g, '$1 ')
    .replace(/,\s*…/g, ' …')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
// Pre-generated narration (scripts/generate-narration.js); hash guards against outdated audio
function narrationId(set, index) { return `${set}-${index}`; }
function sceneAudioId(set, scenes, scene) {
  if (scene.audioKey) return `${set}-${scene.audioKey}`;
  return narrationId(set, scenes.filter(s => !s.audioKey).indexOf(scene));
}
function narrationHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
let csAudioManifest = {};
let csAudioEl = null;
if (typeof fetch === 'function') {
  fetch('/audio/story/manifest.json').then(r => r.ok ? r.json() : {}).then(m => { csAudioManifest = m || {}; }).catch(() => {});
}
function csStopNarration() {
  if (csAudioEl) { csAudioEl.pause(); csAudioEl = null; }
  window.speechSynthesis?.cancel();
}

// Autoplay: each scene moves on by itself once its line has been read or spoken
let csAutoTimer = null;
function csClearAuto() { clearTimeout(csAutoTimer); csAutoTimer = null; }
function csScheduleAuto(ms) { csClearAuto(); csAutoTimer = setTimeout(csNext, ms); }
function csReadMs(scene) { return Math.max(4000, scene.text.length * 55 + 1500); }

// Move to the next scene (or finish on the last one)
function csNext() {
  csClearAuto();
  if (csTransitioning || document.getElementById('cutscene-overlay').classList.contains('hidden')) return;
  if (csTypeTimer) clearInterval(csTypeTimer);
  csTyping = false;
  const scene = csScenes[csIndex];
  if (!scene) return;
  if (scene.last) { document.getElementById('cs-cta').click(); return; }
  csIndex++;
  csGoTo(csIndex);
}

function csNarrate(scene) {
  csStopNarration();
  if (!scene) return;
  if (!getSettings().narrateStory) { csScheduleAuto(csReadMs(scene)); return; }
  const text = csSpokenText(scene.text);
  const id = sceneAudioId(csSetId, csScenes, scene);
  const entry = csAudioManifest[id];
  const voice = (!scene.narrator && CS_VOICES[scene.speaker]) || { pitch: 1, rate: 0.9 };
  if (entry && entry.hash === narrationHash(text)) {
    const el = document.createElement('audio');
    el.src = `/audio/story/${entry.file}`;
    csAudioEl = el;
    el.addEventListener('ended', () => { if (csAudioEl === el) csScheduleAuto(1200); });
    csScheduleAuto(csReadMs(scene) + 10000); // safety net if the audio never ends
    el.play().then(() => csConnectAnalyser(el)).catch(() => {
      if (csAudioEl === el) { csAudioEl = null; speak(text, voice); csScheduleAuto(text.length * 80 + 1500); }
    });
    return;
  }
  speak(text, voice);
  csScheduleAuto(text.length * 80 + 1500);
}
function csUpdateVoiceBtn() {
  const on = getSettings().narrateStory;
  const btn = document.getElementById('cs-voice');
  btn.textContent = on ? '🔊' : '🔇';
  btn.setAttribute('aria-label', on ? 'Turn story narration off' : 'Turn story narration on');
}
function csToggleVoice(e) {
  e.stopPropagation();
  const on = !getSettings().narrateStory;
  saveSettings({ narrateStory: on });
  csUpdateVoiceBtn();
  if (on) { csNarrate(csScenes[csIndex]); csSetMusic(csMusicFor(csIndex)); }
  else { csStopNarration(); csSetMusic(null); csScheduleAuto(csReadMs(csScenes[csIndex])); }
}

// ══════════════════════════════════════════════
//  CUTSCENE SOUND: music beds, sound effects, talking
// ══════════════════════════════════════════════
let csSfxManifest = {};
if (typeof fetch === 'function') {
  fetch('/audio/story/sfx.json').then(r => r.ok ? r.json() : {}).then(m => { csSfxManifest = m || {}; }).catch(() => {});
}
let csScheduledSfx = [];
const csMusicEls = {};

function csPlaySfx(id, volume = 0.6) {
  const e = csSfxManifest[id];
  if (!e || !getSettings().narrateStory) return;
  const a = document.createElement('audio');
  a.src = `/audio/story/${e.file}`;
  a.volume = volume;
  a.play().catch(() => {});
}

function csFade(el, target) {
  clearInterval(el._fade);
  if (target > 0 && el.paused) el.play().catch(() => {});
  el._fade = setInterval(() => {
    const d = target - el.volume;
    if (Math.abs(d) <= 0.02) {
      el.volume = target;
      clearInterval(el._fade);
      if (target === 0) el.pause();
      return;
    }
    el.volume = Math.min(1, Math.max(0, el.volume + Math.sign(d) * 0.02));
  }, 50);
}

function csMusicFor(idx) {
  for (let i = idx; i >= 0; i--) if (csScenes[i]?.music) return csScenes[i].music;
  return null;
}

function csSetMusic(mood) {
  if (!getSettings().narrateStory) mood = null;
  ['calm', 'dark'].forEach(m => {
    const entry = csSfxManifest[`music-${m}`];
    if (!entry) return;
    let el = csMusicEls[m];
    if (!el && mood === m) {
      el = csMusicEls[m] = document.createElement('audio');
      el.src = `/audio/story/${entry.file}`;
      el.loop = true;
      el.volume = 0;
    }
    if (el) csFade(el, mood === m ? 0.14 : 0);
  });
}

// Voice level → speaking character bounce (Web Audio analyser on the narration MP3)
let csAudioCtx = null, csAnalyser = null, csLevelData = null;
function csConnectAnalyser(el) {
  try {
    if (!csAudioCtx) {
      csAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      csAnalyser = csAudioCtx.createAnalyser();
      csAnalyser.fftSize = 512;
      csLevelData = new Uint8Array(csAnalyser.fftSize);
      csAnalyser.connect(csAudioCtx.destination);
    }
    csAudioCtx.resume().then(() => {
      if (csAudioEl !== el || el._analysed) return;
      csAudioCtx.createMediaElementSource(el).connect(csAnalyser);
      el._analysed = true;
    }).catch(() => {});
  } catch (e) { /* level stays estimated */ }
}
function csVoiceLevel(ts) {
  if (csAudioEl && !csAudioEl.paused) {
    if (csAudioEl._analysed) {
      csAnalyser.getByteTimeDomainData(csLevelData);
      let sum = 0;
      for (let i = 0; i < csLevelData.length; i++) { const v = (csLevelData[i] - 128) / 128; sum += v * v; }
      return Math.min(1, Math.sqrt(sum / csLevelData.length) * 4);
    }
    return 0.45 + 0.35 * Math.sin(ts / 85);
  }
  if (window.speechSynthesis?.speaking) return 0.45 + 0.35 * Math.sin(ts / 85);
  return 0;
}

// ══════════════════════════════════════════════
//  CUTSCENE EFFECTS (canvas particles, lightning)
// ══════════════════════════════════════════════
const CS_SPEAKER_IDS = { 'Whisper the Fairy': 'fairy', 'Baron Von Error': 'baron', 'Grammo': 'grammo', 'Leo the Lion': 'lion', 'Mayor Molly': 'mayor', 'Captain Nova': 'nova',
  'King Jumble': 'jumble', 'Rumble the Rhino': 'rhino', 'Robo Rush': 'robo' };
const CS_COLORS = ['#FFD166', '#06D6A0', '#EF476F', '#4A90D9', '#8B5CF6', '#FF8C42'];
const CS_WORDS = ['a', 'an', 'the', 'is', 'are', 'am', 'go', 'went', '-ed', '-s', '?', '!', 'was', 'were', 'he', 'she'];
const CS_FX_COUNTS = { rain: 150, sparkles: 40, fireflies: 32, confetti: 90, scramble: 26, flowers: 16 };
const csFx = { kinds: [], parts: [], raf: null, W: 0, H: 0, nextBolt: 0, bolt: null, boltUntil: 0, talk: 0, speakerId: null, sceneStart: 0 };

function csFxMake(kind, W, H, initial) {
  const r = Math.random;
  switch (kind) {
    case 'rain':      return { kind, x: r() * W * 1.3, y: initial ? r() * H : -30, vy: 10 + r() * 7, len: 12 + r() * 16 };
    case 'sparkles':  return { kind, x: r() * W, y: initial ? r() * H : H * (0.5 + r() * 0.5), vy: -(0.3 + r() * 0.8), size: 4 + r() * 8, ph: r() * 6.3 };
    case 'fireflies': return { kind, x: r() * W, y: r() * H * 0.85, a: r() * 6.3, sp: 0.3 + r() * 0.6, size: 2 + r() * 3, ph: r() * 6.3 };
    case 'confetti':  return { kind, x: r() * W, y: initial ? -r() * H : -20, vy: 1.6 + r() * 2.6, vx: -1 + r() * 2, rot: r() * 6.3, vr: -0.15 + r() * 0.3, w: 6 + r() * 7, h: 4 + r() * 6, c: CS_COLORS[(r() * 6) | 0] };
    case 'scramble':  return { kind, x: r() * W, y: r() * H * 0.75, vx: -2 + r() * 4, vy: -2 + r() * 4, rot: r() * 6.3, vr: -0.08 + r() * 0.16, txt: CS_WORDS[(r() * CS_WORDS.length) | 0], size: 18 + r() * 28, c: CS_COLORS[(r() * 6) | 0] };
    case 'flowers':   return { kind, x: r() * W, y: initial ? r() * H : H + 30, vy: -(0.6 + r()), vx: -0.4 + r() * 0.8, rot: r() * 6.3, vr: -0.02 + r() * 0.04, txt: ['🌸', '🌼', '🌷', '🍃'][(r() * 4) | 0], size: 18 + r() * 16 };
  }
  return null;
}

function csResizeFx() {
  const c = document.getElementById('cs-fx');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  csFx.W = c.clientWidth; csFx.H = c.clientHeight;
  c.width = csFx.W * dpr; c.height = csFx.H * dpr;
  c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function csStartSceneEffects(scene) {
  csResizeFx();
  const reduced = prefersReducedMotion();
  csFx.kinds = scene.fx || [];
  csFx.parts = [];
  csFx.kinds.forEach(k => {
    const n = Math.round((CS_FX_COUNTS[k] || 0) * (reduced ? 0.25 : 1));
    for (let i = 0; i < n; i++) { const p = csFxMake(k, csFx.W, csFx.H, true); if (p) csFx.parts.push(p); }
  });
  csFx.sceneStart = performance.now();
  csFx.nextBolt = csFx.kinds.includes('lightning') ? csFx.sceneStart + 500 : Infinity;
  csFx.bolt = null;
  csFx.speakerId = scene.narrator ? null : CS_SPEAKER_IDS[scene.speaker] || null;
  document.querySelectorAll('#cs-chars .cs-char').forEach(c => c.classList.toggle('speaking', c.dataset.id === csFx.speakerId));

  csScheduledSfx.forEach(clearTimeout);
  csScheduledSfx = (scene.sfx || []).map(([id, delay]) => setTimeout(() => csPlaySfx(id), delay));
  const mood = csMusicFor(csScenes.indexOf(scene));
  if (mood) csSetMusic(mood);
  if (!csFx.raf) csFx.raf = requestAnimationFrame(csFxFrame);
}

function csFxStop() {
  if (csFx.raf) cancelAnimationFrame(csFx.raf);
  csFx.raf = null;
  csFx.parts = [];
  const c = document.getElementById('cs-fx');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

window.addEventListener('resize', () => { if (csFx.raf) csResizeFx(); });

function csMakeBolt(W, H) {
  const pts = [];
  let x = W * (0.15 + Math.random() * 0.7), y = 0;
  while (y < H * 0.55) { pts.push([x, y]); x += -30 + Math.random() * 60; y += 20 + Math.random() * 30; }
  return pts;
}

function csFxFrame(ts) {
  csFx.raf = requestAnimationFrame(csFxFrame);
  const c = document.getElementById('cs-fx');
  const ctx = c.getContext('2d');
  // The canvas had no size when particles were made (e.g. hidden): wait for a size, then respawn them
  if (!csFx.W || !csFx.H || c.clientWidth !== csFx.W) {
    csResizeFx();
    if (!csFx.W || !csFx.H) return;
    csFx.parts = csFx.parts.map(p => csFxMake(p.kind || csFx.kinds[0], csFx.W, csFx.H, true) || p);
  }
  const { W, H } = csFx;
  ctx.clearRect(0, 0, W, H);
  const reduced = prefersReducedMotion();

  // Sun rays slowly turning behind everything
  if (csFx.kinds.includes('sunrays')) {
    ctx.save();
    ctx.translate(W * 0.5, -H * 0.1);
    ctx.rotate(ts / 9000);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.fillStyle = 'rgba(255,244,190,0.07)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-60, H * 1.4); ctx.lineTo(60, H * 1.4); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // Lightning with thunder
  if (ts >= csFx.nextBolt) {
    csFx.bolt = csMakeBolt(W, H);
    csFx.boltUntil = ts + 160;
    csFx.nextBolt = ts + 3500 + Math.random() * 3500;
    if (!reduced) {
      const flash = document.getElementById('cs-flash');
      flash.classList.remove('show'); void flash.offsetWidth; flash.classList.add('show');
    }
    setTimeout(() => csPlaySfx('thunder', 0.45), 150);
  }
  if (csFx.bolt && ts < csFx.boltUntil) {
    ctx.save();
    ctx.strokeStyle = '#E0E7FF'; ctx.lineWidth = 3; ctx.shadowColor = '#A5B4FC'; ctx.shadowBlur = 18;
    ctx.beginPath(); csFx.bolt.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    ctx.restore();
  }

  for (const p of csFx.parts) {
    switch (p.kind) {
      case 'rain':
        p.y += p.vy; p.x -= p.vy * 0.25;
        if (p.y > H) Object.assign(p, csFxMake('rain', W, H, false));
        ctx.strokeStyle = 'rgba(180,200,255,0.45)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.len * 0.25, p.y + p.len); ctx.stroke();
        break;
      case 'sparkles': {
        p.y += p.vy; p.ph += 0.08;
        if (p.y < -20) Object.assign(p, csFxMake('sparkles', W, H, false));
        const a = 0.35 + 0.65 * Math.abs(Math.sin(p.ph)), s = p.size * (0.6 + 0.4 * Math.abs(Math.sin(p.ph)));
        ctx.fillStyle = `rgba(255,240,170,${a})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + s * 0.25, p.y - s * 0.25); ctx.lineTo(p.x + s, p.y); ctx.lineTo(p.x + s * 0.25, p.y + s * 0.25);
        ctx.lineTo(p.x, p.y + s); ctx.lineTo(p.x - s * 0.25, p.y + s * 0.25); ctx.lineTo(p.x - s, p.y); ctx.lineTo(p.x - s * 0.25, p.y - s * 0.25);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'fireflies': {
        p.a += (Math.random() - 0.5) * 0.3; p.ph += 0.05;
        p.x = (p.x + Math.cos(p.a) * p.sp + W) % W; p.y = Math.min(H * 0.9, Math.max(10, p.y + Math.sin(p.a) * p.sp));
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
        g.addColorStop(0, `rgba(255,236,140,${0.5 + 0.5 * Math.sin(p.ph)})`); g.addColorStop(1, 'rgba(255,236,140,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 5, 0, 6.3); ctx.fill();
        break;
      }
      case 'confetti':
        p.y += p.vy; p.x += p.vx + Math.sin(ts / 400 + p.rot) * 0.5; p.rot += p.vr;
        if (p.y > H + 20) Object.assign(p, csFxMake('confetti', W, H, false));
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2))); ctx.restore();
        break;
      case 'scramble':
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H * 0.8) p.vy *= -1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.font = `${p.size}px 'Fredoka One', cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = p.c; ctx.globalAlpha = 0.85; ctx.fillText(p.txt, 0, 0); ctx.restore();
        break;
      case 'flowers':
        p.y += p.vy; p.x += p.vx; p.rot += p.vr;
        if (p.y < -30) Object.assign(p, csFxMake('flowers', W, H, false));
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.font = `${p.size}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.8; ctx.fillText(p.txt, 0, 0); ctx.restore();
        break;
    }
  }

  // Speaking character follows the loudness of their voice
  const target = csFx.speakerId ? csVoiceLevel(ts) : 0;
  csFx.talk += (target - csFx.talk) * 0.35;
  const speaker = csFx.speakerId && document.querySelector(`#cs-chars .cs-char[data-id="${csFx.speakerId}"]`);
  if (speaker) speaker.style.setProperty('--talk', csFx.talk.toFixed(3));
  csDrawArt(ts);
}

// Grammo and the bosses: same drawings as in the game, mouth moving with their voice
function csDrawArt(ts) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  document.querySelectorAll('#cs-chars canvas.cs-art').forEach(c => {
    const size = c.clientWidth;
    if (!size) return;
    if (c.width !== Math.round(size * dpr)) { c.width = c.height = Math.round(size * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const wrap = c.parentElement;
    const id = c.dataset.art;
    const talk = csFx.speakerId === id ? Math.min(1, csFx.talk * 1.6) : 0;
    const look = wrap.classList.contains('left') ? 1 : wrap.classList.contains('right') ? -1 : 0;
    if (id === 'grammo') {
      const cols = (typeof SKIN_COLORS !== 'undefined' && SKIN_COLORS[getActiveSkin()]) || ['#FFA040', '#FF6B00', '#C04000'];
      ctx.translate(size / 2, size / 2);
      drawGrammoBall(ctx, size * 0.46, cols, { mood: wrap.classList.contains('bounce') ? 'excited' : 'happy', talk, look, t: ts });
    } else {
      const mood = wrap.classList.contains('defeated') ? 'defeated' : wrap.classList.contains('shake') && !talk ? 'charge' : 'normal';
      const pad = size * 0.14;
      ctx.translate(pad, pad * 1.2);
      drawBoss(ctx, id, size - pad * 2, size - pad * 2, { mood, talk, look, t: ts });
    }
  });
}

function csTypeText(fullText, isLast, scene) {
  const el = document.getElementById('cs-text');
  el.textContent = '';
  if (csTypeTimer) clearInterval(csTypeTimer);
  csTyping = true;
  let i = 0;
  const delay = fullText.length > 120 ? 22 : 28;
  csTypeTimer = setInterval(() => {
    i++;
    el.textContent = fullText.slice(0, i);
    if (i >= fullText.length) {
      clearInterval(csTypeTimer);
      csTyping = false;
      if (isLast) {
        const ctaEl = document.getElementById('cs-cta');
        ctaEl.classList.remove('hidden');
        document.getElementById('cs-tap').classList.add('hidden');
      }
    }
  }, delay);
}

let csTransitioning = false;
function csGoTo(idx) {
  const curtain = document.getElementById('cs-curtain');
  if (prefersReducedMotion()) { csShowFrame(idx); return; }
  csTransitioning = true;
  csPlaySfx('whoosh', 0.3);
  curtain.classList.add('show');
  setTimeout(() => {
    csShowFrame(idx);
    curtain.classList.remove('show');
    csTransitioning = false;
  }, 230);
}

function csFinish() {
  csClearAuto();
  csStopNarration();
  csSetMusic(null);
  csFxStop();
  csScheduledSfx.forEach(clearTimeout);
  csScheduledSfx = [];
  const overlay = document.getElementById('cutscene-overlay');
  overlay.classList.add('fade-out');
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('fade-out');
    if (csOnDone) csOnDone();
    csOnDone = null;
  }, 400);
}

function worldStoryKey(world) { return pk(`gr_world_story_${world}`); }
function hasSeenWorldStory(world) {
  try { return !!localStorage.getItem(worldStoryKey(world)); } catch (e) { return true; }
}
function showWorldStory(world, onDone) {
  if (!WORLD_STORIES[world]) { if (onDone) onDone(); return; }
  try { localStorage.setItem(worldStoryKey(world), '1'); } catch (e) {}
  stopWorldMusic();
  csScenes = WORLD_STORIES[world];
  csSetId = `world${world}`;
  csIndex = 0;
  csOnDone = onDone || null;
  const overlay = document.getElementById('cutscene-overlay');
  overlay.classList.remove('hidden', 'fade-out');
  csUpdateVoiceBtn();
  csShowFrame(0);
}

function bossStoryKey(levelKey) { return pk(`gr_boss_story_${levelKey}`); }
function hasSeenBossStory(levelKey) {
  try { return !!localStorage.getItem(bossStoryKey(levelKey)); } catch (e) { return true; }
}
function showBossStory(levelKey, onDone) {
  if (!BOSS_STORIES[levelKey]) { if (onDone) onDone(); return; }
  try { localStorage.setItem(bossStoryKey(levelKey), '1'); } catch (e) {}
  stopWorldMusic();
  csScenes = BOSS_STORIES[levelKey];
  csSetId = `boss${levelKey.split('-')[0]}`;
  csIndex = 0;
  csOnDone = onDone || null;
  const overlay = document.getElementById('cutscene-overlay');
  overlay.classList.remove('hidden', 'fade-out');
  csUpdateVoiceBtn();
  csShowFrame(0);
}

function showIntroCutscene(onDone) {
  csScenes = INTRO_SCENES;
  csSetId = 'intro';
  csIndex = 0;
  csOnDone = onDone || null;
  const overlay = document.getElementById('cutscene-overlay');
  overlay.classList.remove('hidden', 'fade-out');
  csUpdateVoiceBtn();
  csShowFrame(0);
}

function showEndingCutscene(onDone) {
  stopWorldMusic(); // the story has its own music
  csScenes = ENDING_SCENES;
  csSetId = 'ending';
  csIndex = 0;
  csOnDone = onDone || (() => showMenu());
  const overlay = document.getElementById('cutscene-overlay');
  overlay.classList.remove('hidden', 'fade-out');
  csUpdateVoiceBtn();
  csShowFrame(0);
}

// Wire up click/tap on dialog and CTA
document.addEventListener('DOMContentLoaded', () => {
  // Any tap or key skips the current part; only the Skip button skips the whole story
  document.getElementById('cutscene-overlay').addEventListener('click', e => {
    if (e.target.closest('#cs-skip, #cs-voice, #cs-cta')) return;
    csNext();
  });
  document.addEventListener('keydown', e => {
    if (document.getElementById('cutscene-overlay').classList.contains('hidden') || e.repeat) return;
    if (e.target.closest && e.target.closest('#cutscene-overlay button')) return;
    e.preventDefault();
    csNext();
  });

  document.getElementById('cs-cta').addEventListener('click', () => {
    const scene = csScenes[csIndex];
    const action = scene?.ctaAction;
    csFinish();
    if (action === 'menu') { /* csFinish already calls csOnDone which shows menu */ }
    // 'intro' action: csOnDone is null (caller handles start)
  });

  document.getElementById('cs-skip').addEventListener('click', () => {
    if (csTypeTimer) clearInterval(csTypeTimer);
    csTyping = false;
    csFinish();
  });
});

document.addEventListener('DOMContentLoaded', () => {
  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Detect mobile device and apply class for CSS targeting
  const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.screen.width < 768;
  if (isMobile) document.body.classList.add('is-mobile');
  window.addEventListener('resize', () => {
    const m = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.screen.width < 768;
    document.body.classList.toggle('is-mobile', m);
  });


  document.getElementById('name-input')?.addEventListener('keydown', e => {
    if (e.key==='Enter') submitName();
  });

  // Update daily challenge button label if already completed today
  const dailyProg = getDailyProgress();
  const todayDone = dailyProg[getDailyDateStr()];
  const dailyLbl = document.getElementById('daily-btn-label');
  if (dailyLbl && todayDone) dailyLbl.textContent = `Daily ✅ ${todayDone.score}pts`;
  const modeDailyLbl = document.getElementById('mode-daily-label');
  if (modeDailyLbl && todayDone) modeDailyLbl.textContent = `Daily ✅ ${todayDone.score}pts`;
});

