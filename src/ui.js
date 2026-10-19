// AFTERLIGHT — HUD and screens. Cream type, minimal chrome, no status spam.
import * as THREE from 'three';
import { COURSE } from './world.js';
import { LOOKS } from './looks.js';

const $ = (id) => document.getElementById(id);
const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
};

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), objective: $('objective'), objectiveSub: $('objective-sub'),
      time: $('stat-time'), speed: $('stat-speed'), alt: $('stat-alt'),
      chain: $('chain'), squallFill: $('squall-fill'), score: $('score'),
      chev: $('chev'), chevMark: $('chev-mark'), chevDist: $('chev-dist'),
      lock: $('lock'), lockRing: $('lock-ring'), lockDist: $('lock-dist'),
      reticle: $('reticle'), fpm: $('fpm'), fpmA: document.querySelector('#fpm .fpm-a'),
      toast: $('toast'), lookBadge: $('look-badge'), flash: $('flash'),
      menu: $('menu'), pause: $('pause'), results: $('results'),
      btnStart: $('btn-start'), btnFree: $('btn-free'), btnResume: $('btn-resume'),
      btnRestart: $('btn-restart'), btnMenu: $('btn-menu'), btnAgain: $('btn-again'),
      btnResultsMenu: $('btn-results-menu'), btnPause: $('btn-pause'),
      btnSound: $('btn-sound'), btnCalm: $('btn-calm'),
      chipSound: $('chip-sound'), chipCalm: $('chip-calm'),
      lookButtons: [...document.querySelectorAll('#look-row .chip')],
      qualityButtons: [...document.querySelectorAll('#quality-row .chip')],
      resultsTitle: $('results-title'), resultsSub: $('results-sub'),
      resultsGrid: $('results-grid'), resultsMedal: $('results-medal'),
      legend: $('legend'), perfNote: $('perf-note'),
      touch: $('touch'), stick: $('stick'), stickKnob: $('stick-knob'),
      stickZone: $('stick-zone'), btnBrake: $('btn-brake'), btnSquall: $('btn-squall'),
    };
    // the pause / sound / calm chips in the menu are wired to the same state
    this.el.chipSound.id = 'chip-sound';
    this.el.chipCalm.id = 'chip-calm';
    this._cache = {};
    this._toastTimer = 0;
    this.el.legend.innerHTML = COURSE.gates
      .map((g, i) => `<li>${String(i + 1).padStart(2, '0')} · ${g.note}</li>`)
      .join('');
    this.el.perfNote.textContent = '';
  }

  /* ------------------------------------------------------------ screens */
  showScreen(name, data) {
    this.el.menu.hidden = name !== 'menu';
    this.el.pause.hidden = name !== 'pause';
    this.el.results.hidden = name !== 'results';
    this.el.hud.hidden = name !== null;
    this.el.touch.hidden = name !== null || !this.isTouch;
    document.body.classList.toggle('is-touch', !!this.isTouch);
    if (name === 'results' && data) this.renderResults(data);
    if (name === 'pause' && data) {
      const best = data.best?.[this.lookId] || {};
      this.el.perfNote.textContent = `Ring ${data.gates} / ${data.total} · ${fmtTime(data.time)} · fps ${this.lastFps?.toFixed(0) || '—'}` +
        (best.score ? ` · best ${best.score}` : '');
    }
  }

  renderResults(s) {
    this.el.resultsTitle.textContent = s.finished ? (s.gates === s.total ? 'The line is flown' : 'Beacon reached') : 'Run ended';
    this.el.resultsSub.textContent = s.gates === s.total
      ? 'Every ring threaded, and the beacon answered.'
      : `${s.total - s.gates} ring${s.total - s.gates === 1 ? '' : 's'} left unthreaded — the beacon only opens for a full line.`;
    const rows = [
      ['score', s.score],
      ['rings', `${s.gates}/${s.total}`],
      ['time', fmtTime(s.time)],
      ['crests', s.crests],
      ['clips', s.clips],
      ['skims', s.skims],
    ];
    this.el.resultsGrid.innerHTML = rows.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    const best = s.best?.[this.lookId];
    this.el.resultsMedal.textContent = s.medal === '—'
      ? (best?.score ? `best on this look · ${best.score}` : 'no medal — fly a cleaner line')
      : `${s.medal}${best?.score ? ` · best ${Math.max(best.score, s.score)}` : ''}`;
  }

  setMode(mode) { this.mode = mode; }
  setSound(on) {
    this.el.btnSound.textContent = on ? '♪' : '♪̸';
    this.el.btnSound.style.opacity = on ? '1' : '0.5';
    if (this.el.chipSound) { this.el.chipSound.textContent = on ? 'On' : 'Off'; this.el.chipSound.classList.toggle('on', on); }
  }
  setCalm(on) {
    this.el.btnCalm.style.opacity = on ? '0.55' : '1';
    if (this.el.chipCalm) { this.el.chipCalm.textContent = on ? 'Calm' : 'Living'; this.el.chipCalm.classList.toggle('on', on); }
  }
  setLookButtons(id) {
    for (const b of this.el.lookButtons) b.classList.toggle('on', b.dataset.look === id);
    for (const b of this.el.qualityButtons) b.classList.toggle('on', b.dataset.q === (this.game?.qualityPref || 'auto'));
    const look = LOOKS[id];
    if (look) this.el.lookBadge.textContent = look.label;
  }
  setQualityButtons(q) { for (const b of this.el.qualityButtons) b.classList.toggle('on', b.dataset.q === q); }

  toast(text, seconds = 1.8) {
    if (!text) { this.el.toast.classList.remove('show'); return; }
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this._g = this._g || null;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), seconds * 1000);
  }

  flash(color, seconds = 0.3) {
    this.el.flash.style.background = color;
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => { this.el.flash.style.background = 'transparent'; }, seconds * 1000);
  }

  /* --------------------------------------------------------------- HUD */
  update(game) {
    this.lastFps = game.stats.fps;
    const total = game.world.gates.length;
    const obj = game.gateIndex >= total ? 'Dock at the Halo Beacon' : `Ring ${game.gateIndex + 1} / ${total}`;
    const sub = game.gateIndex >= total
      ? 'Climb for the halo on the far island.'
      : (game.world.gates[game.gateIndex]?.note || '');
    this._set('obj', this.el.objective, obj);
    this._set('sub', this.el.objectiveSub, sub);
    this._set('time', this.el.time, fmtTime(game.time));
    this._set('speed', this.el.speed, String(Math.round(game.craft.speed)));
    this._set('alt', this.el.alt, String(Math.round(game.craft.pos.y)));
    this._set('score', this.el.score, String(Math.round(game.score)));
    const mult = Math.min(5, 1 + game.chain * 0.22);
    this._set('chain', this.el.chain, game.chain > 1 ? `chain ×${mult.toFixed(1)}` : '');
    this.el.squallFill.style.width = `${Math.round(game.craft.squall * 100)}%`;

    // objective marker: lock ring when the target is on screen, chevron when it is not
    const target = game.gateIndex < total ? game.world.gates[game.gateIndex].pos : game.beaconPos();
    const p = target.clone().project(game.camera);
    const behind = p.z > 1;
    const dist = Math.round(target.distanceTo(game.craft.pos));
    const off = behind || Math.abs(p.x) > 0.88 || Math.abs(p.y) > 0.84;

    if (off || dist < 55) {
      this.el.lock.hidden = true;
    } else {
      const lx = (p.x * 0.5 + 0.5) * window.innerWidth;
      const ly = (0.5 - p.y * 0.5) * window.innerHeight;
      const inner = clampN(1 - dist / 700, 0.3, 1);
      this.el.lock.hidden = false;
      this.el.lock.style.transform = `translate(${Math.round(lx)}px, ${Math.round(ly)}px)`;
      this.el.lockRing.style.width = this.el.lockRing.style.height = `${Math.round(34 + 52 * inner)}px`;
      this.el.lockRing.style.opacity = (0.3 + 0.5 * inner).toFixed(2);
      this._set('lockDist', this.el.lockDist, `${dist} m`);
    }

    if (!off) {
      this.el.chev.hidden = true;
    } else {
      let x = behind ? -p.x : p.x;
      let y = behind ? -p.y : p.y;
      const len = Math.hypot(x, y) || 1;
      const k = 0.86 / Math.max(Math.abs(x), Math.abs(y), 0.0001);
      x *= Math.min(k, 1 / len * 1.0) * (Math.abs(x) > Math.abs(y) ? 0.86 / Math.abs(x) : 0.86 / Math.abs(x));
      y = clampN(y * (0.86 / Math.max(Math.abs(y), 0.0001)), -0.84, 0.84);
      x = clampN(x, -0.9, 0.9);
      const px = (x * 0.5 + 0.5) * window.innerWidth;
      const py = (0.5 - y * 0.5) * window.innerHeight;
      this.el.chev.hidden = false;
      this.el.chev.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
      const ang = Math.atan2(py - window.innerHeight / 2, px - window.innerWidth / 2) * 180 / Math.PI + 90;
      this.el.chevMark.style.transform = `rotate(${ang}deg)`;
      this._set('chevDist', this.el.chevDist, `${dist} m`);
    }

    /* Flight-path marker: where the craft is ACTUALLY going, drawn separately from the fixed
       centre reticle. In a steady glide the two coincide; a stall opens the gap (the craft
       sinks below its nose) and a dive closes it. The stem draws the gap itself. */
    if (game.state === 'flying') {
      const c = game.craft;
      const path = c.forward();                                 // velocity direction
      const q = c.pos.clone().addScaledVector(path, 260).project(game.camera);
      const onScreen = q.z < 1 && Math.abs(q.x) < 0.97 && Math.abs(q.y) < 0.97;
      this.el.fpm.hidden = !onScreen;
      if (onScreen) {
        const px = (q.x * 0.5 + 0.5) * window.innerWidth;
        const py = (0.5 - q.y * 0.5) * window.innerHeight;
        const gap = py - window.innerHeight * 0.5;              // + = path below the reticle
        this.el.fpm.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
        this.el.fpm.style.opacity = (0.92 - Math.min(0.35, Math.abs(q.x) * 0.2 + Math.abs(q.y) * 0.2)).toFixed(2);
        const stem = this.el.fpmA;
        if (stem) {
          const h = Math.round(Math.min(150, Math.abs(gap)));
          stem.style.height = `${h}px`;
          stem.style.top = gap > 0 ? `${15 - h}px` : '15px';
        }
      }
    } else {
      this.el.fpm.hidden = true;
    }
  }

  _set(key, node, value) {
    if (this._cache[key] === value) return;
    this._cache[key] = value;
    node.textContent = value;
  }
}

function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
