// Verify the DEPLOYED build (GitHub Pages), not the local copy: boot, play, score, screenshot.
import { chromium } from 'playwright';
const URL = process.env.AL_URL || 'https://hermesalfredguy.github.io/afterlight-20261018/';
const OUT = '/opt/data/projects/afterlight-20261018/build';
const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const t0 = Date.now();
await page.goto(URL, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 180000 });
console.log('booted live build in', Date.now() - t0, 'ms');
await page.click('[data-testid="start"]');
const play = await page.evaluate(() => {
  const api = window.AFTERLIGHT.api;
  api.setManual(true);
  api.setAuto(true);
  api.seek(1, 62);
  api.sim(1 / 30, 240);            // 8 s of scripted flight through rings
  return api.status();
});
console.log('after 8 s of flight:', JSON.stringify(play));
await page.evaluate(() => window.AFTERLIGHT.api.frame(1 / 30));
await page.screenshot({ path: OUT + '/live-desktop.png' });
const gates = await page.evaluate(() => window.AFTERLIGHT.api.gates());
console.log('gates passed:', gates.passed, '/', gates.total, 'score', gates.score);
console.log('page errors:', errs.length, errs.slice(0, 3).join(' | '));
await browser.close();
