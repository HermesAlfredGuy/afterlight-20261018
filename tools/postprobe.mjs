// Isolate post-processing: same frame with bloom on/off so colour contributions are measurable.
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
await page.evaluate(() => {
  const api = window.AFTERLIGHT.api;
  api.setManual(true);
  api.start('trial');
  api.teleport(-980, 210, 980, Math.PI * 0.78, 58);
  api.setAuto(false);
  api.frame(1 / 30); api.frame(1 / 30);
});
await page.screenshot({ path: '/opt/data/projects/afterlight-20261018/build/post-bloom.png' });
await page.evaluate(() => {
  const g = window.AFTERLIGHT.game;
  g.bloom.enabled = false;
  window.AFTERLIGHT.api.frame(1 / 30); window.AFTERLIGHT.api.frame(1 / 30);
});
await page.screenshot({ path: '/opt/data/projects/afterlight-20261018/build/post-nobloom.png' });
await page.evaluate(() => {
  const g = window.AFTERLIGHT.game;
  g.bloom.enabled = true;
  g.world.seaMat.uniforms.uDebug.value = 4; // reflection-only pass
  window.AFTERLIGHT.api.frame(1 / 30); window.AFTERLIGHT.api.frame(1 / 30);
});
await page.screenshot({ path: '/opt/data/projects/afterlight-20261018/build/post-refl.png' });
await browser.close();
console.log('done');
