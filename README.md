# Grammar Ball 🎮

**Educational 2D Rolling Ball Platformer** — CEFR English Grammar for Malaysian Primary School (Year 1–5)

## Run it
```bash
npm install
npm run setup      # creates .env from .env.example — set TEACHER_PIN
npm start          # http://localhost:3000
```
The Node server is needed for Versus/Co-op, Teacher Mode, homework and class leaderboards.
Without `DATABASE_URL`, classes and results are saved to `data/store.json`.
To use PostgreSQL locally: `npm run db:up` (Docker), then uncomment `DATABASE_URL` in `.env`.
In production (`NODE_ENV=production`, as in the Dockerfile) Teacher Mode stays disabled until `TEACHER_PIN` is set.

### Story narration
The story is read aloud by the browser's voice (Edge's "Natural" voices sound best). For human-sounding
character voices, add an `ELEVENLABS_API_KEY` or `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION` to `.env`, then run
`npm run narration`. It writes MP3s to `audio/story/`; the game plays them and falls back to the browser voice
for any line whose text has changed since (re-run the command after editing the story).
`npm run sfx` generates the story's sound effects and two music loops (ElevenLabs); edit the prompts in
`scripts/generate-sfx.js` and re-run to change a sound. Scene effects, camera moves and sounds are set per scene
in `js/story.js` (`fx`, `camera`, `music`, `sfx`).

## Project layout
| Path | What it holds |
|------|---------------|
| `index.html` | Page markup only |
| `css/style.css` | All styles |
| `js/data.js` | Levels and grammar questions (`GRAMMAR_DB`) — add questions here |
| `js/engine.js` | Audio, physics, platforms, enemies, boss, level builder, update loop |
| `js/questions.js` | Question pop-up, wrong-answer explanations, HUD |
| `js/render.js` | Canvas drawing and the fixed-step game loop |
| `js/progress.js` | Leaderboards, review, practice, skins, daily & speed challenges |
| `js/teacher.js` | Teacher Mode and achievements |
| `js/story.js` | Cutscenes |
| `js/ui.js` | Menus, level picker, settings, speech, input, classes |
| `js/multiplayer.js` | Versus and Co-op |
| `js/main.js` | Start-up (loads last) |
| `server.js`, `store.js` | Game server, teacher/class API, storage |

## About
A browser-based HTML5 Canvas game where students navigate a rolling ball through grammar challenges.

### Core Mechanics
- **Rolling ball physics** with gravity, jump, and momentum
- **Jump on the answer** — walk under one of 3 floating answers and jump up through it to land on top
  (the one above you glows). A wrong landing breaks that platform and you can try again.
  Settings → "How to answer" switches to a tap-a-button pop-up instead; co-op and sentence-order questions always use the pop-up.
- **Grammar platforms** — 3 floating platforms per question (1 correct, 2 wrong)
  - ✅ Land on correct answer → safe, +100 points
  - ❌ Land on wrong answer → platform crumbles, lose a heart
- **Enemy boxes** carrying answers
  - Orange enemy (wrong answer) → stomp/hit to destroy, +50 points
  - Blue enemy (correct answer) → avoid, damages player
- **Hearts** (3, or 5 on Easy) with respawn at checkpoint
- **Letters** to collect in each level that spell a bonus word
- **Selfie capture** — take a photo to become the ball!

### Content (CEFR Malaysia)
| Level | World | Topic |
|-------|-------|-------|
| 1-1 | Playground | `am / is / are` |
| 1-2 | Playground | `a / an / the` |
| 1-3 | Boss | Simple Present verbs |
| 2-1 | Safari | Present Continuous |
| 2-2 | Safari | Prepositions in / on / at |
| 2-3 | Boss | Plurals & have / has |
| 3-1 | City | Past Simple (-ed) |
| 3-2 | City | was / were & irregular verbs |
| 3-3 | Boss | Question words & Do / Does / Did |

Levels unlock in order; homework levels set by the teacher are always open.
Each level has a bank of about 20 questions; every play draws 6 — the teacher's own questions first, then up to
2 the pupil has missed before, then random ones (at most one sentence-order question).

### Learning features
- Every wrong answer shows why, with a 🔊 Listen button (browser text-to-speech)
- Missed questions come back first next time, and **Practise Mistakes** replays them
- Review screen after each level with explanations and a "Practise these again" button

### Players, worlds and question types
- **Who's playing?** Several pupils can share one device; each has their own stars, badges, streaks and missed questions.
  Pupils who join a class have their progress synced to the server, so it follows them to any device.
- **4 worlds / 12 levels:** Playground, Safari, City and Space (Year 4–5: future tense, comparatives, conjunctions & modal verbs).
- **Question types:** fill the blank, sentence order, spot the mistake, listening (ElevenLabs clips, `npm run listening`)
  and picture match. Pop-up types open when you land on their platform.
- **Boss fights:** bounce on the right answer bubble to fire at the boss and dodge the blobs it drops.
- **Background music** per world (`npm run sfx`), switchable in ⚙️ Settings, plus an easy-to-read font option.

### Teacher Mode
Log in with `TEACHER_PIN` (checked on the server, 5 wrong tries locks it for 10 minutes). Create a class,
share the 6-letter code (pupils enter it in ⚙️ Settings), set homework levels, share custom questions,
and view each pupil's accuracy, homework progress and most-missed questions (CSV export included).
The dashboard also shows a topic-mastery chart and has a printable report. "Unlock all levels on this device"
is handy for demonstrations.

### Controls
| Input | Action |
|-------|--------|
| Arrow Left / A | Move left |
| Arrow Right / D | Move right |
| Space / W / ↑ | Jump |
| 1 / 2 / 3 (or A / B / C) | Pick an answer in the question pop-up |
| R | Read the question aloud |
| P | Pause |
| Escape | Close the open pop-up, or pause |
| Touch buttons | Mobile controls |

⚙️ Settings: difficulty (Easy 5 hearts / 20 s, Normal, Hard 7 s with enemies everywhere), read questions aloud
automatically, reduce motion, and join a class.

## Tech Stack
- Pure HTML5 Canvas (no libraries)
- Web Audio API (procedural sound effects)
- getUserMedia API (selfie capture)
- CSS custom properties + Google Fonts

## Unity Port
This browser prototype maps directly to the Unity GDD:
- `PlayerMovement.cs` → ball physics + rolling
- `GrammarManager.cs` → JSON question loader
- `PlatformGrammar.cs` → answer platform logic
- `EnemyBox.cs` → patrol + collision logic
- `PlayerHealth.cs` → 3 hearts + checkpoint respawn
- `SelfieCapture.cs` → WebCamTexture circle mask

## Developer
Nurazwann Ismail — IEG Campus
