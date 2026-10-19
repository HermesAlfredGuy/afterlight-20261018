// Diagnose the black frame: reproduce the exact moment and ask what is in front of the camera.
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
const out = await page.evaluate(() => {
  const api = window.AFTERLIGHT.api;
  api.setManual(true);
  api.setLook('vesper');
  api.setQuality('high');
  api.start('trial');
  api.seek(3, 30);
  api.setAuto(true);
  const rows = [];
  for (let i = 0; i < 400; i++) {
    api.sim(1 / 30, 1);
    if (i >= 390) rows.push({ i, front: api.whatsInFront(3), diag: api.camDiag() });
  }
  return rows;
});
for (const r of out) console.log(r.i, JSON.stringify(r.diag), JSON.stringify(r.front));
await browser.close();
