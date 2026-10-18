// Sea probe: isolate open water, and a wide vista, so sea colour is judged without islands in frame.
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
const shots = [
  ['sea-open', -1600, 320, 1700, Math.PI * 0.75, 60],
  ['sea-vista', -980, 210, 980, Math.PI * 0.78, 58],
  ['sea-high', 0, 620, 900, Math.PI, 60],
];
for (const [name, x, y, z, heading, sp] of shots) {
  await page.evaluate(({ x, y, z, heading, sp }) => {
    const api = window.AFTERLIGHT.api;
    api.setManual(true);
    api.start('trial');
    api.teleport(x, y, z, heading, sp);
    api.setAuto(false);
    api.frame(1 / 30);
    api.frame(1 / 30);
  }, { x, y, z, heading, sp });
  await page.screenshot({ path: `/opt/data/projects/afterlight-20261018/build/${name}.png` });
  console.log('shot', name);
}
await browser.close();
