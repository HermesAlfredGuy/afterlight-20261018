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
  api.setManual(true);
  api.setLook('vesper');
  api.start('trial');
  api.seek(1, 62);
  api.setAuto(true);
  api.sim(1 / 30, 40);
  api.setAuto(false);
  api.frame(1 / 30);
  return api.craftBox();
});
console.log(JSON.stringify(out));
const span = out.w;
const vfov = (out.fov * Math.PI) / 180;
const aspect = 1280 / 720;
const frameW = 2 * out.camDist * Math.tan(vfov / 2) * aspect;
console.log('craft span', span, 'frame width at craft', frameW.toFixed(1), 'fraction', (span / frameW).toFixed(3));
await browser.close();
