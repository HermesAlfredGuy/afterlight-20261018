// AFTERLIGHT — game core: renderer, arcade glider, camera, input, scoring, audio.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { World, COURSE } from './world.js';
import { makeCraft } from './procgen.js';
import { getLook, LOOK_ORDER } from './looks.js';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const HK = 'afterlight.v1';

/* --------------------------------------------------------------- flight */
export const FLIGHT = {
  pitchRate: 1.22,      // rad/s of flight-path-angle change at full input
  maxClimb: 0.40,
  maxDive: -0.92,
  rollRate: 2.35,
  rollReturn: 1.35,
  maxBank: 1.08,
  turnGain: 1.72,
  sinkBase: 1.9,        // m/s of settling in level flight
  dragK: 0.000225,
  vMin: 24, vStall: 32, vMax: 128,
  brakeDrag: 11.0,
  brakeLift: 0.55,
  squallAccel: 26,
  ridgeLift: 4.2,
  thermalLift: 8.5,
};

class Skimmer {
  constructor(look) {
    const c = makeCraft(look);
    this.visual = new THREE.Group();       // yaw/pitch frame
    this.visual.rotation.order = 'YXZ';
    this.model = c.group;                  // nose points -Z
    this.model.rotation.y = Math.PI;       // face +Z (flight forward)
    this.model.scale.setScalar(1.1);      // measured: ~21 m span, ~40% of the frame width at cruise
    this.visual.add(this.model);
    this.ribbon = c.ribbon;
    this.reset();
  }
  reset() {
    this.pos = new THREE.Vector3(COURSE.start.x, COURSE.start.y, COURSE.start.z);
    this.heading = COURSE.start.heading;
    this.gamma = -0.02;
    this.bank = 0;
    this.visualRoll = 0;
    this.speed = 54;
    this.vy = 0;
    this.stall = 0;
    this.squall = 1.0;
    this.squallActive = 0;
    this.extraRoll = 0;
    this.thermalId = -1;
    this.thermalT = 0;
  }
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading) * Math.cos(this.gamma), Math.sin(this.gamma), Math.cos(this.heading) * Math.cos(this.gamma));
  }
  right(out = new THREE.Vector3()) {
    return out.set(-Math.cos(this.heading), 0, Math.sin(this.heading));
  }
  update(dt, input, world) {
    // Fixed internal substep: identical flight behaviour at 30, 60 or 144 Hz.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120) - 1e-6));
    const h = dt / steps;
    let clipped = false, skimmed = false, squalling = false;
    for (let i = 0; i < steps; i++) {
      const r = this._integrate(h, input, world);
      clipped = clipped || r.clipped;
      skimmed = skimmed || r.skimmed;
      squalling = squalling || r.squalling;
    }
    this._pose(dt, world);
    return { clipped, skimmed, squalling };
  }

  /** One physics substep of dt seconds. */
  _integrate(dt, input, world) {
    // --- steering -------------------------------------------------------
    this.gamma = clamp(this.gamma + input.pitch * FLIGHT.pitchRate * dt, FLIGHT.maxDive, FLIGHT.maxClimb);
    let rollIn = input.roll;
    if (Math.abs(rollIn) < 0.02) {
      this.bank = THREE.MathUtils.damp(this.bank, 0, FLIGHT.rollReturn, dt);
    } else {
      this.bank = clamp(this.bank + rollIn * FLIGHT.rollRate * dt, -FLIGHT.maxBank, FLIGHT.maxBank);
    }
    this.heading += -(9.81 / Math.max(18, this.speed)) * Math.tan(this.bank) * FLIGHT.turnGain * dt;

    // --- energy ---------------------------------------------------------
    let accel = -9.81 * Math.sin(this.gamma) - FLIGHT.dragK * this.speed * this.speed;
    if (input.brake) {
      accel -= FLIGHT.brakeDrag;
      this.gamma = lerp(this.gamma, Math.min(this.gamma, 0.05), 1 - Math.exp(-FLIGHT.brakeLift * dt * 3));
    }
    let squalling = false;
    if (input.squall && (this.squall > 0.02 || this.squallActive > 0)) {
      if (this.squall > 0.02) {
        accel += FLIGHT.squallAccel;
        this.squall = Math.max(0, this.squall - dt * 0.34);
        this.squallActive = 0.25;
        squalling = true;
      }
    }
    this.squallActive = Math.max(0, this.squallActive - dt);
    if (this.squallActive <= 0) this.squall = Math.min(1, this.squall + dt * 0.018);   // slow gust recovery
    this.speed = clamp(this.speed + accel * dt, FLIGHT.vMin, FLIGHT.vMax);

    // --- stall: the nose drops, never a death trap ----------------------
    this.stall = this.speed < FLIGHT.vStall ? (FLIGHT.vStall - this.speed) / FLIGHT.vStall : 0;
    if (this.stall > 0) this.gamma -= this.stall * 1.5 * dt;

    // --- lift from world: thermals and ridge lift -----------------------
    let lift = 0;
    this.thermalId = -1;
    for (let i = 0; i < world.thermals.length; i++) {
      const t = world.thermals[i];
      const d = Math.hypot(this.pos.x - t.x, this.pos.z - t.z);
      if (d < 90 && this.pos.y < 420) {
        const k = clamp(1 - d / 90, 0, 1);
        const ceil = 1 - clamp((this.pos.y - 260) / 200, 0, 1);
        lift += FLIGHT.thermalLift * k * ceil;
        if (d < 40) this.thermalId = i;
      }
    }
    let ridge = 0;
    for (const c of world.colliders) {
      const d = Math.hypot(this.pos.x - c.x, this.pos.z - c.z);
      const above = this.pos.y - c.topY;
      if (d < c.r * 2.1 && above > 0 && above < 70) {
        ridge = Math.max(ridge, FLIGHT.ridgeLift * clamp(1 - above / 70, 0, 1) * clamp(1 - (d - c.r) / (c.r * 1.1), 0, 1));
      }
    }
    this.vy = this.speed * Math.sin(this.gamma) - FLIGHT.sinkBase * (1 - Math.min(0.85, ridge * 0.16 + lift * 0.07))
      + ridge + lift - this.stall * 6;

    // --- integrate ------------------------------------------------------
    const f = this.forward();
    this.pos.addScaledVector(f, this.speed * Math.cos(this.gamma) * dt);
    this.pos.y += this.vy * dt;

    // --- world interaction: profile-aware, so cliffs can be skimmed -------
    let clipped = false;
    for (const c of world.colliders) {
      const d = Math.hypot(this.pos.x - c.x, this.pos.z - c.z);
      const rEff = effectiveRadius(c, this.pos.y);
      if (d < rEff) {
        if (c.kind === 'deck' || c.kind === 'pier') {
          if (this.pos.y > c.deck - 3 && this.pos.y < c.topY) { /* passing under the deck is legal */ }
          else if (this.pos.y >= c.topY && this.pos.y < c.topY + 12) { clipped = true; }
        } else if (this.pos.y < c.topY) {
          clipped = true;
        }
        if (clipped) {
          const nx = (this.pos.x - c.x) / (d || 1), nz = (this.pos.z - c.z) / (d || 1);
          this.pos.x = c.x + nx * (rEff + 2.5);
          this.pos.z = c.z + nz * (rEff + 2.5);
          break;
        }
      }
    }
    let skimmed = false;
    if (this.pos.y < 7) {
      this.pos.y = 7;
      if (this.vy < -2) skimmed = true;
      this.vy = 3.2;                    // the sea always kicks you back up
      this.speed = Math.max(FLIGHT.vMin + 4, this.speed * 0.9);
      this.gamma = Math.max(this.gamma, -0.05);
    }

    return { clipped, skimmed, squalling };
  }

  /** Pose the visible craft: bank roll, pitch, gust jitter, ribbon length. */
  _pose(dt, world) {
    this.visual.position.copy(this.pos);
    this.visual.rotation.y = this.heading;
    this.visual.rotation.x = -this.gamma;
    const liveliness = clamp((this.speed - 40) / 70, 0, 1);
    this.visualRoll = THREE.MathUtils.damp(this.visualRoll, -this.bank * (0.95 + liveliness * 0.25), 8, dt);
    this.visual.rotation.z = this.visualRoll;
    this.model.position.y = Math.sin(performance.now() * 0.0022) * 0.12 * (1 - liveliness * 0.5);
    if (this.ribbon) this.ribbon.scale.y = clamp(this.speed / 54, 0.5, 2.2);

    // Contact shadow on the swell: grounds the craft and sells altitude.
    const shadow = world && world.craftShadow;
    if (shadow) {
      const alt = Math.max(0, this.pos.y);
      const s = 11 + alt * 0.07;
      shadow.position.set(this.pos.x, 2.6, this.pos.z);
      shadow.scale.set(s, s, s);
      shadow.material.opacity = clamp(0.30 * (1 - alt / 300), 0, 0.30);
    }
  }
}

/** Collision silhouette follows the visible landform, not a fat cylinder. */
function effectiveRadius(c, y) {
  if (c.kind === 'island' && c.height) {
    const t = clamp((y - (c.baseY ?? 0)) / c.height, 0, 1);
    return c.baseR * (0.34 + 0.66 * Math.pow(1 - t, 0.62)) * 1.04;
  }
  if (c.kind === 'spire' && c.height) {
    const t = clamp((y - (c.baseY ?? 0)) / c.height, 0, 1);
    return c.baseR * (Math.pow(1 - t, 0.78) * 0.9 + 0.12) * 1.06;
  }
  return c.r;
}

/* ---------------------------------------------------------------- audio */
class Ambience {
  constructor() {
    this.enabled = false;
    this.volume = 0.55;
    this.ctx = null;
    this.ready = false;
  }
  async init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(ctx.destination);

    // wind: filtered noise bed driven by airspeed
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.94 + w * 0.06;          // brown-ish noise
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    // pad: slow, low, unobtrusive dusk drone
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.055;
    this.padGain.connect(this.master);
    for (const [f, d] of [[110, 0], [164.8, 0.6], [220, 1.4]]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f; o.detune.value = 4 - d * 4;
      const g = ctx.createGain(); g.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06 + d * 0.03;
      const lg = ctx.createGain(); lg.gain.value = 0.25;
      lfo.connect(lg).connect(g.gain); lfo.start();
      o.connect(g).connect(this.padGain); o.start();
    }
    this.ready = true;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.25);
  }
  setVolume(v) { this.volume = v; if (this.master && this.enabled) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2); }
  duck(amount) { if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume * amount : 0, this.ctx.currentTime, 0.3); }
  wind(speed, lift) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const target = clamp((speed - 30) / 90, 0, 1) * 0.34 + lift * 0.05;
    this.windGain.gain.setTargetAtTime(target, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 9, t, 0.25);
  }
  bell(freq = 880, gain = 0.22, dur = 1.9, when = 0) {
    if (!this.ready) return;
    const ctx = this.ctx, t0 = ctx.currentTime + when;
    for (const [r, g] of [[1, 1], [2.76, 0.32], [5.4, 0.10]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * r;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(gain * g, t0 + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * (1 - (r - 1) * 0.12));
      o.connect(env).connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.1);
    }
  }
  noise({ dur = 0.35, freq = 900, q = 1.2, gain = 0.2, sweep = 0.35, type = 'bandpass' }) {
    if (!this.ready) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }
}

/* ----------------------------------------------------------------- game */
export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.lookId = localStorage.getItem(HK + '.look') || 'vesper';
    this.mode = localStorage.getItem(HK + '.mode') || 'trial';
    this.qualityPref = localStorage.getItem(HK + '.quality') || 'auto';
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.calmOverride = localStorage.getItem(HK + '.calm') === '1';
    this.sound = localStorage.getItem(HK + '.sound') !== '0';
    this.audio = new Ambience();
    this.state = 'menu';
    this.manual = false;
    this.acc = 0;
    this.lastT = 0;
    this.frameTimes = [];
    this.scale = 1;
    this.bloomOn = true;
    this.autoQuality = this.qualityPref === 'auto';
    this.stats = { fps: 0, frames: 0, clips: 0, skims: 0 };
    this.input = { pitch: 0, roll: 0, brake: false, squall: false };
    this.keys = Object.create(null);
    this.touch = this._isTouch();
    this._initRenderer();
    this._buildWorld();
    this._bindInput();
    this._bindUI();
  }

  get look() { return getLook(this.lookId); }
  get calm() { return this.calmOverride || this.reducedMotion; }

  /* ---------------------------------------------------------- renderer */
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: false, alpha: false,
      powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 1, 20000);
    this.camera.position.set(0, 300, 520);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.6, 0.72, 0.75);
    this.composer.addPass(this.bloom);
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this._onResize();
    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this._onResize(), 250));
  }

  _isTouch() {
    return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    const base = this.touch ? 1.5 : 2.0;
    this.basePR = Math.min(window.devicePixelRatio || 1, base);
    this.renderer.setPixelRatio(this.basePR * this.scale);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio?.(this.basePR * this.scale);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = this.touch ? 68 : 62;
    this.camera.updateProjectionMatrix();
    this.bloom.resolution.set(w, h);
  }

  /* ------------------------------------------------------------- world */
  _buildWorld() {
    const look = this.look;
    if (this.world) {
      this.scene.remove(this.world.root);
      this.world.dispose();
    }
    if (this.craft) this.scene.remove(this.craft.visual);
    this.world = new World(look, this.qualityPref === 'low' ? 'low' : 'high');
    this.scene.add(this.world.root);
    this.craft = new Skimmer(look);
    this.scene.add(this.craft.visual);

    this.scene.fog = new THREE.FogExp2(new THREE.Color(look.fog.color).convertSRGBToLinear(), look.fog.density);

    this.sun = new THREE.DirectionalLight(new THREE.Color(look.sun.color), look.sun.intensity);
    this.sun.castShadow = true;
    const mapSize = this.qualityPref === 'low' ? 1024 : 2048;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 2600;
    const ext = 520;
    Object.assign(this.sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.6;
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.hemi = new THREE.HemisphereLight(new THREE.Color(look.hemi.sky), new THREE.Color(look.hemi.ground), look.hemi.intensity);
    this.scene.add(this.hemi);

    // cool bounce: pushes shadow sides toward the saturated cool hue (reference lesson #2)
    this.bounce = new THREE.DirectionalLight(new THREE.Color(look.rock.shadow), 0.34);
    this.bounce.position.copy(this.world.sunDir).multiplyScalar(-1).setY(0.32).multiplyScalar(600);
    this.scene.add(this.bounce);

    // warm veil in front of the sun: the diffuse backlight of the reference photo
    if (this.sunSprite) this.scene.remove(this.sunSprite);
    this.sunSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 2600),
      new THREE.MeshBasicMaterial({
        map: makeVeilTexture(), transparent: true, opacity: 0.55, depthWrite: false,
        blending: THREE.AdditiveBlending, color: new THREE.Color(look.sky.sunTint),
      })
    );
    this.sunSprite.frustumCulled = false;
    this.scene.add(this.sunSprite);

    this.renderer.toneMappingExposure = look.exposure;
    this.bloom.strength = look.bloom.strength;
    this.bloom.radius = look.bloom.radius;
    this.bloom.threshold = look.bloom.threshold;

    this.camPos = new THREE.Vector3().copy(this.craft.pos).add(new THREE.Vector3(0, 24, 90));
    this.camLook = new THREE.Vector3().copy(this.craft.pos);
    this.gateIndex = 0;
    this.world.nextGate = this.world.gates[0];
    this.resetRun();
  }

  /* ------------------------------------------------------------ run state */
  resetRun() {
    this.craft.reset();
    this.gateIndex = 0;
    this.score = 0;
    this.chain = 0;
    this.time = 0;
    this.par = 78;
    this.gatesPassed = 0;
    this.crests = 0;
    this.thermalsUsed = new Set();
    this.finished = false;
    this.finishTime = 0;
    this.events = [];
    for (const g of this.world.gates) { g.passed = false; g.flash = 0; }
    this.world.nextGate = this.world.gates[0];
    this.prevGateSide = null;
    this.stats.clips = 0; this.stats.skims = 0;
    this.toast(null);
  }

  startRun(mode = this.mode) {
    this.mode = mode;
    localStorage.setItem(HK + '.mode', mode);
    this.resetRun();
    this.state = 'flying';
    this.audio.init().then(() => { this.audio.resume(); this.audio.setEnabled(this.sound); });
    this.ui.showScreen(null);
    this.ui.setMode(mode);
    this.toast('Go — thread the rings in order', 2.4);
    this.event('start');
  }

  pause() {
    if (this.state !== 'flying') return;
    this.state = 'paused';
    this.audio.duck(0.25);
    this.ui.showScreen('pause', this.summary());
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'flying';
    this.audio.duck(1);
    this.ui.showScreen(null);
  }
  restart() { this.startRun(this.mode); }
  toMenu() { this.state = 'menu'; this.resetRun(); this.ui.showScreen('menu'); this.ui.setMode(this.mode); }

  finish(reason = 'beacon') {
    if (this.finished) return;
    this.finished = true;
    this.finishTime = this.time;
    const all = this.gatesPassed === this.world.gates.length;
    const timeBonus = Math.max(0, Math.round((this.par - this.time) * 14));
    const perfect = all ? 500 : 0;
    this.score += timeBonus + perfect;
    this.state = 'results';
    const s = this.summary();
    this.medal = s.medal;
    this.saveBest(s);
    this.audio.bell(660, 0.26, 2.6);
    this.audio.bell(990, 0.18, 3.2, 0.18);
    this.event('finish', { reason });
    this.ui.showScreen('results', s);
    // the world keeps living behind the results card
  }

  summary() {
    const best = this.loadBest();
    const silver = 2400, gold = 3400;
    let medal = '—';
    if (this.score >= gold) medal = 'GOLD';
    else if (this.score >= silver) medal = 'SILVER';
    else if (this.score >= 1200) medal = 'BRONZE';
    return {
      score: Math.round(this.score),
      gates: this.gatesPassed,
      total: this.world ? this.world.gates.length : COURSE.gates.length,
      time: this.time,
      crests: this.crests,
      clips: this.stats.clips,
      skims: this.stats.skims,
      medal,
      best,
      finished: this.finished,
    };
  }

  loadBest() {
    try { return JSON.parse(localStorage.getItem(HK + '.best') || '{}'); } catch { return {}; }
  }
  saveBest(s) {
    const best = this.loadBest();
    const cur = best[this.lookId] || { score: 0, time: 0, gates: 0 };
    best[this.lookId] = {
      score: Math.max(cur.score || 0, s.score),
      time: s.finished ? (cur.time ? Math.min(cur.time, s.time) : s.time) : cur.time || 0,
      gates: Math.max(cur.gates || 0, s.gates),
    };
    try { localStorage.setItem(HK + '.best', JSON.stringify(best)); } catch { /* ignore */ }
  }

  event(type, data = {}) { this.events.push({ t: this.time, type, ...data }); }

  toast(text, seconds = 1.8) { this.ui.toast(text, seconds); }

  /* --------------------------------------------------------------- input */
  _bindInput() {
    const keyMap = {
      ArrowUp: 'pitchUp', KeyW: 'pitchUp',
      ArrowDown: 'pitchDown', KeyS: 'pitchDown',
      ArrowLeft: 'rollLeft', KeyA: 'rollLeft',
      ArrowRight: 'rollRight', KeyD: 'rollRight',
      Space: 'brake', ShiftLeft: 'squall', ShiftRight: 'squall',
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' || e.code === 'Escape') { this.state === 'paused' ? this.resume() : this.pause(); e.preventDefault(); return; }
      if (e.code === 'KeyR') { if (this.state !== 'menu') this.restart(); return; }
      if (e.code === 'KeyM') { this.setSound(!this.sound); return; }
      if (e.code === 'Enter' && (this.state === 'menu' || this.state === 'results')) { this.startRun(); return; }
      if (keyMap[e.code]) { this.keys[keyMap[e.code]] = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { if (keyMap[e.code]) this.keys[keyMap[e.code]] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); if (this.state === 'flying') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'flying') this.pause(); });

    // touch stick (left half) + buttons (right)
    const stick = this.ui.el.stick, knob = this.ui.el.stickKnob;
    let stickId = null, sx = 0, sy = 0;
    const rect = () => this.ui.el.stickZone.getBoundingClientRect();
    this.canvas.addEventListener('pointerdown', (e) => {
      // a real touch always enables the stick, even if media queries said otherwise
      if (e.pointerType === 'touch' && !this.touch) { this.touch = true; this.ui.isTouch = true; this._onResize(); }
      if (!this.touch) return;
      if (e.clientX > window.innerWidth * 0.5) return;
      stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
      const r = rect();
      stick.style.display = 'block';
      stick.style.left = (r.left + r.width / 2) + 'px';
      stick.style.top = (r.top + r.height / 2) + 'px';
      this.ui.touchAxis = { x: 0, y: 0 };
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      const dx = clamp((e.clientX - sx) / 62, -1, 1);
      const dy = clamp((e.clientY - sy) / 62, -1, 1);
      this.ui.touchAxis = { x: dx, y: dy };
      knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    });
    const endStick = (e) => {
      if (e.pointerId !== stickId) return;
      stickId = null; stick.style.display = 'none';
      this.ui.touchAxis = { x: 0, y: 0 };
      knob.style.transform = 'translate(0,0)';
    };
    window.addEventListener('pointerup', endStick);
    window.addEventListener('pointercancel', endStick);
  }

  readInput() {
    const k = this.keys;
    let pitch = 0, roll = 0;
    if (k.pitchUp) pitch += 1;
    if (k.pitchDown) pitch -= 1;
    if (k.rollLeft) roll -= 1;
    if (k.rollRight) roll += 1;
    if (this.ui.touchAxis) {
      pitch += -this.ui.touchAxis.y;
      roll += this.ui.touchAxis.x;
    }
    if (this.autoInput) { pitch = this.autoInput.pitch; roll = this.autoInput.roll; }
    this.input.pitch = clamp(pitch, -1, 1);
    this.input.roll = clamp(roll, -1, 1);
    this.input.brake = !!k.brake || !!this.ui.touchBrake;
    this.input.squall = !!k.squall || !!this.ui.touchSquall;
    return this.input;
  }

  /* ----------------------------------------------------------- autopilot */
  autopilot() {
    if (this.state !== 'flying') return { pitch: 0, roll: 0 };
    let target;
    if (this.gateIndex < this.world.gates.length) target = this.world.gates[this.gateIndex].pos;
    else target = this.beaconPos();
    const dx = target.x - this.craft.pos.x;
    const dz = target.z - this.craft.pos.z;
    const dy = target.y - this.craft.pos.y;
    const dist = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, dz);
    let err = desiredHeading - this.craft.heading;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const desiredGamma = clamp(Math.atan2(dy, Math.max(40, dist)), -0.42, 0.34);
    const pitch = clamp((desiredGamma - this.craft.gamma) * 2.4, -1, 1);
    // bank right decreases heading, so steer against the heading error.
    // The demo autopilot is deliberately gentle — a 60° bank makes the craft unreadable on camera.
    const roll = clamp(-err * 1.6 - this.craft.bank * 0.8, -0.6, 0.6);
    let squall = false;
    if (this.craft.speed < 40 && this.craft.squall > 0.1 && dy > -30) squall = true;
    if (dy > 60 && this.craft.speed < 52) squall = true;
    return { pitch, roll, squall, brake: false };
  }

  beaconPos() { return new THREE.Vector3(COURSE.beacon.x, COURSE.beacon.y, COURSE.beacon.z); }

  /* ------------------------------------------------------------- update */
  step(dt) {
    const world = this.world;
    const input = this.readInput();
    if (this.auto) {
      const a = this.autopilot();
      this.autoInput = a;
      if (this.state === 'flying') {
        this.input.pitch = a.pitch; this.input.roll = a.roll;
        this.input.squall = a.squall; this.input.brake = false;
      } else { this.autoInput = { pitch: 0, roll: 0 }; }
    }
    if (this.state === 'flying') {
      this.time += dt;
      const res = this.craft.update(dt, this.input, world);
      if (res.clipped) {
        this.stats.clips++;
        this.chain = 0;
        this.score = Math.max(0, this.score - 40);
        this.audio.noise({ dur: 0.28, freq: 260, q: 0.8, gain: 0.35, sweep: 0.4, type: 'lowpass' });
        this.ui.flash('rgba(255,226,190,0.28)', 0.28);
        this.toast('Clipped — chain lost', 1.2);
        world.spawnSplash(this.craft.pos, 18, 1.0);
        this.event('clip');
      }
      if (res.skimmed) {
        this.stats.skims++;
        this.chain = 0;
        this.audio.noise({ dur: 0.5, freq: 1400, q: 0.7, gain: 0.3, sweep: 0.18 });
        world.spawnSplash(this.craft.pos, 34, 1.4);
        this.toast('Sea skim — kick up and go', 1.2);
        this.event('skim');
      }
      if (this.craft.thermalId >= 0) {
        const id = this.craft.thermalId;
        if (!this.thermalsUsed.has(id)) {
          this.thermalsUsed.add(id);
          this.score += 60;
          this.toast('Thermal — ride it up', 1.4);
          this.event('thermal', { id });
        }
      }
      this._checkGates();
      this._checkFinish();
      world.update(dt, this.camera);
      const aim = this.gateIndex < world.gates.length ? world.gates[this.gateIndex].pos : world.beaconTarget;
      world.setGuide(this.craft.pos, aim);
    } else if (this.state === 'menu') {
      world.update(dt, this.camera);
    } else {
      // paused / results: the scenery keeps living, the craft holds its pose
      world.update(dt * 0.4, this.camera);
    }
    this._updateLightsAndSky(dt);
    this._updateCamera(dt);
    this.audio.wind(this.craft.speed, this.craft.thermalId >= 0 ? 1 : 0);
  }

  _checkGates() {
    const world = this.world;
    if (this.gateIndex >= world.gates.length) return;
    const g = world.gates[this.gateIndex];
    const rel = new THREE.Vector3().subVectors(this.craft.pos, g.pos);
    const side = rel.dot(g.normal);
    const lateral = rel.clone().addScaledVector(g.normal, -side);
    if (this.prevGateSide !== null && Math.sign(side) !== Math.sign(this.prevGateSide) && side !== 0) {
      const frac = Math.abs(this.prevGateSide) / (Math.abs(this.prevGateSide) + Math.abs(side));
      const cross = new THREE.Vector3().lerpVectors(this.prevPos, this.craft.pos, frac).sub(g.pos);
      const d = Math.hypot(cross.x, cross.y, cross.z);
      if (d < g.radius && this.craft.speed > 0) {
        this._passGate(g);
      }
    }
    this.prevGateSide = side;
    this.prevPos = this.craft.pos.clone();
  }

  _passGate(g) {
    g.passed = true;
    this.gatesPassed++;
    this.chain++;
    const mult = clamp(1 + this.chain * 0.22, 1, 5);
    let gain = 120 * mult;
    const low = g.pos.y - this.craft.pos.y;
    let crest = false;
    if (low > 3.5) { crest = true; this.crests++; gain += 70; }
    this.score += gain;
    this.craft.squall = Math.min(1, this.craft.squall + 0.3);
    this.audio.bell(720 + this.gateIndex * 26, 0.2, 1.5);
    if (crest) this.audio.noise({ dur: 0.42, freq: 2200, q: 0.6, gain: 0.16, sweep: 0.25 });
    this.world.gatePassedFx(g.index);
    this.ui.flash('rgba(255,236,200,0.22)', 0.34);
    this.toast(`${crest ? 'CREST' : 'GATE'} ${g.index + 1}/${this.world.gates.length}   +${Math.round(gain)}`, 1.1);
    this.event('gate', { index: g.index, gain, crest });
    this.gateIndex++;
    this.world.nextGate = this.world.gates[this.gateIndex] || null;
    if (this.gateIndex >= this.world.gates.length) {
      this.toast('All rings threaded — dock at the Halo Beacon', 2.6);
      this.world.nextGate = null;
    }
  }

  _checkFinish() {
    const b = COURSE.beacon;
    const d = Math.hypot(this.craft.pos.x - b.x, this.craft.pos.z - b.z);
    const ready = this.mode === 'free' ? true : this.gateIndex >= this.world.gates.length;
    if (ready && d < b.radius && this.craft.pos.y > b.y - 8 && this.craft.pos.y < b.y + 90) {
      this.finish('beacon');
      return;
    }
    if (this.craft.pos.y < 6 && this.time > 12 && this.gateIndex >= this.world.gates.length) {
      // gentle nudge: the sea always lifts you back, never an unwinnable state
      this.toast('Climb for the beacon', 1.4);
    }
  }

  _updateLightsAndSky(dt) {
    const sunDir = this.world.sunDir;
    const anchor = this.state === 'menu' ? new THREE.Vector3(0, 120, 0) : this.craft.pos;
    const follow = this.state === 'menu' ? 1400 : 520;
    this.sun.position.copy(anchor).addScaledVector(sunDir, follow * 1.4);
    this.sunTarget.position.copy(anchor);
    this.sun.shadow.camera.updateProjectionMatrix?.();
    this.bounce.position.copy(anchor).addScaledVector(sunDir, -600).setY(anchor.y + 420);
    this.bounce.target = this.sunTarget;
    this.world.sky.position.copy(this.camera.position);
    this.sunSprite.position.copy(this.camera.position).addScaledVector(sunDir, 5200);
    this.sunSprite.lookAt(this.camera.position);
    this.world.sea.position.x = Math.round(this.camera.position.x / 40) * 40;
    this.world.sea.position.z = Math.round(this.camera.position.z / 40) * 40;
  }

  _updateCamera(dt) {
    const craft = this.craft;
    const speedK = clamp((craft.speed - 46) / 70, 0, 1);
    const calm = this.calm;
    let desiredYaw, desiredPitch, dist, up;
    if (this.state === 'menu') {
      const a = performance.now() * 0.00004 + 0.9;
      const r = 620;
      const camPos = new THREE.Vector3(Math.cos(a) * r, 205 + Math.sin(a * 1.7) * 26, Math.sin(a) * r);
      this.camPos.lerp(camPos, 1 - Math.exp(-1.2 * dt));
      this.camLook.lerp(new THREE.Vector3(0, 96, 0), 1 - Math.exp(-1.2 * dt));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      this.camera.fov = this.touch ? 62 : 56;
      this.camera.updateProjectionMatrix();
      return;
    }
    desiredYaw = craft.heading + (calm ? 0 : craft.bank * 0.16);
    desiredPitch = craft.gamma * 0.42;
    // The camera must sit outside the wing span (~12 m half-span), or the near wing
    // sweeps through the lens and the craft reads as a cropped slab.
    dist = 17 + speedK * (calm ? 1.0 : 3.6);
    up = 1.5 + speedK * 0.8;
    const dir = new THREE.Vector3(
      Math.sin(desiredYaw) * Math.cos(desiredPitch),
      Math.sin(desiredPitch),
      Math.cos(desiredYaw) * Math.cos(desiredPitch)
    );
    const desired = new THREE.Vector3().copy(craft.pos).addScaledVector(dir, -dist);
    desired.y += up;
    desired.y = Math.max(desired.y, 8.5);
    const k = 7.2;
    this.camPos.lerp(desired, 1 - Math.exp(-k * dt));
    // Camera clearance: never let the chase camera sit inside a pier, arch or rock, or the
    // frame goes black for a beat as it passes through — and never shove it so far sideways
    // that it ends up inside the craft's own wing. Two passes settle both constraints.
    const cols = this.world && this.world.colliders;
    for (let pass = 0; pass < 2 && cols; pass++) {
      for (const c of cols) {
        const topY = c.topY ?? 1e9, baseY = c.baseY ?? -1e9;
        if (this.camPos.y > topY + 2 || this.camPos.y < baseY) continue;
        // Only small solids (piers, props) — pushing off a 150 m island would fling the
        // camera across the map, which is worse than the occlusion it prevents.
        if ((c.r || 0) > 30) continue;
        const dx = this.camPos.x - c.x, dz = this.camPos.z - c.z;
        const rr = (c.r || 0) + 14;   // clear of the pier's own bulk, not just its collider
        const d = Math.hypot(dx, dz);
        if (d < rr) {
          const s = (rr + 0.4) / Math.max(d, 0.05);
          this.camPos.x = c.x + dx * s;
          this.camPos.z = c.z + dz * s;
        }
      }
      const away = new THREE.Vector3().subVectors(this.camPos, craft.pos);
      const dist2 = away.length();
      if (dist2 < 22) {
        away.setLength(22);
        this.camPos.copy(craft.pos).add(away);
      }
    }
    const lookTarget = new THREE.Vector3().copy(craft.pos).addScaledVector(dir, 19).setY(craft.pos.y + 0.6);
    this.camLook.lerp(lookTarget, 1 - Math.exp(-9 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (!calm) this.camera.rotateZ(-craft.bank * 0.30 - craft.visualRoll * 0.12);
    const fovBase = this.touch ? 68 : 62;
    const fovTarget = fovBase + (calm ? 0 : speedK * 12);
    this.camera.fov = lerp(this.camera.fov, fovTarget, 1 - Math.exp(-3.2 * dt));
    this.camera.updateProjectionMatrix();
  }

  /* --------------------------------------------------------------- loop */
  /** Measured craft extents (m) and current camera distance — used to keep framing honest. */
  craftBox() {
    // the craft model only — the trail ribbon and the contact shadow would inflate the box
    const target = this.craft.model || this.craft.visual;
    this.craft.visual.updateMatrixWorld(true);   // fresh transforms; render has not run yet
    const box = new THREE.Box3().setFromObject(target);
    const size = box.getSize(new THREE.Vector3());
    // project the corners into NDC so framing is measurable: >1 or <-1 means the craft
    // (or a wingtip) is outside the viewport, which is a real framing defect.
    // The camera matrix is only refreshed during render, so refresh it here first.
    this.camera.updateMatrixWorld(true);
    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      v.project(this.camera);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    return {
      w: +size.x.toFixed(2), h: +size.y.toFixed(2), d: +size.z.toFixed(2),
      camDist: +this.camera.position.distanceTo(this.craft.pos).toFixed(2),
      fov: +this.camera.fov.toFixed(1),
      ndc: [+minX.toFixed(2), +maxX.toFixed(2), +minY.toFixed(2), +maxY.toFixed(2)],
      fitsFrame: minX > -1 && maxX < 1 && minY > -1 && maxY < 1,
      camPos: [+this.camera.position.x.toFixed(1), +this.camera.position.y.toFixed(1), +this.camera.position.z.toFixed(1)],
      pos: [+this.craft.pos.x.toFixed(1), +this.craft.pos.y.toFixed(1), +this.craft.pos.z.toFixed(1)],
      state: this.state,
    };
  }

  /** Debug: what solid is in front of the camera? Used to diagnose occluded frames. */
  whatsInFront(grid = 1) {
    const rc = new THREE.Raycaster();
    const base = new THREE.Vector3();
    this.camera.getWorldDirection(base);
    const out = [];
    const offs = grid > 1 ? [-0.5, 0, 0.5] : [0];
    for (const ox of offs) {
      for (const oy of offs) {
        const dir = base.clone();
        dir.x += ox * 0.4; dir.y += oy * 0.4;
        dir.normalize();
        rc.set(this.camera.position, dir);
        rc.far = 500;
        const hits = rc.intersectObject(this.world.root, true);
        out.push(hits.length ? { d: +hits[0].distance.toFixed(1), geo: hits[0].object.geometry && hits[0].object.geometry.type, color: hits[0].object.material && hits[0].object.material.color ? '#' + hits[0].object.material.color.getHexString() : '' } : null);
      }
    }
    return out;
  }

  /** Debug: is the camera matrix sane? A NaN here renders the whole world black. */
  camDiag() {
    const e = this.camera.matrixWorld.elements;
    return {
      pos: [+this.camera.position.x.toFixed(2), +this.camera.position.y.toFixed(2), +this.camera.position.z.toFixed(2)],
      nan: e.some((v) => !Number.isFinite(v)) || !Number.isFinite(this.camera.position.x),
      quat: [+this.camera.quaternion.x.toFixed(3), +this.camera.quaternion.y.toFixed(3), +this.camera.quaternion.z.toFixed(3), +this.camera.quaternion.w.toFixed(3)],
      exposure: this.renderer ? this.renderer.toneMappingExposure : null,
      sceneChildren: this.scene.children.length,
      rootChildren: this.world.root.children.length,
    };
  }

  frame(dt) {
    this.step(Math.min(dt, 1 / 20));
    this.render();
    this.ui.update(this);
  }

  render() {
    this.composer.render();
  }

  animate = (now) => {
    this._raf = requestAnimationFrame(this.animate);
    if (this.manual) return;
    const t = now / 1000;
    let dt = this.lastT ? t - this.lastT : 1 / 60;
    this.lastT = t;
    if (dt > 0.1) dt = 0.1;
    this._trackPerf(dt);
    this.frame(dt);
  };

  _trackPerf(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 45) this.frameTimes.shift();
    if (this.frameTimes.length === 45) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.stats.fps = 1 / avg;
      if (this.autoQuality) {
        if (avg > 0.048 && this.bloomOn) { this.bloomOn = false; this.bloom.enabled = false; }
        else if (avg > 0.033 && this.scale > 0.6) { this.scale = Math.max(0.6, this.scale - 0.12); this._onResize(); }
        else if (avg < 0.016 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.08); this._onResize(); }
      }
      this.frameTimes.length = 0;
    }
  }

  startLoop() { this._raf = requestAnimationFrame(this.animate); }

  /* ---------------------------------------------------------- UI wiring */
  _bindUI() {
    const el = this.ui.el;
    el.btnStart?.addEventListener('click', () => this.startRun());
    el.btnFree?.addEventListener('click', () => this.startRun('free'));
    el.btnResume?.addEventListener('click', () => this.resume());
    el.btnRestart?.addEventListener('click', () => this.restart());
    el.btnMenu?.addEventListener('click', () => this.toMenu());
    el.btnPause?.addEventListener('click', () => (this.state === 'paused' ? this.resume() : this.pause()));
    el.btnSound?.addEventListener('click', () => this.setSound(!this.sound));
    el.chipSound?.addEventListener('click', () => this.setSound(!this.sound));
    el.chipCalm?.addEventListener('click', () => {
      this.calmOverride = !this.calmOverride;
      localStorage.setItem(HK + '.calm', this.calmOverride ? '1' : '0');
      this.ui.setCalm(this.calm);
    });
    el.btnCalm?.addEventListener('click', () => {
      this.calmOverride = !this.calmOverride;
      localStorage.setItem(HK + '.calm', this.calmOverride ? '1' : '0');
      this.ui.setCalm(this.calm);
    });
    for (const btn of el.lookButtons || []) {
      btn.addEventListener('click', () => this.setLook(btn.dataset.look));
    }
    for (const btn of el.qualityButtons || []) {
      btn.addEventListener('click', () => this.setQuality(btn.dataset.q));
    }
    el.btnBrake?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.ui.touchBrake = true; });
    el.btnBrake?.addEventListener('pointerup', () => { this.ui.touchBrake = false; });
    el.btnBrake?.addEventListener('pointercancel', () => { this.ui.touchBrake = false; });
    el.btnSquall?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.ui.touchSquall = true; });
    el.btnSquall?.addEventListener('pointerup', () => { this.ui.touchSquall = false; });
    el.btnSquall?.addEventListener('pointercancel', () => { this.ui.touchSquall = false; });
    this.ui.setSound(this.sound);
    this.ui.setCalm(this.calm);
    this.ui.setLookButtons(this.lookId);
    this.ui.setQualityButtons(this.qualityPref);
  }

  setLook(id) {
    if (!LOOK_ORDER.includes(id)) return;
    this.lookId = id;
    localStorage.setItem(HK + '.look', id);
    const keepState = this.state;
    this._buildWorld();
    this.state = keepState === 'flying' ? 'menu' : keepState;
    this.ui.setLookButtons(id);
    if (this.state !== 'flying') this.ui.showScreen(this.state === 'results' ? null : this.state);
    this.toast(`Look: ${this.look.label}`, 1.6);
  }
  setQuality(q) {
    this.qualityPref = q;
    localStorage.setItem(HK + '.quality', q);
    this.autoQuality = q === 'auto';
    this.bloomOn = true;
    this.bloom.enabled = true;
    this.scale = q === 'low' ? 0.75 : 1;
    this.ui.setQualityButtons(q);
    this._onResize();
    const keep = this.state;
    this._buildWorld();
    this.state = keep === 'flying' ? 'menu' : keep;
    if (this.state !== 'flying') this.ui.showScreen(this.state);
  }
  setSound(on) {
    this.sound = on;
    localStorage.setItem(HK + '.sound', on ? '1' : '0');
    this.audio.init().then(() => { this.audio.resume(); this.audio.setEnabled(on); });
    this.ui.setSound(on);
    if (on) this.audio.bell(520, 0.16, 0.9);
  }
}

/* ------------------------------------------------------- helper bits */
function makeVeilTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.18, 'rgba(255,244,222,0.42)');
  g.addColorStop(0.45, 'rgba(255,226,190,0.14)');
  g.addColorStop(1, 'rgba(255,220,180,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** When paused/results, keep the scenery alive: it is a living page, not a freeze-frame. */

