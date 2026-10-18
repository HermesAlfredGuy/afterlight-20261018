// Term-by-term sea pass isolation with bloom disabled: shows which layer washes the water out.
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
  window.AFTERLIGHT.game.bloom.enabled = false;
});
for (const [dbg, name] of [[4, 'refl'], [5, 'glit'], [6, 'foam'], [7, 'haze'], [0, 'final']]) {
  await page.evaluate((dbg) => {
    window.AFTERLIGHT.game.world.seaMat.uniforms.uDebug.value = dbg;
    window.AFTERLIGHT.api.frame(1 / 30);
    window.AFTERLIGHT.api.frame(1 / 30);
  }, dbg);
  await page.screenshot({ path: `/opt/data/projects/afterlight-20261018/build/nb-${name}.png` });
}
await browser.close();
console.log('done');
