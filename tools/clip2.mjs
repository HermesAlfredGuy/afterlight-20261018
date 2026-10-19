// AFTERLIGHT — 1080p flight clip. Drives the real build frame by frame through a scripted
// 15 s sortie: autopilot banking through the rings, one stall + dive recovery, two squalls,
// then the run on to the beacon. Deterministic (window.AFTERLIGHT.api + fixed 1/30 s steps),
// so the same clip can be re-rendered at any time.
//
//   node tools/clip2.mjs [frames]
//   ffmpeg -framerate 30 -i build/pass2/clip2/f%04d.jpg -c:v libx264 -crf 20 -pix_fmt yuv420p \
//          -movflags +faststart docs/pass2/afterlight-pass2-1080p.mp4
import { chromium } from 'playwright';
import fs from 'node:fs';

const W = 1920, H = 1080, FPS = 30;
const TOTAL = Number(process.argv[2] || 450);      // 15 s
const OUT = 'build/pass2/clip2';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// The sortie as a per-frame mark table. Ops: start | auto | brake | key | squall.
const MARK = {
  0: [{ op: 'start' }],
  // The squall has to be spent while the input actually reaches the craft: in manual mode the key
  // is the input, under the autopilot the autopilot owns it (measured: manual flare 0.96 and
  // +25 m/s, autopilot flare 0.00). The stall is also staged higher than the route's own descent:
  // flown at 7 m over sunlit water the craft washes out and the stall beat stops reading, which is
  // exactly the frame a viewer judges the animation by.
  55: [{ op: 'auto', v: false }],
  57: [{ op: 'key', k: 'squall', v: true }],
  70: [{ op: 'key', k: 'squall', v: false }],
  145: [{ op: 'brake', v: true }],
  255: [{ op: 'brake', v: false }, { op: 'key', k: 'pitchUp', v: true }],
  295: [{ op: 'key', k: 'pitchUp', v: false }],
  305: [{ op: 'auto', v: true }],
};

const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--no-sandbox', '--mute-audio', '--hide-scrollbars', '--force-device-scale-factor=1'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-GB' });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });

const t0 = Date.now();
let line = null;
for (let f = 0; f < TOTAL; f++) {
  const due = MARK[f] || [];
  line = await page.evaluate(({ due }) => {
    const a = window.AFTERLIGHT.api;
    for (const m of due) {
      if (m.op === 'start') { a.setManual(true); a.start('trial'); a.seek(8, 110, 58); a.setAuto(true); }
      else if (m.op === 'auto') a.setAuto(m.v);
      else if (m.op === 'brake') a.brake(m.v);
      else if (m.op === 'key') a.key(m.k, m.v);
    }
    a.frame(1 / 30);
    const s = a.status();
    const p = a.pose();
    return { speed: s.speed, alt: s.alt, gate: s.gateIndex, bank: s.bank, buffet: p.buffet, flare: p.flare, flex: p.flex, elevons: p.elevonBoth };
  }, { due });
  await page.screenshot({ path: `${OUT}/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 88 });
  if (f % 30 === 0 || f === TOTAL - 1) {
    console.log(`f${String(f).padStart(4)} t=${(f / FPS).toFixed(1)}s speed ${String(line.speed).padStart(5)} alt ${String(line.alt).padStart(5)} ` +
      `gate ${line.gate} bank ${line.bank} buffet ${line.buffet.toFixed(2)} flare ${line.flare.toFixed(2)} elevon ${line.elevons.toFixed(2)} flex ${line.flex.toFixed(3)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}
console.log(`\n${TOTAL} frames -> ${OUT}   ${((Date.now() - t0) / 1000).toFixed(0)}s wall`);
await browser.close();
