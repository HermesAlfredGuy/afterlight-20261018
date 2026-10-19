// AFTERLIGHT — bootstrap + a small scripted API used by automated capture/verification.
import * as THREE from 'three';
import { Game } from './game.js';
import { UI } from './ui.js';
import { COURSE } from './world.js';

const errors = [];
window.__AL_ERRORS = errors;
function fatal(msg) {
  errors.push(String(msg));
  const box = document.getElementById('fatal');
  const pre = document.getElementById('fatal-msg');
  if (box && pre) { pre.textContent = errors.join('\n\n'); box.hidden = false; }
}
window.addEventListener('error', (e) => fatal(e.message + (e.filename ? ` @ ${e.filename}:${e.lineno}` : '')));
window.addEventListener('unhandledrejection', (e) => fatal('promise: ' + (e.reason?.message || e.reason)));

const ui = new UI();
const game = new Game(document.getElementById('view'), ui);
ui.isTouch = game.touch;
game.ui.game = game;
ui.showScreen('menu');
game.startLoop();
ui.setLookButtons(game.lookId);
ui.setQualityButtons(game.qualityPref);

// The craft's live state, for tests, capture and the scoreboard readout.
game.beaconPos = game.beaconPos.bind(game);

function teleport(x, y, z, heading, speed) {
  game.craft.pos.set(x, y, z);
  if (heading !== undefined) game.craft.heading = heading;
  if (speed !== undefined) game.craft.speed = speed;
  game.prevGateSide = null;
}

const api = {
  start: (mode) => game.startRun(mode || game.mode),
  pause: () => game.pause(),
  resume: () => game.resume(),
  restart: () => game.restart(),
  menu: () => game.toMenu(),
  setLook: (id) => game.setLook(id),
  setQuality: (q) => game.setQuality(q),
  setSound: (on) => game.setSound(on),
  setCalm: (on) => { game.calmOverride = !!on; ui.setCalm(game.calm); },
  setManual: (on) => { game.manual = !!on; game.lastT = 0; },
  frame: (dt) => game.frame(dt || 1 / 30),
  craftBox: () => game.craftBox(),
  whatsInFront: (g) => game.whatsInFront(g),
  camDiag: () => game.camDiag(),
  sim: (dt = 1 / 30, n = 1) => { for (let i = 0; i < n; i++) game.step(dt); },
  setAuto: (on) => { game.auto = !!on; },
  key: (name, down) => { game.keys[name] = !!down; },
  touch: (x, y) => { ui.touchAxis = { x, y }; },
  brake: (on) => { ui.touchBrake = !!on; },
  squall: (on) => { ui.touchSquall = !!on; },
  status: () => ({
    state: game.state, mode: game.mode, look: game.lookId,
    score: Math.round(game.score), gatesPassed: game.gatesPassed,
    gateIndex: game.gateIndex, totalGates: game.world.gates.length,
    time: +game.time.toFixed(2), speed: +game.craft.speed.toFixed(1),
    alt: +game.craft.pos.y.toFixed(1), x: +game.craft.pos.x.toFixed(1), z: +game.craft.pos.z.toFixed(1),
    heading: +game.craft.heading.toFixed(3), bank: +game.craft.bank.toFixed(3),
    gamma: +game.craft.gamma.toFixed(3), squall: +game.craft.squall.toFixed(2),
    clips: game.stats.clips, skims: game.stats.skims, finished: game.finished,
    fps: +game.stats.fps.toFixed(1), events: game.events.length,
    nextGate: game.world.nextGate ? game.world.nextGate.index : null,
  }),
  events: () => game.events.slice(),
  teleport,
  seek: (index, alt = 60, speed = 56) => {
    const g = COURSE.gates[Math.max(0, index - 1)];
    const t = COURSE.gates[index] || g;
    const dx = t.x - g.x, dz = t.z - g.z;
    const len = Math.hypot(dx, dz) || 1;
    const back = 190;
    teleport(t.x - (dx / len) * back, t.y + alt, t.z - (dz / len) * back, Math.atan2(dx, dz), speed);
    game.gateIndex = index;
    game.world.nextGate = game.world.gates[index] || null;
    game.prevGateSide = null;
    return game.world.gates[index] || null;
  },
  beacon: () => ({ ...COURSE.beacon }),
  gates: () => COURSE.gates.map((g, i) => ({ i, ...g })),
  errors: () => errors.slice(),
  webgl: () => {
    const gl = game.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : 'unknown',
      version: gl.getParameter(gl.VERSION),
      drawCalls: game.renderer.info.render.calls,
      triangles: game.renderer.info.render.triangles,
      programs: game.renderer.info.programs?.length || 0,
    };
  },
  perf: (frames = 60, dt = 1 / 30) => {
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) game.frame(dt);
    const ms = (performance.now() - t0) / frames;
    return { msPerFrame: +ms.toFixed(2), fps: +(1000 / ms).toFixed(1) };
  },

  /* ---- pass-2 probes: animation state, occlusion, gate framing ------------------ */
  /** The whole animation state in one object (frame-rate independence proof reads this). */
  pose: () => game.craft.poseSnapshot(),
  /** Deformable-ribbon proof: every vertex of the trail strip, in craft-local space. */
  ribbon: () => {
    const g = game.craft.rig.ribbon.geo;
    return Array.from(g.attributes.position.array).map((v) => +v.toFixed(4));
  },
  /** Is the craft's own silhouette drawn over by world geometry? */
  craftOcclusion: () => game.craftOcclusion(),
  /** Where is the next ring on screen, how far, and what is in front of it? */
  gateView: () => game.gateView(),
  /** Menu state, deterministic: re-seat the hero pass and return its numbers. */
  resetMenu: () => { game.state = 'menu'; game._seatMenuFlight(); return { menuT: game.menuT }; },
  menuT: () => game.menuT,
  /** Re-seat the title hero pass at an arbitrary point (used to compose the frame precisely). */
  menuSeat: (x, y, z, heading) => game.seatMenuAt(x, y, z, heading),
  /** What changed in the aerial grading: the band table the shaders are using. */
  aerial: () => game.aerialInfo(),
  /** NDC of a world point in the current camera — used to compose the title frame precisely. */
  ndcOf: (p) => {
    game.camera.updateMatrixWorld(true);
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(game.camera);
    return [+v.x.toFixed(3), +v.y.toFixed(3), +(v.z < 1 ? 1 : 0)];
  },
  /** Where the sun sits in the current frame (the sun sprite rides world.sunDir). */
  sunNdc: () => {
    const c = game.camera;
    const p = game.craft.pos.clone().addScaledVector(game.world.sunDir, 9000);
    return window.AFTERLIGHT.api.ndcOf([p.x, p.y, p.z]);
  },
  /** Evidence: switch the aerial grading off/on at runtime (A/B on real pixels). */
  setAerial: (on) => game.setAerialAB(on),
  /** Sample the rendered frame (the 3D pixels only, no DOM) over normalised rectangles.
   *  Reads straight off the WebGL drawing buffer in the same task as the render, because
   *  drawImage() from a presented canvas can hand back a stale composited frame. */
  sample: (rects) => {
    const gl = game.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = {};
    for (const [name, r] of Object.entries(rects)) {
      const x0 = Math.round(r[0] * W), yTop = Math.round(r[1] * H);
      const w = Math.max(1, Math.round(r[2] * W)), h = Math.max(1, Math.round(r[3] * H));
      const y0 = Math.max(0, H - (yTop + h));         // GL origin is bottom-left
      let R = 0, G = 0, B = 0, n = 0;
      for (let y = y0; y < Math.min(H, y0 + h); y++) {
        for (let x = x0; x < Math.min(W, x0 + w); x++) {
          const i = (y * W + x) * 4;
          R += px[i]; G += px[i + 1]; B += px[i + 2]; n++;
        }
      }
      R /= n; G /= n; B /= n;
      const mx = Math.max(R, G, B) / 255, mn = Math.min(R, G, B) / 255;
      out[name] = {
        rgb: [+R.toFixed(1), +G.toFixed(1), +B.toFixed(1)],
        hex: '#' + [R, G, B].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''),
        lum: +(0.2126 * R + 0.7152 * G + 0.0722 * B).toFixed(1),
        sat: +(mx > 0 ? ((mx - mn) / mx) * 100 : 0).toFixed(1),
      };
    }
    return out;
  },
};

window.AFTERLIGHT = { game, ui, api, COURSE };
document.documentElement.dataset.ready = '1';
