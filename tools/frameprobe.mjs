// Framing probe: measured craft extents vs camera distance so framing is set from numbers, not guesses.
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
const out = await page.evaluate(() => {
  const api = window.AFTERLIGHT.api;
  const runs = [];
  api.setManual(true);
  api.setLook('vesper');
  api.start('trial');
  for (const g of [1, 4, 9, 13]) {
    api.setAuto(false);
    api.seek(g, 62);
    api.setAuto(true);
    for (let i = 0; i < 30; i++) { api.sim(1 / 30, 8); if (i >= 12) runs.push(api.craftBox()); }
  }
  return runs;
});
const bad = out.filter((r) => !r.fitsFrame);
console.log(JSON.stringify(out[out.length - 1]));
console.log(`frames sampled ${out.length}, outside the viewport: ${bad.length}`);
for (const r of bad.slice(0, 5)) console.log('  crop ndc', JSON.stringify(r.ndc), 'camDist', r.camDist, 'cam', JSON.stringify(r.camPos), 'craft', JSON.stringify(r.pos), 'state', r.state);
const fr = out.map((r) => (r.ndc[1] - r.ndc[0]) / 2);
console.log('craft half-width in NDC: avg', (fr.reduce((a, b) => a + b, 0) / fr.length).toFixed(2));
console.log(JSON.stringify(out[out.length - 1]));
const span = out[out.length - 1].w;
const vfov = (out[out.length - 1].fov * Math.PI) / 180;
const aspect = 1280 / 720;
const frameW = 2 * out[out.length - 1].camDist * Math.tan(vfov / 2) * aspect;
console.log('craft span', span, 'frame width at craft', frameW.toFixed(1), 'fraction', (span / frameW).toFixed(3));
await browser.close();
