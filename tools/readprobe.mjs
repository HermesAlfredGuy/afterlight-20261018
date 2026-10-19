// AFTERLIGHT — pass 2b read-out probe. Every number here is measured off the real drawing
// buffer: it re-renders the SAME animation state with one rig channel zeroed and censuses the
// pixels that move, which is the only honest way to say "a deflection is visible".
//
//   node tools/readprobe.mjs            -> build/pass2/readprobe.json + a table on stdout
import { chromium } from 'playwright';
import fs from 'node:fs';

const W = 1440, H = 900;
const OUT = 'build/pass2/readprobe.json';

const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--no-sandbox', '--mute-audio', '--hide-scrollbars', '--force-device-scale-factor=1'],
});
const ctx2 = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-GB' });
const page = await ctx2.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });

// Mount the A/B census in-page. The two grabs MUST happen in the same task as their renders:
// a presented WebGL buffer is not readable from a later task.
await page.evaluate(() => {
  window.__ab = (mut) => {
    const game = window.AFTERLIGHT.game;
    const gl = game.renderer.getContext();
    const BW = gl.drawingBufferWidth, BH = gl.drawingBufferHeight;
    const grab = () => { const p = new Uint8Array(BW * BH * 4); gl.readPixels(0, 0, BW, BH, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
    const L = (p, i) => 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
    game.render();
    const A = grab();
    // eslint-disable-next-line no-new-func
    new Function('game', mut)(game);
    game.render();
    const B = grab();
    let changed = 0, big = 0, max = 0, sum = 0;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let y = 0; y < BH; y++) {
      for (let x = 0; x < BW; x++) {
        const i = (y * BW + x) * 4;
        const d = Math.abs(L(A, i) - L(B, i));
        sum += d;
        if (d > max) max = d;
        if (d > 6) { changed++; if (d > 18) big++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    const ndc = (x, y) => [+((x / BW) * 2 - 1).toFixed(3), +((1 - (y / BH) * 2)).toFixed(3)];
    return {
      changed, big, max: +max.toFixed(1), mean: +(sum / (BW * BH)).toFixed(2), px: BW * BH,
      bbox: changed ? [...ndc(x0, y0), ...ndc(x1, y1)] : null,
    };
  };
  window.__stats = (rect) => {
    const game = window.AFTERLIGHT.game;
    const gl = game.renderer.getContext();
    const BW = gl.drawingBufferWidth, BH = gl.drawingBufferHeight;
    const px = new Uint8Array(BW * BH * 4);
    gl.readPixels(0, 0, BW, BH, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const lum = (i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    const out = {};
    for (const [name, r] of Object.entries(rect)) {
      const x0 = Math.max(0, Math.round(r[0] * BW)), yTop = Math.round(r[1] * BH);
      const w = Math.max(1, Math.round(r[2] * BW)), h = Math.max(1, Math.round(r[3] * BH));
      const y0 = Math.max(0, BH - (yTop + h));
      const vals = [];
      for (let y = y0; y < Math.min(BH, y0 + h); y++) {
        for (let x = x0; x < Math.min(BW, x0 + w); x++) vals.push(lum((y * BW + x) * 4));
      }
      vals.sort((a, b) => a - b);
      const q = (p) => +vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))].toFixed(1);
      out[name] = { n: vals.length, mean: +(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)).toFixed(1), p10: q(0.1), p50: q(0.5), p90: q(0.9), p99: q(0.99) };
    }
    return out;
  };
});

const results = {};

// ------------------------------------------------------------------ 1. steady bank
const bank = await page.evaluate(() => {
  const a = window.AFTERLIGHT.api, g = window.AFTERLIGHT.game;
  a.setManual(true); a.start('trial'); a.seek(2, 150, 62); a.setAuto(false);
  g.input.pitch = 0; g.input.roll = 0;
  for (const k of ['pitchDown', 'pitchUp', 'rollRight', 'rollLeft']) a.key(k, false);
  for (let i = 0; i < 24; i++) { a.key('rollRight', true); a.frame(1 / 30); }
  for (let i = 0; i < 90; i++) { a.key('rollRight', Math.abs(a.status().bank) < 0.70); a.frame(1 / 30); }
  const s = a.status(), p = a.pose();
  return { bank: s.bank, speed: s.speed, alt: s.alt, box: g.craftBox(), pose: p };
});
const P = bank.pose;
const deg = (r) => +((r * 180) / Math.PI).toFixed(1);
async function ab(mut) { return page.evaluate((m) => window.__ab(m), mut); }
const channels = {
  elevonBoth: await ab(`game.craft.rig.setElevons(0, ${P.elevonDiff});`),
  elevonDiff: await ab(`game.craft.rig.setElevons(${P.elevonBoth}, 0);`),
  rudder: await ab(`game.craft.rig.setRudder(0);`),
  flex: await ab(`game.craft.rig.setFlex(0, 0);`),
};
// re-render the untouched pose for the reference frame the captures use
await page.evaluate(() => { window.AFTERLIGHT.game.render(); });
results.bank = {
  bankRad: +bank.bank.toFixed(3), bankDeg: deg(bank.bank), speed: bank.speed, alt: bank.alt,
  surfaceDeg: { elevonBoth: deg(P.elevonBoth), elevonDiff: deg(P.elevonDiff), rudder: deg(P.rudder), flex: deg(P.flex) },
  box: { w: bank.box.w, h: bank.box.h, camDist: bank.box.camDist, ndc: bank.box.ndc, fitsFrame: bank.box.fitsFrame },
  channels,
};

// ------------------------------------------------------------------ 2. the ribbon
results.ribbon = await page.evaluate(() => {
  const a = window.AFTERLIGHT.api, g = window.AFTERLIGHT.game;
  const m = g.craft.rig.ribbon.mat;
  const pos = g.craft.rig.ribbon.geo.attributes.position.array;
  const xs = [], zs = [];
  for (let r = 0; r < 14; r++) {
    const i = (r * 3 + 1) * 3;               // middle column of row r: the spine
    xs.push(+pos[i].toFixed(2)); zs.push(+pos[i + 2].toFixed(2));
  }
  const d2 = [];
  for (let i = 1; i < xs.length - 1; i++) d2.push(+(xs[i - 1] - 2 * xs[i] + xs[i + 1]).toFixed(3));
  let sign = 0, flips = 0;
  for (const v of d2) { const s = Math.sign(v); if (Math.abs(v) > 0.04 && s !== 0) { if (sign !== 0 && s !== sign) flips++; sign = s; } }
  const absMax = (arr) => +Math.max(...arr.map(Math.abs)).toFixed(2);
  return {
    additive: m.blending === 2, opacity: m.opacity, transparent: m.transparent,
    hasAlphaMap: !!m.alphaMap, depthWrite: m.depthWrite, strips: g.craft.ribbon.children.length,
    xs, zs, lateralPeak: absMax(xs), verticalPeak: absMax(zs),
    tipX: xs[13], midX: xs[6], curvFlips: flips, d2max: absMax(d2),
    bowK: +(xs[6] / (xs[13] || 1)).toFixed(2),
  };
});

// ------------------------------------------------------------------ 3. the rim, at the lighthouse
const lh = await page.evaluate(() => {
  const a = window.AFTERLIGHT.api, g = window.AFTERLIGHT.game, w = g.world;
  const capY = w.heroCapY ?? 200;
  const p = w.lighthouse ? w.lighthouse.group.position : { x: 0, y: capY - 6, z: 34 };
  a.teleport(p.x + 5, capY + 27, p.z + 230, Math.PI, 58);
  a.setAuto(false);
  for (const k of ['pitchDown', 'pitchUp', 'rollRight', 'rollLeft']) a.key(k, false);
  g.input.pitch = 0; g.input.roll = 0;
  for (let i = 0; i < 100; i++) a.frame(1 / 30);
  return { capY: +capY.toFixed(1), lighthouse: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], pos: [+g.craft.pos.x.toFixed(1), +g.craft.pos.y.toFixed(1), +g.craft.pos.z.toFixed(1)], box: g.craftBox() };
});
results.rim = { ...lh, ab: await ab('game.craftRim.k.value = 0;') };
await page.evaluate(() => { window.AFTERLIGHT.game.craftRim.k.value = 1; window.AFTERLIGHT.game.render(); });
results.rimOff = await page.evaluate(() => {
  const g = window.AFTERLIGHT.game;
  const b = g.craftBox();
  const [minX, maxX, minY, maxY] = b.ndc;
  const rect = [Math.max(0, minX * 0.5 + 0.5), Math.max(0, 0.5 - maxY * 0.5), Math.min(1, (maxX - minX) * 0.5), Math.min(1, (maxY - minY) * 0.5)];
  const bg = [rect[0], Math.min(0.96, rect[1] + rect[3] + 0.01), Math.max(0.02, rect[2]), 0.04];
  const on = window.__stats({ craft: rect, bg });
  g.craftRim.k.value = 0; g.render();
  const off = window.__stats({ craft: rect, bg });
  g.craftRim.k.value = 1; g.render();
  return { rect, bg, on, off };
});

results.errors = errs;
fs.mkdirSync('build/pass2', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));

console.log(`errors: ${errs.length}${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`);
console.log(`bank ${results.bank.bankDeg} deg (${results.bank.bankRad} rad) speed ${bank.speed} alt ${bank.alt}`);
console.log(`surfaces: elevonBoth ${results.bank.surfaceDeg.elevonBoth} deg  diff ${results.bank.surfaceDeg.elevonDiff} deg  rudder ${results.bank.surfaceDeg.rudder} deg  flex ${results.bank.surfaceDeg.flex} deg`);
console.log('zeroing      changed(>6)  strong(>18)   max dL  mean dL   change bbox (NDC x0,y0,x1,y1)');
for (const [k, v] of Object.entries(channels)) console.log(`  ${k.padEnd(11)} ${String(v.changed).padStart(8)} ${String(v.big).padStart(10)} ${String(v.max).padStart(8)} ${String(v.mean).padStart(8)}   ${v.bbox}`);
const R = results.ribbon;
console.log(`ribbon: additive ${R.additive} opacity ${R.opacity} alphaMap ${R.hasAlphaMap} strips ${R.strips} | lateral peak ${R.lateralPeak} m  vertical peak ${R.verticalPeak} m  tip ${R.tipX} mid ${R.midX}  curvature flips ${R.curvFlips}`);
console.log(`ribbon xs: ${R.xs.join(' ')}`);
console.log(`rim at lighthouse: craft lum on ${results.rimOff.on.craft.mean} / off ${results.rimOff.off.craft.mean} ; bg ${results.rimOff.on.bg.mean} ; A/B diff ${JSON.stringify(results.rim.ab)}`);
await browser.close();
