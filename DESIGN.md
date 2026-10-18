# AFTERLIGHT — design record

Owner-authorized creative build, 2026-10-18. Project root `/opt/data/projects/afterlight-20261018`.
Sole destination for delivery: telegram topic `-1003852072951:15190` via
`/opt/data/scripts/creative-lab-send.py`.

## Brief (condensed, non-negotiable)
Playable 3D glider/courier game. Small distinctive craft. Beautiful floating archipelago
above an emerald sea at dusk. Immediate flight feel + vista. Sculptural islands,
architectural landmarks, atmospheric depth, warm sunlight/coral sails, soft shadows,
elegant cream typography, satisfying gate passage. Coherent start/flight/end/restart,
authored course, keyboard + touch, unambiguous objectives, scoring, replayability,
framerate-independent steering, readable obstacles, comfortable camera, deliberate pacing,
feedback, no impossible collision traps. Full-viewport desktop+mobile; adapt cost without
killing animation; pause + reduced-motion handled as playable options. Sound user-controlled.
No Neo black/orange clone, no generic purple SaaS, no blank grid, no lone neon sphere.

## Reference research (actual pages/images inspected, 2026-10-18)

Game references — inspected the real screenshot pixels, not just store copy:

1. **Superflight** (store.steampowered.com/app/732430) — screenshot
   `ss_39df924f147673353e3568d98355bfb243b6460a.1920x1080.jpg`.
   Lessons kept: palette as a *ladder* (pick haze colour, derive each depth band by lowering
   saturation/contrast and rotating hue toward the haze); shadows pushed to a saturated cool
   hue instead of grey; distance = silhouette only, no interior detail; one shape family per
   landform type so scale reads instantly; a big near-foreground mass cropping a corner for
   speed; brightest/emptiest region placed in the direction of travel ("fly into the light").
2. **Sky: Children of the Light** (app 2325290) — screenshot `ss_277dc717...1920x1080.jpg`.
   Lessons kept: emissive accents on a dark volume read as "lit" only when some diffuse/
   specular response also exists; *weaknesses seen and avoided*: nothing was grounded (no cast
   shadow/occlusion), flat untextured sky gradient with banding risk, three competing bright
   focal zones, emissive-only characters reading as flat cutouts, a blown-out light source that
   looked like a rendering bug.
3. **Sable** (app 757310) — screenshot `ss_f7cf5d40...1920x1080.jpg`.
   Lessons kept: restricted desaturated palette + one saturated focal object; detail budget
   concentrated at focal points, background reduced to large shapes; ink outline/contour
   language works on hero architecture but is wasted on distant terrain.
4. **A Short Hike** (app 1055540) — screenshot `ss_c9c8a8e6...1920x1080.jpg`.
   Lessons kept: deliberate tinted "not-white" materials; warm accents (path/roof) giving
   shelter against cool fields; hand-placed vignette composition; UI type treated as part of
   the scene's palette (cream bubble on cool snow).

Real-photo references — inspected actual photographs:

5. **Ha Long Bay at sunset** (Wikimedia Commons,
   `Ha_Long_Bay,_Vietnam,_Sunset_in_Ha_Long_Bay.jpg`). Lessons kept: backlit value structure
   (dark foreground silhouette / midtone reflective water / high-key sky); large soft *diffuse*
   sun rather than a hard disc; broken vertical specular glitter path on the water; aerial
   perspective as a unifying atmospheric layer (haze is not distance blur); karst silhouette
   family = rounded lumpy top, steep flanks, overlapping layering.
6. **Aerial archipelago** (Commons, `Aerial_view_of_Bucana...010659.jpg`). Lessons kept:
   island *hierarchy* (one hero landmass 3–5x the others, 2–4 satellites, small stepping
   stones) instead of uniform scatter; deep water as negative space between landmasses; water
   colour bands as affordances (bright shallow shelf = safe, dark = risk); foam only at edges
   and hazards so edges are readable from altitude; alternation of coves and cliffs for rhythm.

## Three competing treatments (built as runtime looks, compared on rendered frames)

- **A. EMBER TIDE** — Superflight-derived ladder: peach/champagne haze, terracotta-lit tops,
  saturated violet shadow sides, flat shading, one hot coral accent on the craft, blown-out
  horizon in the direction of travel. Risk: reads "hot" and slightly arid; conflicts with the
  emerald-sea part of the brief.
- **B. EMERALD VESPER** — Ha Long Bay-derived: deep emerald-to-indigo sea with a broken copper
  glitter path, warm cream horizon band fading to cool slate above, soft diffuse sun, layered
  haze, terracotta cliff strata with sage crowns, coral sails as the warm moving accents, cream
  Cormorant typography. Risk: can drift muddy if the shadow hue is not pushed cool enough.
- **C. INK MERIDIAN** — Sable-derived flat cel with contour lines on all silhouettes. Risk:
  exactly the failure Sable avoids — contouring the distant terrain turns the vista into noise
  and kills the sense of depth and haze.

**Chosen: B**, with A's value-ladder discipline (hue/contrast ladder per depth band) and C's
ink contour *reserved for hero landmark architecture only*. A and C ship as selectable looks,
so the comparison stays honest and playable instead of being prose.

## The craft, course and rules (authored, not procedurally random)

- Craft: "Skimmer" — cream canvas gull-wing glider, coral sail panels, dark lacquered keel and
  a small tail fin; readable silhouette from behind and from the side.
- Hero island: tall sculptural mesa with a wind-cut arch, a stepped stone town on terraces, a
  lighthouse with a rotating beam. Satellites: a twin-spire islet with a rope bridge, a low
  reef atoll, a floating slab with a temple pavilion, and coral sail-ships drifting between.
- Course: 14 numbered gate rings, in order, over water, between the twin spires, through the
  sea arch, around the lighthouse, and a final gate onto the Halo Beacon platform. ~2.6 km,
  ~55–75 s per clean run.
- Flight: gamma-based arcade glider — pitch sets flight-path angle, speed trades against
  altitude (dive to gain speed, zoom to trade it back), bank turns, stall forces the nose down
  and is always recoverable by diving. Ridge lift near terrain, thermal columns with visible
  rising motes, sea skim that never traps you, soft clips that cost speed and chain multiplier
  rather than killing the run.
- Scoring: gate 120 × chain multiplier (up to ×5), crest bonus for threading low, thermal
  bonus, finish-time bonus against par, medal thresholds. Best score/time per look in
  localStorage.

## Delivery
Static ES-module site (vendored three.js r186 + Cormorant Garamond OFL, no build step),
GitHub Pages under `HermesAlfredGuy/afterlight-20261018`, ZIP + screenshots + gameplay MP4 to
the lab topic.

## Revision log — what the critique actually changed

Every entry is a criticism of a *rendered* frame (headless Chromium at 1440×900, real capture),
not of the source. Each was followed by a change and a re-inspection.

1. *"The sea is a flat woven grid / corduroy."* → replaced mesh displacement with an analytic
   `microNormal` in the fragment shader, damped by distance.
2. *"The water is wet coal."* → root cause: a hand-written `ShaderMaterial` does not get
   three's output sRGB encode. Added a local `encode()` to both the sea and sky shaders.
3. *"The whole frame is a washed-out haze."* → bloom 0.62→0.32, exposure 1.06→0.92, sun disc
   softened, `.leak` alpha halved, fog/haze density ×0.34.
4. *"Which ring am I supposed to fly through? They all glow."* → gate hierarchy: the next ring
   is lit cream, passed rings fade to slate, future rings stay quiet; chevrons only stream on
   the active ring.
5. *"The beacon is not a landmark, it is a pole."* → rebuilt with a tapered needle, a central
   spire, a stone platform, an emissive halo and a counter-rotating outer ring; platform
   radius 40.
6. *"The craft is a red arrow, not an aircraft."* → rim-lit leading *and* trailing wing edges,
   thicker wings, a cream wingtip fin, larger sail panels, coral trail narrowed to 0.8.
7. *"The aqueduct is a black mass that crushes the frame."* → span 340→300, deck 30→17 deep,
   piers slimmer, dusk emissive fill on the stone, hemi light 0.72→0.86.
8. *"The gate is swallowed by the dark arch."* → veil opacity up, band tube 0.34→0.5,
   active-ring emissive 0.45→0.6; verified the lit ring is now the most salient object.
9. *"The craft is tiny / the camera is too far."* → measured, not guessed: `craftBox()` reports
   the craft's world span against the camera distance and FOV, so framing is a number
   (~50 % of frame width at cruise) rather than an impression.
10. *"The phone HUD is cluttered, the SQUALL label is duplicated, the buttons are too high."*
    → gauge label hidden on touch (`body.is-touch`), touch buttons moved to the lower-right
    thumb zone and slimmed, and a real `hasTouch` context now verifies the stick steers.

