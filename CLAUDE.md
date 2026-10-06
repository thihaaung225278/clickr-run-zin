# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Clickr-branded Three.js endless runner (Temple Run style). Vanilla JS (ES modules), Vite 4, `three` ^0.170. No framework, no TypeScript, no tests, no linter.

## Commands

```bash
npm install
npm run dev       # Vite dev server, usually http://localhost:5173
npm run build     # outputs dist/
npm run preview   # serve dist/
```

No test or lint scripts exist. Verify changes by running the game in the browser.

## Architecture

`src/main.js` creates one `Game` on `#game-canvas`. Everything else lives in `src/game/`.

- **`Game.js` is the orchestrator.** Owns renderer, scene, camera, lights, the RAF loop, and the mode state machine: `menu | playing | paused | dead`. It wires every other module together; modules do not talk to each other directly.
- **World moves the player, not the track.** Each frame `Game` decreases `player.root.position.z` (running toward −Z). `Track`, `ObstacleManager`, `Starfield`, lights and `ChaseCamera` all follow the player's z. `Track` recycles a fixed ring of 10 segments × 20 units; `ObstacleManager` spawns patterns ~90 units ahead and disposes items 12 units behind.
- **Speed/difficulty curve** is in `Game._loop`: `speed = min(MAX_SPEED, BASE_SPEED + distance * 0.012)`. Obstacle spacing tightens with distance in `ObstacleManager.update`.
- **Collision** uses `THREE.Box3`. `Player.getHitbox()` returns the player box. `ObstacleManager._hitsObstacle` decides clearance by hitbox height: `barrier` cleared by jump (min.y ≥ 0.85), `beam` cleared by slide (max.y ≤ 1.15), `pillar` always hits, `coin` collects. Changing jump height or slide pose in `Player`/`Humanoid` affects these thresholds.
- **Input** (`Input.js`) queues actions (`left | right | jump | slide`, max 3) from keyboard and touch swipes; `Game` drains the queue each frame. System keys (Space to start/restart, CapsLock pause, `-`/`=` music volume, `[`/`]` SFX volume) are handled separately in `Game._onSystemKey`.
- **Player vs Humanoid.** `Player` owns lane/jump/slide state and timing. `Humanoid` owns the visual: loads `/models/Soldier.glb` (Mixamo Idle/Walk/Run clips only). Jump and slide are faked by tilting/offsetting a `pivot` group. If the GLB fails, it builds a procedural mesh. `player.ready` (a promise) gates the start screen.
- **Audio** (`Audio.js`): Web Audio context created on first user gesture via `unlock()`. BGM plays `public/audio/My Way - NEFFEX.mp3`; falls back to a synth loop if missing. All SFX (jump, slide, coin, hit) are synthesized, no sample files.
- **UI** (`UI.js`) is plain DOM. It binds to element ids in `index.html` (`overlay`, `hud`, `start-btn`, `volume-slider`, etc.). Rename an id in one place and you must rename it in the other.

## Conventions

- Brand colors and lane geometry live in `src/game/constants.js` (`CLICKR`, `COLORS`, `LANE_X`). Reuse them instead of hard-coding hex values.
- Static assets in `public/` are served from root (`/models/...`, `/audio/...`, `/textures/...`).
- `.cursorrules` is gitignored and kept local only.
