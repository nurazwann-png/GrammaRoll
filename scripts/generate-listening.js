// Generates MP3s for listening questions ({type:'listen', say:'…'}) with ElevenLabs.
// Usage: npm run listening   (only sentences without a clip yet)
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'audio', 'story');
const MANIFEST = path.join(OUT_DIR, 'listen.json');
const VOICE = { name: 'Lily', id: 'pFZP5JQG7iQjIQuC4Bku' }; // clear British voice

try {
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
} catch (e) { /* no .env */ }

// Same hash as narrationHash() in js/story.js, which the game uses to find the clip
function narrationHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const ctx = vm.createContext({ localStorage: { getItem: () => null } });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8') + ';this.DB = GRAMMAR_DB;', ctx);
const sentences = [...new Set(Object.values(ctx.DB).flatMap(l => l.questions.filter(q => q.type === 'listen').map(q => q.say)))];

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) { console.error('Add ELEVENLABS_API_KEY to .env first.'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) {}
  const wanted = new Set();
  let made = 0;
  for (const say of sentences) {
    const hash = narrationHash(say);
    wanted.add(hash);
    const file = `listen-${hash}.mp3`;
    if (manifest[hash] === file && fs.existsSync(path.join(OUT_DIR, file))) continue;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.id}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: say, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.6, similarity_boost: 0.8 } }),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
    fs.writeFileSync(path.join(OUT_DIR, file), Buffer.from(await res.arrayBuffer()));
    manifest[hash] = file;
    made++;
    console.log(`  ♪ "${say}"`);
  }
  for (const h of Object.keys(manifest)) if (!wanted.has(h)) delete manifest[h];
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Done: ${made} new clip(s), ${sentences.length} listening sentence(s) in total.`);
}
main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
