// AFTERLIGHT — pass-2 probe: boots the real build and interrogates the new animation rig,
// the aerial grading, the gate framing and the craft occlusion. Prints JSON to stdout.
//   node tools/probe2.mjs smoke
//   node tools/probe2.mjs rig      (elevon/rudder/flex/ribbon response to the stick)
//   node tools/probe2.mjs occl     (craft + ring occlusion at the arch)
//   node tools/probe2.mjs menu     (composed menu frame numbers)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/opt/data/projects/afterlight-20261018';
const OUT = process.env.AL_OUT || path.join(ROOT, 'build/pass2');
const URL = process.env.AL_URL || 'http://127.0.0.1:8099/index.html';
const MODE = process.argv[2] || 'smoke';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
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
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const api = (expr) => page.evaluate(`window.AFTERLIGHT.api.${expr}`);

const out = { mode: MODE, errs: [], data: {} };

if (MODE === 'smoke') {
  out.data.status = await api('status()');
  out.data.webgl = await api('webgl()');
  out.data.aerial = await api('aerial()');
  out.data.craftBoxMenu = await api('craftBox()');
  out.data.poseMenu = await api('pose()');
  // fly a little with the real autopilot and re-read
  await api('start("race")');
  await api('setAuto(true)');
  await api('sim(1/30, 240)');
  out.data.status2 = await api('status()');
  out.data.poseFlight = await api('pose()');
  out.data.gateView = await api('gateView()');
  out.data.occl = await api('craftOcclusion()');
  await page.screenshot({ path: path.join(OUT, 'probe-smoke.png') });
}

if (MODE === 'rig') {
  await api('start("free")');
  out.data.neutral = await api('pose()');
  await api('key("rollRight", true)');
  await api('sim(1/30, 45)');
  out.data.rollRight = await api('pose()');
  await api('key("rollRight", false)');
  await api('key("rollLeft", true)');
  await api('sim(1/30, 90)');
  out.data.rollLeft = await api('pose()');
  await api('key("rollLeft", false)');
  await api('key("pitchUp", true)');
  await api('sim(1/30, 30)');
  out.data.pitchUp = await api('pose()');
  await api('key("pitchUp", false)');
  await api('key("pitchDown", true)');
  await api('sim(1/30, 40)');
  out.data.pitchDown = await api('pose()');
  await api('key("pitchDown", false)');
  await api('sim(1/30, 60)');
  out.data.settled = await api('pose()');
  out.data.ribbonStraight = await api('ribbon()');
  // stall it: brake hard from altitude, then read the buffet + ribbon flare
  await api('brake(true)');
  await api('sim(1/30, 150)');
  out.data.stallBrake = await api('pose()');
  out.data.status = await api('status()');
  await api('brake(false)');
  await api('sim(1/30, 60)');
  out.data.ribbonStall = await api('ribbon()');
  await page.screenshot({ path: path.join(OUT, 'probe-rig.png') });
}

if (MODE === 'occl') {
  // seat the craft on the approach to the arch gate (index 4) and measure what hides it
  out.data.before = {};
  await api('start("race")');
  await api('seek(4, 60, 56)');
  await api('sim(1/30, 90)');
  out.data.atArch = await api('status()');
  out.data.craftBox = await api('craftBox()');
  out.data.occl = await api('craftOcclusion()');
  out.data.gateView = await api('gateView()');
  out.data.inFront = await api('whatsInFront(3)');
  await page.screenshot({ path: path.join(OUT, 'probe-arch.png') });
}

if (MODE === 'menu') {
  await api('resetMenu()');
  // track the hero-pass altitude hold: it must settle, not hunt
  const track = [];
  for (let i = 0; i < 90; i++) {
    await api('sim(1/30, 10)');
    const st = await api('status()');
    track.push([+st.time.toFixed(1), st.alt, +st.bank.toFixed(2)]);
  }
  const alts = track.map((t) => t[1]);
  out.data.track = track.filter((_, i) => i % 6 === 0);
  out.data.altRange = [Math.min(...alts), Math.max(...alts)];
  out.data.craftBox = await api('craftBox()');
  out.data.pose = await api('pose()');
  out.data.status = await api('status()');
  await page.screenshot({ path: path.join(OUT, 'probe-menu.png') });
}

out.errs = errs;
out.jsErrors = await api('errors()');
console.log(JSON.stringify(out, null, 1));
await browser.close();
