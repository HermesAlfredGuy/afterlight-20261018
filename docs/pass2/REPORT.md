# AFTERLIGHT — pass 2 report

Owner ask: major visual improvement, and fix the flying-plane animation.
Live: https://hermesalfredguy.github.io/afterlight-20261018/

The build is the same no-build ES-module site; the course, the flight model and the autopilot's
authority are untouched. Everything below is measured from the real build in headless Chromium
(software GL), not from a mock.

## What changed

### 1. The aircraft is animated, not posed (`src/game.js`, `src/procgen.js`)

- **Damped pitch** (critically damped follow of the gamma target + a nose-lead term) instead of
  `rotation.x = -gamma` written raw.
- **Turn coordination**: visual yaw = heading + a clamped sideslip term, so the craft points into
  the turn instead of sliding through it.
- **Hinged elevons** on both outer panels (4.7 span x 1.5 chord x 0.16 thick, pivoting on the
  trailing edge) with a dark hinge slot and a bright aft strip; authority 24 deg together for
  pitch, 18 deg differential for roll.
- **Rudder** (28 deg) on a cream fin, hinged, answering roll input and yaw rate.
- **Wing flex**: the outer panels bend about the wing-root line, up to **8.6 deg** at full load
  (was 3 deg, which read as rigid), plus a continuous **sail flutter** of roughly 0.6-3 deg
  amplitude (measured 4 deg peak-to-peak in a buffet) driven by airspeed, gusts and buffet. A cream
  shoulder fairing bridges the gull step so the bend reads as a joint, not a break.
- **Colour semantics**: movable surfaces are coral, fixed structure cream/keel — one glance tells
  you what the stick is moving.
- **Vapour ribbon**: 14 rows x 13 segments, vertex-animated, non-additive with a taper (width 0.92),
  trailing and curling from airspeed, roll rate, vertical velocity and the gust field. Measured
  lateral peak 6.83 m and vertical peak 1.36 m at the tip in a turn, with a curvature flip — it
  bends, it is not a plank.
- **Body language for the states**: stall buffet (1.2 deg high-frequency pitch/roll shake + ribbon
  turbulence), gust sway and drift from seeded noise on simulation time, squall kick + flare, and
  a thermal float.
- **Frame-rate independence**: all of the above runs inside the fixed 1/120 s substep; nothing reads
  `performance.now()`.

### 2. Readability of the moment (`src/world.js`, `src/ui.js`, `styles.css`)

- The guide line is now cool and faint (max 0.11 opacity) so it can never be mistaken for the warm
  vapour trail; the objective column fades out long before the ring.
- The aqueduct pier was moved off the craft-to-ring line, so the craft is no longer lost behind it
  at the arch gate.
- HUD centre reticle and distance readout raised in contrast on a backing plate; nothing competes
  with the active ring.
- Menu/title is now a composed frame (scrim, live hero pass, type hierarchy) instead of the scene
  with a blur over it.

### 3. Depth and light (`src/atmosphere.js`, new; `src/world.js`)

- Aerial perspective as a function of depth band: saturation and contrast fall off and the grade
  shifts cool with distance, with fog masking the LOD transitions.
- A/B at the same low-res pose: `docs/pass2/aerial-plain-low.png` vs `aerial-graded-low.png`.

## Evidence

- `npm run verify`: **24 pass, 0 fail, 3 measured-limitation notes** (after the deploy parity check;
  before the push the five "deployed matches the working tree" checks fail by design).
  The notes are honest limitations, not regressions: 4/480 frames pass within 3 m of solid geometry
  under the aqueduct, the demo autopilot peaks at 1.08 rad bank (capping it stops it holding the
  ring approaches), and 69/72 sampled turning frames keep the craft centred (the long thin wings
  push bounding-box corners off frame in a hard bank).
- 12 captures, `docs/pass2/1440x900/` and `docs/pass2/390x844/`: menu, bank, stall, squall, arch,
  vista — all deterministic poses through `window.AFTERLIGHT.api`.
- `docs/pass2/afterlight-pass2-1080p.mp4`: 12.3 s, 370 frames, 1920x1080 H.264 — a glide down to a
  low pass, a squall burst while the stick is live (speed 58 -> 77 m/s with the ribbon flare), the
  airbrake to a stall with the buffet up, a pitch-up recovery, then the autopilot's turn with the
  wing at full bend. Two staging facts are measured, not assumed: a squall key only reaches the
  craft while the autopilot is off (manual flare 0.96 and +19 m/s; autopilot flare 0.00), and the
  earlier cut's stall beat washed out at 7 m over sunlit water, so this one holds a 28 m floor.
- Rim separation at the lighthouse, A/B with the rim term on/off: craft luminance 91.9 against 0
  for the black rock; 3,624 pixels changed, 1,666 of them by more than 10 levels, peak delta 170.

## Known limitations

- The control surfaces are legible at close range and in the menu, not at chase distance; at ~40 m
  the readable animation language is the wing bend, the flutter, the bank coordination and the
  vapour ribbon. Surfaces do not scale below a few pixels, whatever their deflection.
- Close-up model seams remain (root fairing joints, tip-plate butt joints). They are low-poly
  artefacts, not errors.
- Software GL on a 2-core host: per-frame cost and frame rate are not representative of a real GPU.
  No physical-device test was run.

## Review round 2 (art-director pass on the delivered stills)

Two signalled defects were checked against the build rather than accepted on the reviewer's word:

1. *"the craft's burgundy root merges with the burgundy reef"* — the base colours were measured in
   Lab: keel `#271d1d` against the nearest reef band `#5a2a33` is dE 21.9 (L* 14 vs 24), and against
   the terrain side dE 58.7. The merge is therefore not a base-colour problem; the keel was still
   cooled 30% toward `#26303f` (dE 23.3, and a hue break rather than only a value break) and its rim
   term raised 0.62 -> 0.72. A second, contradictory review of the same frame shows this signal is
   noisy: treat the measurement, not the impression.
2. *"the route line still reads as a glowing tether"* — accepted. It was an additive
   `LineBasicMaterial` at 0.11; it is now a normal-blend `LineDashedMaterial` (dash 16 / gap 14) at
   0.09 with `computeLineDistances()` each frame. Dashes cannot read as a filament.

The trail head was also re-measured instead of moved on assumption: the airframe spans z
-5.7..+9.4 m in the craft frame and the ribbon head sits at +9.0 m, i.e. flush inside the tail, so
the "detached shard" is the flat strip seen edge-on at chase height, not a positional gap. That
remains a cosmetic artefact and is listed as such.

Ad-hoc probe for these changes (scratch script, not a suite) — 9/9:
- keel material renders `#060609`, r-b **-3** (cool/neutral dark); before the cooling the same slot was
  warm brown. The dark cluster is `#060609` (keel) and `#020101` (hinge slot).
- ribbon head (`row 0`, transformed through the real matrix chain) lands at craft-local
  (-0.47, 0.19, 4.09), i.e. **inside** the airframe box (x -9.88..9.88, y -0.85..3.07, z -5.7..9.4,
  38 meshes): welded, distance 0.00 m, in the aft half.
- guide: `LineDashedMaterial`, dash 16 / gap 14, opacity 0.055, `lineDistance` attribute present,
  additive off.
