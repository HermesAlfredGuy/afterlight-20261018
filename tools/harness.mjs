// AFTERLIGHT — headless harness: boots the real game in Chromium and exercises the
// same public API the player uses. Modes: smoke | flight | shots | clip
//   node tools/harness.mjs flight
//   node tools/harness.mjs shots
//   AL_WARM=600 AL_COUNT=120 node tools/harness.mjs clip     (deterministic chunking)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/opt/data/projects/afterlight-20261018';
const OUT = process.env.AL_OUT || path.join(ROOT, 'build');
const URL = process.env.AL_URL || 'http://127.0.0.1:8099/index.html';
const MODE = process.argv[2] || 'smoke';
const HEADLESS = process.env.AL_HEADFUL !== '1';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: HEADLESS,
  channel: HEADLESS ? 'chromium' : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--no-sandbox', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'],
});
const ctx = await browser.newContext({
  viewport: { width: Number(process.env.AL_W || 1440), height: Number(process.env.AL_H || 900) },
  deviceScaleFactor: 1, locale: 'en-GB',
});
const page = await ctx.newPage();
const console_ = [];
page.on('console', (m) => { if (m.type() !== 'log') console_.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => console_.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => console_.push(`requestfailed: ${r.url()}`));

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
const bootMs = Date.now() - t0;
const report = { bootMs, console: [], checks: [], shots: [] };
const check = (name, ok, detail) => {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const ev = (fn, arg) => page.evaluate(fn, arg);

// ------------------------------------------------------------------ boot
const webgl = await ev(() => window.AFTERLIGHT.api.webgl());
check('webgl2 context', /WebGL 2/.test(webgl.version || ''), `${webgl.renderer}`);
check('no boot errors', (await ev(() => window.AFTERLIGHT.api.errors())).length === 0);
console.log(`boot ${bootMs} ms`);

// -------------------------------------------------------------- flight
if (MODE === 'flight') {
  await page.click('[data-testid="start"]');
  await page.waitForTimeout(900);
  const s0 = await ev(() => window.AFTERLIGHT.api.status());
  check('Start button begins a run', s0.state === 'flying' && s0.speed > 20, `state=${s0.state} speed=${s0.speed}`);

  // real keyboard events through the DOM (not the test API); headless Chromium does not
  // advance rAF reliably, so the DOM key is verified together with deterministic stepping
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(120);
  const keyHeld = await ev(() => ({ ...window.AFTERLIGHT.game.keys }));
  const kb = await ev(() => {
    window.AFTERLIGHT.api.sim(1 / 30, 24);
    return window.AFTERLIGHT.api.status();
  });
  await page.keyboard.up('KeyD');
  check('real DOM key event reaches the input map', keyHeld.rollRight === true, JSON.stringify(keyHeld));
  check('real keyboard input banks the craft', Math.abs(kb.bank) > 0.15, `bank=${kb.bank} rad`);

  const fi = await ev(() => {
    const api = window.AFTERLIGHT.api;
    api.setManual(true); api.setAuto(false);
    const run = (dt, n) => {
      api.start('trial');
      api.teleport(0, 260, -900, 0, 60);
      api.key('rollRight', true); api.key('pitchDown', true);
      api.sim(dt, n);
      api.key('rollRight', false); api.key('pitchDown', false);
      const s = api.status();
      return { h: s.heading, y: s.alt, x: s.x };
    };
    return { a: run(1 / 30, 300), b: run(1 / 120, 1200) };
  });
  const dh = Math.abs(fi.a.h - fi.b.h), dy = Math.abs(fi.a.y - fi.b.y);
  check('framerate-independent steering (30 vs 120 Hz, 10 s)', dh < 0.02 && dy < 2.0,
    `Δheading ${dh.toFixed(5)} rad, Δalt ${dy.toFixed(2)} m`);

  const turn = await ev(() => {
    const api = window.AFTERLIGHT.api;
    api.start('trial'); api.teleport(0, 300, -1400, 0, 62);
    const p0 = api.status();
    api.key('rollRight', true); api.sim(1 / 30, 90); api.key('rollRight', false);
    const p1 = api.status();
    const right = { x: -Math.cos(p0.heading), z: Math.sin(p0.heading) };
    return { dot: right.x * (p1.x - p0.x) + right.z * (p1.z - p0.z), dh: p1.heading - p0.heading, bank: p1.bank };
  });
  check('bank right turns right', turn.dot > 25 && turn.dh < -0.1,
    `moved ${turn.dot.toFixed(0)} m along the right vector, Δheading ${turn.dh.toFixed(3)} rad`);

  const stall = await ev(() => {
    const api = window.AFTERLIGHT.api;
    api.start('trial'); api.teleport(-1400, 620, -1800, Math.PI, 44);
    api.key('pitchUp', true); api.sim(1 / 30, 360); api.key('pitchUp', false);
    const slow = api.status();
    api.key('pitchDown', true); api.sim(1 / 30, 300); api.key('pitchDown', false);
    const out = api.status();
    return { slow: slow.speed, out: out.speed, alt: out.alt, state: out.state };
  });
  check('stall forces the nose down and diving recovers', stall.slow < 34 && stall.out > 45 && stall.state === 'flying',
    `speed ${stall.slow} → ${stall.out} m/s`);

  const clip = await ev(() => {
    const api = window.AFTERLIGHT.api;
    api.start('trial'); api.teleport(0, 120, 520, Math.PI, 62);
    api.sim(1 / 30, 300);
    return api.status();
  });
  check('terrain clip is a soft cost, not a death', clip.clips >= 1 && clip.state === 'flying' && clip.speed > 18,
    `clips=${clip.clips} speed=${clip.speed} state=${clip.state}`);

  const skim = await ev(() => {
    const api = window.AFTERLIGHT.api;
    api.start('trial'); api.teleport(-1500, 26, 900, Math.PI, 60);
    api.key('pitchDown', true); api.sim(1 / 30, 200); api.key('pitchDown', false);
    api.sim(1 / 30, 60);
    return api.status();
  });
  check('sea skim lifts the craft back out', skim.state === 'flying' && skim.alt >= 6,
    `skims=${skim.skims} alt=${skim.alt}`);

  // thermal gives lift
  const th = await ev(() => {
    const api = window.AFTERLIGHT.api;
    api.start('trial'); api.teleport(-140, 120, -420, Math.PI, 52);
    const y0 = api.status().alt;
    api.key('pitchUp', true); api.sim(1 / 30, 60); api.key('pitchUp', false);
    return { y0, y1: api.status().alt, score: api.status().score };
  });
  check('thermals are real lift', th.y1 > th.y0 + 5, `alt ${th.y0} → ${th.y1}, thermal bonus ${th.score}`);

  await ev(() => { const api = window.AFTERLIGHT.api; api.setManual(true); api.start('trial'); });
  await page.keyboard.press('KeyP');
  const paused = await ev(() => { const api = window.AFTERLIGHT.api; api.sim(1 / 30, 40); return api.status(); });
  check('P pauses the run and freezes the craft', paused.state === 'paused' && paused.time === 0,
    `state=${paused.state} time=${paused.time}`);
  await page.keyboard.press('KeyP');
  check('P resumes', (await ev(() => window.AFTERLIGHT.api.status())).state === 'flying');

  const run = await ev(() => {
    const api = window.AFTERLIGHT.api;
    api.start('trial');
    api.setAuto(true);
    for (let i = 0; i < 30 * 150; i++) {
      api.sim(1 / 30, 1);
      if (i % 30 === 0 && api.status().state !== 'flying') break;
    }
    api.setAuto(false);
    return { status: api.status(), gates: api.events().filter((e) => e.type === 'gate').length, events: api.events() };
  });
  check('authored course is flyable to the beacon', run.status.finished === true,
    `rings ${run.status.gatesPassed}/${run.status.totalGates}, ${run.status.time}s, score ${run.status.score}, clips ${run.status.clips}, skims ${run.status.skims}`);
  fs.writeFileSync(path.join(OUT, 'run-events.json'), JSON.stringify(run, null, 2));

  const restart = await ev(() => { const api = window.AFTERLIGHT.api; api.restart(); return api.status(); });
  check('restart resets score, rings and clock', restart.score === 0 && restart.gatesPassed === 0 && restart.time === 0);

  const free = await ev(() => {
    const api = window.AFTERLIGHT.api;
    api.start('free');
    api.teleport(280, 210, -760, Math.PI, 60);
    api.sim(1 / 30, 90);
    return api.status();
  });
  check('free flight can dock at the beacon without the full course', free.finished === true, `state=${free.state}`);

  // responsive/mobile layout sanity
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const mob = await ev(() => {
    const api = window.AFTERLIGHT.api;
    api.start('trial');
    api.setAuto(true); api.sim(1 / 30, 60); api.setAuto(false);
    return { w: window.innerWidth, h: window.innerHeight, touch: window.AFTERLIGHT.game.touch,
      canvas: [document.getElementById('view').clientWidth, document.getElementById('view').clientHeight],
      hud: !document.getElementById('hud').hidden };
  });
  check('mobile viewport fills the screen with the HUD', mob.canvas[0] === mob.w && mob.canvas[1] === mob.h && mob.hud,
    `${mob.canvas[0]}x${mob.canvas[1]} canvas`);
  await page.screenshot({ path: path.join(OUT, 'shot-mobile-desktop-context.png') });
  report.shots.push('shot-mobile-desktop-context.png');
  // touch stick: a real touch context (hasTouch) so the game's coarse-pointer detection is honest
  const touchCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  const tp = await touchCtx.newPage();
  tp.on('pageerror', (e) => console.log('[pageerror:touch]', e.message));
  await tp.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await tp.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
  await tp.click('[data-testid="start"]');
  await tp.waitForTimeout(200);
  const touchSeen = await tp.evaluate(() => ({ touch: window.AFTERLIGHT.game.touch, stickHidden: document.getElementById('touch').hidden }));
  const cx = 390 * 0.24, cy = 844 * 0.68;
  await tp.evaluate(({ cx, cy }) => {
    const c = document.getElementById('view');
    c.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: cx, clientY: cy,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: cx + 60, clientY: cy - 20,
    }));
  }, { cx, cy });
  const touchState = await tp.evaluate(() => {
    window.AFTERLIGHT.api.sim(1 / 30, 24);
    return { ...window.AFTERLIGHT.api.status(), axis: { ...window.AFTERLIGHT.game.ui.touchAxis } };
  });
  await tp.evaluate(() => {
    window.AFTERLIGHT.api.setAuto(false);
    window.AFTERLIGHT.api.seek(1, 62);
    window.AFTERLIGHT.api.setAuto(true);
    window.AFTERLIGHT.api.sim(1 / 30, 40);
    window.AFTERLIGHT.api.frame(1 / 30);
    window.AFTERLIGHT.api.frame(1 / 30);
  });
  await tp.waitForTimeout(300);
  await tp.screenshot({ path: path.join(OUT, 'shot-mobile.png') });
  report.shots.push('shot-mobile.png');
  await tp.setViewportSize({ width: 844, height: 390 });
  await tp.waitForTimeout(200);
  await tp.evaluate(() => {
    window.AFTERLIGHT.api.frame(1 / 30);
    window.AFTERLIGHT.api.frame(1 / 30);
  });
  await tp.waitForTimeout(300);
  await tp.screenshot({ path: path.join(OUT, 'shot-mobile-landscape.png') });
  report.shots.push('shot-mobile-landscape.png');
  check('touch UI is enabled on a coarse-pointer device', touchSeen.touch === true && touchSeen.stickHidden === false,
    JSON.stringify(touchSeen));
  check('touch stick steers the craft', Math.abs(touchState.bank) > 0.12 || Math.abs(touchState.heading - Math.PI) > 0.05,
    `bank=${touchState.bank} heading=${touchState.heading} axis=${JSON.stringify(touchState.axis)}`);
  await touchCtx.close();
  await page.setViewportSize({ width: 1440, height: 900 });

  const errs = await ev(() => window.AFTERLIGHT.api.errors());
  check('no runtime errors during play', errs.length === 0, errs.join(' | '));
  const perf = await ev(() => window.AFTERLIGHT.api.perf(12, 1 / 30));
  report.perf = perf;
  console.log(`software-render frame: ${perf.msPerFrame} ms`);
}

// --------------------------------------------------------------- shots
if (MODE === 'shots') {
  const looks = (process.env.AL_LOOKS || 'vesper').split(',');
  const targets = [['launch', 1, 62], ['arch', 4, 40], ['spires', 9, 48], ['beacon', 13, 64]];
  for (const look of looks) {
    for (const [name, gateIndex, alt] of targets) {
      const ms = await ev(({ look, gateIndex, alt }) => {
        const api = window.AFTERLIGHT.api;
        api.setManual(true);
        api.setLook(look);
        api.start('trial');
        api.seek(gateIndex, alt);
        api.setAuto(true);
        api.sim(1 / 30, 40);          // physics only: slide into a natural pose
        api.setAuto(false);
        const t = performance.now();
        api.frame(1 / 30);
        return performance.now() - t;
      }, { look, gateIndex, alt });
      const file = `shot-${look}-${name}.png`;
      await page.screenshot({ path: path.join(OUT, file) });
      report.shots.push(file);
      console.log(`  ${file}  (frame ${ms.toFixed(0)} ms)`);
    }
  }
}

// ---------------------------------------------------------------- clip
if (MODE === 'clip') {
  const fps = Number(process.env.AL_FPS || 30);
  const warm = Number(process.env.AL_WARM || 0);
  const count = Number(process.env.AL_COUNT || 600);
  const dir = path.join(OUT, 'frames');
  fs.mkdirSync(dir, { recursive: true });
  await ev(({ warm, fps, q }) => {
    const api = window.AFTERLIGHT.api;
    api.setManual(true);
    api.setLook('vesper');
    api.setQuality(q);
    api.start('trial');
    api.seek(3, 30);                  // reef run, then the aqueduct, then the west wall
    api.setAuto(true);
    api.sim(1 / 30, warm);
  }, { warm, fps, q: process.env.AL_QUALITY || 'high' });
  const tStart = Date.now();
  for (let i = 0; i < count; i++) {
    await ev(() => window.AFTERLIGHT.api.frame(1 / 30));
    await page.screenshot({ path: path.join(dir, `f${String(warm + i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 84 });
    if (i % 60 === 0) console.log(`  frame ${warm + i} (${((Date.now() - tStart) / (i + 1)).toFixed(0)} ms/frame)`);
  }
  const end = await ev(() => window.AFTERLIGHT.api.status());
  fs.writeFileSync(path.join(OUT, `clip-${warm}.json`), JSON.stringify(end, null, 2));
  console.log(`captured frames ${warm}..${warm + count - 1}; status`, JSON.stringify(end));
}

report.console = console_.slice(-30);
if (MODE !== 'clip') {
  const errs = await ev(() => window.AFTERLIGHT.api.errors());
  check('no runtime errors', errs.length === 0, errs.join(' | '));
}
fs.writeFileSync(path.join(OUT, `report-${MODE}${process.env.AL_WARM ? '-' + process.env.AL_WARM : ''}.json`), JSON.stringify(report, null, 2));
await browser.close();
const failed = report.checks.filter((c) => !c.ok);
if (report.checks.length) console.log(`\n${report.checks.length - failed.length}/${report.checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
