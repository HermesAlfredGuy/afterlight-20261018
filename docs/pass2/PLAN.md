# AFTERLIGHT — pass 2 plan (persistent working memory)

Sources of truth:
- `/opt/data/director-studio/briefs-20261019/afterlight.md` (visual brief)
- `/opt/data/director-studio/briefs-20261019/afterlight-animation-spec.md` (animation spec, non-negotiable)

Goal: the craft must *read as a flying machine* (spec items 1-6), then the visual
items (A-E), with real captures, a 1080p MP4, verify green, pushed to master.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 0 | Recon (files read, three r186 internals, baseline verify + shots) | done |
| 1 | Craft rig: hinged elevons + rudder + flex pivots + segmented ribbon (procgen) | done |
| 2 | Animation state machine inside the fixed 1/120 substep (game.js) | done |
| 3 | Frame-rate independence + printed proof (tools/animprobe.mjs) | done |
| 4 | Aerial perspective per depth band (fog patch + sea shader) | done |
| 5 | Gate readability at the arch (pier moved off the ring axis) + probe | done |
| 6 | HUD: centre reticle + distance contrast | done |
| 7 | Menu/title: composed vista, no full-frame blur | done |
| 8 | Captures: 6 poses x (1440x900, 390x844) + 1080p MP4 | done (re-run after the last camera edit) |
| 9 | verify green, README/DESIGN notes, commit, push, confirm Pages bytes | in progress |

## Invariants (must not regress)

- 14-ring course, autopilot flight authority (a bank-ANGLE controller was rejected — see
  the comment in `src/game.js` around `autopilot()`), three looks (vesper/ember/ink),
  pause/restart, keyboard + touch steering. `npm run verify` asserts all of these.
- Craft stays the highest-local-contrast object in frame.
- No animation may read `performance.now()` / wall clock: only simulation time.

## Measured numbers (see REPORT.md for the full table)

- `npm run verify`: 14/14 rings in 139.8 s, score 3256, all behaviour assertions pass;
  the 5 "deployed matches the working tree" checks fail until the push lands.
- craft framing at cruise: avg half-width 0.61 NDC (verify); 0.57-0.72 span at the capture poses.
- aerial band grading A/B, low-over-water pose: 35.7% of pixels move >12/255 (mean 3.98,
  max 164) when the grading is switched off; plain pass-1 fog left the far land unhazed.
- mobile (390x844) craft span: 4.02 NDC before the aspect-aware chase distance, 1.20 after.
- arch: pier clearance 37.5 m each side of gate 5; craftOcclusion() = 0 occluded samples.

## Two traps worth remembering

1. **three hands `onBeforeCompile` an UNRESOLVED shader.** `#include <fog_pars_fragment>`
   is still literal text, so `replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor,
   fogFactor );', …)` silently matches nothing and the whole patch becomes a no-op. Expand
   the include instead (or replace the include line with the chunk body).
2. **`canvas.drawImage()` / `readPixels()` right after a program recompile is not a
   measurement.** The readback came back as a stale/partial frame and reported a 96%
   frame change where two real PNGs diff to a YAVG of 0.93/255. Compare *screenshots*
   with ffmpeg (`blend=all_mode=difference,signalstats`) instead.

## Errors encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| aerial grading had no visible effect | 1 | root cause: unresolved includes (see trap 1) — expand `<fog_fragment>` |
| A/B probe "proved" a 96% frame change | 1 | readback artefact (trap 2) — switched the metric to ffmpeg on PNGs |
| craft cropped to the middle 200% on portrait | 1 | aspect-aware chase distance in the flight + menu cameras |
