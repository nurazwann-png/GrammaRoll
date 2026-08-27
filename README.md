# Grammar Ball 🎮

**Educational 2D Rolling Ball Platformer** — CEFR English Grammar for Malaysian Primary School (Year 1–5)

## Play Now
Open `index.html` in any modern browser — no build step, no dependencies.

## About
A browser-based HTML5 Canvas game where students navigate a rolling ball through grammar challenges.

### Core Mechanics
- **Rolling ball physics** with gravity, jump, and momentum
- **Grammar platforms** — 3 floating platforms per question (1 correct, 2 wrong)
  - ✅ Land on correct answer → safe, +100 points
  - ❌ Land on wrong answer → platform crumbles, lose a heart
- **Enemy boxes** carrying answers
  - Orange enemy (wrong answer) → stomp/hit to destroy, +50 points
  - Blue enemy (correct answer) → avoid, damages player
- **3 Hearts** system with respawn at checkpoint
- **Selfie capture** — take a photo to become the ball!

### Content (CEFR Malaysia)
| Level | World | Topic |
|-------|-------|-------|
| 1-1 | Playground | `am / is / are` |
| 1-2 | Playground | `a / an / the` |
| 1-3 | Boss | Simple Present verbs |
| 2-1 | Safari | Present Continuous |

### Controls
| Input | Action |
|-------|--------|
| Arrow Left / A | Move left |
| Arrow Right / D | Move right |
| Space / W / ↑ | Jump |
| P / Escape | Pause |
| Touch buttons | Mobile controls |

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
