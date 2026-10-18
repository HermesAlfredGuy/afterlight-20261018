// Perf probe: how expensive is a frame in this software-rendered browser?
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
const out = await page.evaluate(() => {
  const api = window.AFTERLIGHT.api;
  api.setManual(true);
  api.start('trial');
  const t = (label) => {
    const t0 = performance.now();
    for (let i = 0; i < 3; i++) api.frame(1 / 30);
    return { label, ms: +((performance.now() - t0) / 3).toFixed(1) };
  };
  const high = t('high@1280');
  api.setQuality('low');
  api.start('trial');
  const low = t('low@1280');
  api.setLook('vesper');
  return { high, low, gl: api.webgl() };
});
console.log(JSON.stringify(out, null, 2));
await page.screenshot({ path: '/opt/data/cache/scratch/perfprobe.png' });
await browser.close();
