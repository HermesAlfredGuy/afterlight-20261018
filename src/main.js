// AFTERLIGHT — bootstrap + a small scripted API used by automated capture/verification.
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
};

window.AFTERLIGHT = { game, ui, api, COURSE };
document.documentElement.dataset.ready = '1';
