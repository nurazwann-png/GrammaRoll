// Generates human-sounding MP3 narration for the story cutscenes.
// Usage: npm run narration            (only lines whose text changed)
//        npm run narration -- --force (regenerate everything)
// Needs ONE of these in .env:
//   ELEVENLABS_API_KEY=...
//   AZURE_SPEECH_KEY=...  and  AZURE_SPEECH_REGION=southeastasia
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'audio', 'story');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const FORCE = process.argv.includes('--force');

try {
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  });
} catch (e) { /* no .env */ }

// Load the scenes and text-cleaning helpers straight from the game's story file
const noop = () => {};
const ctx = vm.createContext({
  document: { addEventListener: noop, getElementById: () => null },
  window: { addEventListener: noop },
  navigator: {},
  setTimeout, clearTimeout, setInterval, clearInterval, console,
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'story.js'), 'utf8'), ctx);
const { INTRO_SCENES, ENDING_SCENES, WORLD_STORIES, BOSS_STORIES, csSpokenText, narrationId, narrationHash } =
  vm.runInContext('({ INTRO_SCENES, ENDING_SCENES, WORLD_STORIES, BOSS_STORIES, csSpokenText, narrationId, narrationHash })', ctx);

const lines = [
  ...INTRO_SCENES.map((s, i) => ({ s, id: narrationId('intro', i) })),
  ...ENDING_SCENES.map((s, i) => ({ s, id: narrationId('ending', i) })),
  ...Object.entries(WORLD_STORIES).flatMap(([w, scenes]) => scenes.map((s, i) => ({ s, id: narrationId(`world${w}`, i) }))),
  ...Object.entries(BOSS_STORIES).flatMap(([k, scenes]) => scenes.map((s, i) => ({ s, id: narrationId(`boss${k.split('-')[0]}`, i) }))),
].map(({ s, id }) => ({
  id,
  role: s.narrator || !s.speaker ? 'narrator' : s.speaker,
  text: csSpokenText(s.text),
}));

// ── Voice casting ─────────────────────────────────────────────────────────────
const AZURE_CAST = {
  'narrator':          { voice: 'en-GB-SoniaNeural',   style: null,       pitch: '0%',   rate: '-8%' },
  'Whisper the Fairy': { voice: 'en-GB-MaisieNeural',  style: null,       pitch: '+8%',  rate: '-5%' },
  'Baron Von Error':   { voice: 'en-US-DavisNeural',   style: 'angry',    pitch: '-12%', rate: '-10%' },
  'Grammo':            { voice: 'en-US-AnaNeural',     style: null,       pitch: '+0%',  rate: '+5%' },
  'Leo the Lion':      { voice: 'en-GB-RyanNeural',    style: null,       pitch: '-10%', rate: '-5%' },
  'Mayor Molly':       { voice: 'en-US-JennyNeural',   style: null,       pitch: '+0%',  rate: '+0%' },
  'Captain Nova':      { voice: 'en-US-AriaNeural',    style: null,       pitch: '+0%',  rate: '+0%' },
  'King Jumble':       { voice: 'en-GB-ThomasNeural',  style: null,       pitch: '-5%',  rate: '+0%' },
  'Rumble the Rhino':  { voice: 'en-US-GuyNeural',     style: null,       pitch: '-20%', rate: '-10%' },
  'Robo Rush':         { voice: 'en-US-EricNeural',    style: null,       pitch: '+10%', rate: '+10%' },
};
// ElevenLabs default voices, tried in order (IDs work without the voices_read permission)
const ELEVEN_CAST = {
  'narrator':          [['Lily', 'pFZP5JQG7iQjIQuC4Bku'], ['Alice', 'Xb7hH8MSUJpSbSDYk0k2'], ['George', 'JBFqnCBsd6RMkjVDRZzb']],
  'Whisper the Fairy': [['Dorothy', 'ThT5KcBeYPX3keUQqHPh'], ['Matilda', 'XrExE9yKIg1WjnnlVkGX'], ['Charlotte', 'XB0fDUnXU5powFXDhCwa']],
  'Baron Von Error':   [['Clyde', '2EiwWnXFnvU5JabPnv8n'], ['Callum', 'N2lVS1w4EtoT3dr4eOWO'], ['George', 'JBFqnCBsd6RMkjVDRZzb']],
  'Grammo':            [['Gigi', 'jBpfuIE2acCO8z3wKNLl'], ['Charlie', 'IKne3meq5aSn9XLyUdCD'], ['Lily', 'pFZP5JQG7iQjIQuC4Bku']],
  'Leo the Lion':      [['George', 'JBFqnCBsd6RMkjVDRZzb'], ['Callum', 'N2lVS1w4EtoT3dr4eOWO']],
  'Mayor Molly':       [['Alice', 'Xb7hH8MSUJpSbSDYk0k2']],
  'Captain Nova':      [['Charlotte', 'XB0fDUnXU5powFXDhCwa'], ['Alice', 'Xb7hH8MSUJpSbSDYk0k2']],
  'King Jumble':       [['Daniel', 'onwK4e9ZLuTAKqWW03F9'], ['Brian', 'nPczCjzI2devNBz1zQrb'], ['George', 'JBFqnCBsd6RMkjVDRZzb']],
  'Rumble the Rhino':  [['Bill', 'pqHfZKP75CvOlQylNhV4'], ['Brian', 'nPczCjzI2devNBz1zQrb'], ['Callum', 'N2lVS1w4EtoT3dr4eOWO']],
  'Robo Rush':         [['Liam', 'TX3LPaxmHKxFdv7VOQHJ'], ['Will', 'bIHbv24MWmeRgasZH58o'], ['Charlie', 'IKne3meq5aSn9XLyUdCD']],
};

const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function azureTts(line) {
  const key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
  if (!region) throw new Error('AZURE_SPEECH_REGION is missing in .env');
  const c = AZURE_CAST[line.role] || AZURE_CAST.narrator;
  let body = `<prosody pitch="${c.pitch}" rate="${c.rate}">${xml(line.text)}</prosody>`;
  if (c.style) body = `<mstts:express-as style="${c.style}">${body}</mstts:express-as>`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-GB"><voice name="${c.voice}">${body}</voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'grammar-ball-narration',
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure ${res.status}: ${await res.text()}`);
  return { audio: Buffer.from(await res.arrayBuffer()), voice: c.voice };
}

const unavailableVoices = new Set();
async function elevenTts(line) {
  const key = process.env.ELEVENLABS_API_KEY;
  const villain = line.role === 'Baron Von Error';
  let lastError = '';
  for (const [name, id] of ELEVEN_CAST[line.role] || ELEVEN_CAST.narrator) {
    if (unavailableVoices.has(id)) continue;
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: line.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: villain ? 0.3 : 0.45, similarity_boost: 0.8, style: villain ? 0.7 : 0.4, use_speaker_boost: true },
      }),
    });
    if (res.ok) return { audio: Buffer.from(await res.arrayBuffer()), voice: name };
    lastError = `ElevenLabs ${res.status}: ${await res.text()}`;
    // Missing/unavailable voice → try the next one; auth or quota problems stop immediately
    if (![400, 404, 422].includes(res.status) && !/voice/i.test(lastError)) throw new Error(lastError);
    unavailableVoices.add(id);
    console.log(`    (voice ${name} unavailable, trying next)`);
  }
  throw new Error(lastError || 'No ElevenLabs voice available');
}

async function main() {
  const provider = process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : process.env.AZURE_SPEECH_KEY ? 'azure' : null;
  if (!provider) {
    console.error('Add ELEVENLABS_API_KEY, or AZURE_SPEECH_KEY + AZURE_SPEECH_REGION, to .env first.');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) {}

  console.log(`Generating story narration with ${provider} (${lines.length} lines)…`);
  let made = 0;
  for (const line of lines) {
    const hash = narrationHash(line.text);
    const file = `${line.id}.mp3`;
    if (!FORCE && manifest[line.id]?.hash === hash && fs.existsSync(path.join(OUT_DIR, file))) {
      console.log(`  ✓ ${line.id} unchanged`);
      continue;
    }
    const { audio, voice } = provider === 'azure' ? await azureTts(line) : await elevenTts(line);
    fs.writeFileSync(path.join(OUT_DIR, file), audio);
    manifest[line.id] = { file, hash, voice, provider };
    made++;
    console.log(`  ♪ ${line.id} (${line.role} → ${voice}) ${Math.round(audio.length / 1024)} KB`);
  }
  const ids = new Set(lines.map(l => l.id));
  for (const id of Object.keys(manifest)) if (!ids.has(id)) delete manifest[id];
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Done: ${made} generated, saved to audio/story/.`);
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
