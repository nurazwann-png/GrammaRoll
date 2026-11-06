// Generates story sound effects and music loops with ElevenLabs.
// Usage: npm run sfx            (only missing or changed sounds)
//        npm run sfx -- --force (regenerate everything)
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'audio', 'story');
const MANIFEST = path.join(OUT_DIR, 'sfx.json');
const FORCE = process.argv.includes('--force');

try {
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  });
} catch (e) { /* no .env */ }

// Prompts are part of the cache key: edit one and only that sound is regenerated
const SOUNDS = {
  'music-calm': { seconds: 22, influence: 0.5, loop: true,
    prompt: 'Gentle magical fairy-tale background music loop for a children\'s storybook, soft harp, glockenspiel and warm strings, calm and wondrous, no vocals' },
  'music-dark': { seconds: 22, influence: 0.5, loop: true,
    prompt: 'Mischievous cartoon villain background music loop for a children\'s game, low pizzicato strings and bassoon, sneaky and playful but not scary, no vocals' },
  // In-game music, one loop per world (boss levels reuse music-dark)
  'music-w1': { seconds: 22, influence: 0.5, loop: true,
    prompt: "Cheerful playful children's game background music loop, ukulele, xylophone and soft claps, bouncy and happy, no vocals" },
  'music-w2': { seconds: 22, influence: 0.5, loop: true,
    prompt: "Upbeat safari adventure background music loop for a children's game, marimba, kalimba and light hand drums, no vocals" },
  'music-w3': { seconds: 22, influence: 0.5, loop: true,
    prompt: "Light funky evening city background music loop for a children's game, groovy bass, soft electric piano and finger snaps, no vocals" },
  'music-w4': { seconds: 22, influence: 0.5, loop: true,
    prompt: "Dreamy space adventure background music loop for a children's game, twinkling synth arpeggios and soft warm pads, full of wonder, no vocals" },
  'whoosh':   { seconds: 1.2, influence: 0.6, prompt: 'Soft magical whoosh transition, cartoon, airy' },
  'sparkle':  { seconds: 2,   influence: 0.6, prompt: 'Magical fairy sparkle chime, twinkling bells, bright and gentle' },
  'thunder':  { seconds: 4,   influence: 0.5, prompt: 'Rolling thunder clap with light rain, dramatic but suitable for children' },
  'chaos':    { seconds: 3,   influence: 0.5, prompt: 'Cartoon chaos: boings, slide whistles, clattering letters and a comedic crash' },
  'cheer':    { seconds: 4,   influence: 0.5, prompt: 'Crowd of happy children cheering and clapping, celebration' },
  'fanfare':  { seconds: 3,   influence: 0.6, prompt: 'Short triumphant orchestral fanfare with trumpets and cymbal, victory' },
  'boing':    { seconds: 1,   influence: 0.7, prompt: 'Single cheerful cartoon ball bounce boing' },
};

async function generate(id, s) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_64', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: s.prompt, duration_seconds: s.seconds, prompt_influence: s.influence, ...(s.loop ? { loop: true } : {}) }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} for ${id}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) { console.error('Add ELEVENLABS_API_KEY to .env first.'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) {}
  let made = 0;
  for (const [id, s] of Object.entries(SOUNDS)) {
    const file = `sfx-${id}.mp3`;
    const key = `${s.prompt}|${s.seconds}|${s.influence}|${!!s.loop}`;
    if (!FORCE && manifest[id]?.key === key && fs.existsSync(path.join(OUT_DIR, file))) { console.log(`  ✓ ${id} unchanged`); continue; }
    const audio = await generate(id, s);
    fs.writeFileSync(path.join(OUT_DIR, file), audio);
    manifest[id] = { file, key, loop: !!s.loop };
    made++;
    console.log(`  ♪ ${id} ${Math.round(audio.length / 1024)} KB`);
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  }
  for (const id of Object.keys(manifest)) if (!SOUNDS[id]) delete manifest[id];
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Done: ${made} generated.`);
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
