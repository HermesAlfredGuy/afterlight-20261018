# AFTERLIGHT

A small playable dusk-flight game: you fly a cream gull-wing courier through a floating
karst archipelago above an emerald sea, threading lit stone rings in order to reach the
Halo Beacon.

Everything is procedural Three.js — no textures, no external assets except the two
self-hosted Cormorant Garamond fonts. It runs as a plain static site (no build step).

## Play

- **Steer** `W`/`S` pitch, `A`/`D` roll (or arrow keys), `Q`/`E` rudder.
- **Space** airbrake, **Shift** spend the gust (squall).
- **P** pause, **R** restart, **C** calm/reduced-motion mode, **M** mute.
- On a phone: drag anywhere on the left half for the stick, `BRAKE` / `SQUALL` on the right.

Thread the lit ring, then the next one lights. Fourteen rings, then the beacon. Score
rewards speed, low passes, thermals and clean ring passage; terrain contact costs a little
speed but never kills the run.

## Run locally

```bash
python3 -m http.server 8099 --directory .
# open http://127.0.0.1:8099/index.html
```

## Layout

- `index.html`, `styles.css` — shell, HUD, screens, typography.
- `src/looks.js` — the three palettes (`vesper` is the shipped one, `ember`/`ink` alternates).
- `src/procgen.js` — procedural rock, islands, spires, arches, aqueduct, pavilion, gates, beacon, craft.
- `src/world.js` — course composition, sea + sky shaders, far archipelago, gate hierarchy.
- `src/game.js` — flight model (fixed 1/120 s substeps), collisions, camera, scoring, audio, states.
- `src/ui.js`, `src/main.js` — HUD/screens and boot + scripted test API.
- `tools/harness.mjs` — headless Playwright harness: `smoke`, `flight`, `shots`, `clip`.
- `DESIGN.md` — the brief, the references that were inspected, and the critique log.

## Licence

Code MIT. Cormorant Garamond (SIL Open Font License 1.1) is bundled under `vendor/fonts/`.
Three.js (MIT) is bundled under `vendor/three/`. No other third-party assets.
