// AFTERLIGHT — aerial-perspective evidence, measured on real rendered pixels.
//
// Renders one fixed pose, dumps the WebGL drawing buffer, switches the aerial grading off,
// renders again and diffs the two frames in-page. Reports how much of the frame the grading
// owns, how far it moves those pixels in luminance and saturation, and where they are.
// Runs against any build of the game (AL_URL), so the same measurement can be taken on the
// pass-1 live site and on this working tree.
//
//   node tools/aerialprobe.mjs
//   AL_URL=https://hermesalfredguy.github.io/afterlight-20261018/index.html node tools/aerialprobe.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.AL_URL || 'http://127.0.0.1:8099/index.html';
const LOOK = process.env.AL_LOOK || 'vesper';
const POSE = process.env.AL_POSE || 'vista';   // vista | low

const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--no-sandbox', '--mute-audio', '--hide-scrollbars', '--force-device-scale-factor=1'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'en-GB' });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });

const SAVE = process.env.AL_SAVE || '';       // directory for the before/after screenshots
if (SAVE) fs.mkdirSync(SAVE, { recursive: true });

const setup = ({ look, pose }) => {
  const a = window.AFTERLIGHT.api;
  a.setManual(true);
  if (a.setLook) a.setLook(look);
  a.start('free');
  if (pose === 'low') a.teleport(-980, 92, -1320, 0.66, 60);
  else a.teleport(-1180, 470, -1560, 0.62, 62);
  a.sim(1 / 30, 40);
  a.frame(1 / 30);
};
await page.evaluate(setup, { look: LOOK, pose: POSE });
if (SAVE) await page.screenshot({ path: `${SAVE}/aerial-graded-${POSE}.png` });
await page.evaluate(() => { window.AFTERLIGHT.api.setAerial(false); window.AFTERLIGHT.api.frame(1 / 30); });
if (SAVE) await page.screenshot({ path: `${SAVE}/aerial-plain-${POSE}.png` });
await page.evaluate(() => { window.AFTERLIGHT.api.setAerial(true); window.AFTERLIGHT.api.frame(1 / 30); });

const out = await page.evaluate(({ look, pose }) => {
  const g = window.AFTERLIGHT.game, a = window.AFTERLIGHT.api;
  const grab = () => {
    const gl = g.renderer.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { px, W, H };
  };
  a.setManual(true);
  if (a.setLook) a.setLook(look);
  a.start('free');
  if (pose === 'low') a.teleport(-980, 92, -1320, 0.66, 60);
  else a.teleport(-1180, 470, -1560, 0.62, 62);
  a.sim(1 / 30, 40);
  a.frame(1 / 30);
  const A = grab();
  // control: a deliberately different pose, to prove the sampler sees change at all
  a.teleport(-300, 260, -500, 2.4, 60);
  a.sim(1 / 30, 12);
  a.frame(1 / 30);
  const C = grab();
  a.teleport(pose === 'low' ? -980 : -1180, pose === 'low' ? 92 : 470, pose === 'low' ? -1320 : -1560, pose === 'low' ? 0.66 : 0.62, pose === 'low' ? 60 : 62);
  a.sim(1 / 30, 14);
  a.frame(1 / 30);
  const A2 = grab();                                  // back to the graded pose
  const hasDbg = typeof a.setAerial === 'function';
  let B = A2;
  if (hasDbg) { a.setAerial(false); a.frame(1 / 30); B = grab(); a.setAerial(true); a.frame(1 / 30); }

  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
  const diff = (P, Q) => {
    let changed = 0, total = 0, dLum = 0, dSat = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let i = 0; i < P.px.length; i += 4) {
      total++;
      const dr = Math.abs(P.px[i] - Q.px[i]);
      const dg = Math.abs(P.px[i + 1] - Q.px[i + 1]);
      const db = Math.abs(P.px[i + 2] - Q.px[i + 2]);
      if (dr + dg + db > 12) {
        changed++;
        const px = (i / 4) % P.W, py = Math.floor(i / 4 / P.W);
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        dLum += lum(P.px[i], P.px[i + 1], P.px[i + 2]) - lum(Q.px[i], Q.px[i + 1], Q.px[i + 2]);
        dSat += sat(P.px[i], P.px[i + 1], P.px[i + 2]) - sat(Q.px[i], Q.px[i + 1], Q.px[i + 2]);
      }
    }
    return {
      changedPct: +(100 * changed / total).toFixed(1),
      meanDLum: changed ? +(dLum / changed).toFixed(1) : 0,
      meanDSatPts: changed ? +(100 * dSat / changed).toFixed(1) : 0,
      bbox: changed ? [x0, y0, x1, y1] : null,
    };
  };
  return {
    hasDbg,
    control: diff(A2, C),
    aerialAB: hasDbg ? diff(A, B) : null,
    aerial: a.aerial ? a.aerial() : null,
    errors: a.errors(),
  };
}, { look: LOOK, pose: POSE });

const p = out.aerialAB;
console.log(`url:   ${URL}`);
console.log(`pose:  ${POSE}   look: ${LOOK}   A/B available: ${out.hasDbg}`);
if (out.aerial) console.log(`bands: ${JSON.stringify(out.aerial.bands)}`);
if (out.aerial) console.log(`haze(sRGB)=${out.aerial.hazeSRGB}  fogDensity=${out.aerial.fogDensity}  graded materials=${out.aerial.materials}`);
console.log(`\ncontrol (different pose): ${out.control.changedPct}% of pixels changed, mean dLum ${out.control.meanDLum}`);
if (p) {
  console.log(`aerial on vs off:        ${p.changedPct}% of pixels changed, mean dLum ${p.meanDLum}, mean dSat ${p.meanDSatPts} pts, bbox ${JSON.stringify(p.bbox)}`);
} else {
  console.log('aerial on vs off:        not measurable on this build (no setAerial in its api)');
}
if (out.errors.length) console.log('\nerrors:', out.errors.join(' | '));
await browser.close();
