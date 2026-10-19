// AFTERLIGHT — pass-2 capture tool. Produces the real deliverable screenshots from the LIVE
// build (npm run serve), not mocks. Every shot is a deterministic, scripted pose driven through
// window.AFTERLIGHT.api in manual mode, so re-running gives the same frame.
//
//   node tools/shots2.mjs                       # all shots, both viewports, vesper
//   AL_ONLY=menu node tools/shots2.mjs          # one shot
//   AL_VIEW=1440x900 node tools/shots2.mjs      # one viewport
//
// Output: docs/pass2/<viewport>/<shot>.png  +  build/pass2/shots.json (numbers per shot)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/opt/data/projects/afterlight-20261018';
const OUT = path.join(ROOT, 'docs/pass2');
const LOG = path.join(ROOT, 'build/pass2/shots.json');
const URL = process.env.AL_URL || 'http://127.0.0.1:8099/index.html';
const ONLY = (process.env.AL_ONLY || '').split(',').filter(Boolean);
const VIEWS = (process.env.AL_VIEW || '1440x900,390x844').split(',').filter(Boolean);
const LOOK = process.env.AL_LOOK || 'vesper';
fs.mkdirSync(OUT, { recursive: true });

/* Each shot is a string of JS run in the page against the api. Keep them deterministic:
   manual mode + fixed dt, never wall-clock. */
const SHOTS = [
  {
    name: 'menu', screen: 'menu', note: 'title frame: scrim + craft on a live hero pass, no blur',
    js: `a.setLook(LOOK); a.menu(); a.sim(1/30, 600);`,
  },
  {
    name: 'bank', note: 'clean bank: 29 deg bank, full aileron + rudder, outer panels flexed',
    js: `a.start('trial'); a.seek(2, 150, 58); a.sim(1/30, 14); a.key('rollRight', true);
         a.sim(1/30, 10); a.key('rollRight', false); a.frame(1/30);`,
  },
  {
    name: 'stall', note: 'stall recovery: airbrake on, speed below stall, buffet live',
    js: `a.start('free'); a.seek(6, 240, 56); a.brake(true); a.sim(1/30, 150); a.frame(1/30);`,
  },
  {
    name: 'squall', note: 'squall: pooled gust, body language, ribbon flared',
    js: `a.start('free'); a.seek(3, 90, 56); a.sim(1/30, 20); a.key('squall', true);
         a.sim(1/30, 6); a.key('squall', false); a.frame(1/30);`,
  },
  {
    name: 'arch', probe: true, note: 'under the aqueduct: bay, ring and craft all readable',
    js: `a.start('trial'); a.seek(4, 46, 56); a.setAuto(true); a.sim(1/30, 78);
         a.setAuto(false); a.frame(1/30);`,
  },
  {
    name: 'vista', probe: true, note: 'wide vista low over the water: depth bands, aerial perspective',
    js: `a.start('free'); a.teleport(-980, 92, -1320, 0.66, 60); a.sim(1/30, 40);
         a.frame(1/30);`,
  },
];

const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--no-sandbox', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'],
});

const log = { url: URL, look: LOOK, shots: [] };

for (const view of VIEWS) {
  const [w, h] = view.split('x').map(Number);
  const mobile = w < 700;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'en-GB',
    hasTouch: mobile, isMobile: mobile,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
  const dir = path.join(OUT, view);
  fs.mkdirSync(dir, { recursive: true });

  for (const shot of SHOTS) {
    if (ONLY.length && !ONLY.includes(shot.name)) continue;
    const info = await page.evaluate(({ js, look, screen }) => {
      const a = window.AFTERLIGHT.api;
      a.setManual(true);
      // eslint-disable-next-line no-new-func
      new Function('a', 'LOOK', js)(a, look);
      return {
        status: a.status(), pose: a.pose(), box: a.craftBox(), gl: a.webgl(),
        gate: a.gateView(), occl: a.craftOcclusion(), errors: a.errors(),
      };
    }, { js: shot.js, look: LOOK, screen: shot.screen });
    // two extra real frames so the HUD/DOM and the post chain settle on the final pose
    await page.evaluate(() => { window.AFTERLIGHT.api.frame(1 / 30); window.AFTERLIGHT.api.frame(1 / 30); });
    await page.waitForTimeout(180);
    const file = path.join(dir, `${shot.name}.png`);
    await page.screenshot({ path: file });
    log.shots.push({ view, name: shot.name, note: shot.note, file, ...info, pageErrors: errs.slice() });
    console.log(`  ${view}/${shot.name}.png  bank=${info.pose.visualRoll.toFixed(2)} flex=${info.pose.flex.toFixed(3)} ` +
      `elevons=${info.pose.elevonBoth.toFixed(2)}/${info.pose.elevonDiff.toFixed(2)} rud=${info.pose.rudder.toFixed(2)} ` +
      `buffet=${info.pose.buffet.toFixed(2)} flare=${info.pose.flare.toFixed(2)} span=${(info.box.ndc[1] - info.box.ndc[0]).toFixed(2)} ` +
      `calls=${info.gl.drawCalls} tris=${info.gl.triangles}`);
  }
  await ctx.close();
}

fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, JSON.stringify(log, null, 1));
console.log(`\nwrote ${LOG}`);
await browser.close();
