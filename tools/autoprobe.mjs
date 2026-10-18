// Autopilot trace: where does the scripted pilot actually go?
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
await page.bringToFront();
const rows = await page.evaluate(() => {
  const api = window.AFTERLIGHT.api;
  api.setManual(true);
  api.start('trial');
  api.setAuto(true);
  const out = [];
  for (let i = 0; i < 30 * 60; i++) {
    api.sim(1 / 30, 1);
    if (i % 30 === 0) {
      const s = api.status();
      const g = api.gates()[Math.min(s.gateIndex, 13)];
      const d = Math.hypot(g.x - s.x, g.z - s.z);
      const err = Math.atan2(g.x - s.x, g.z - s.z) - s.heading;
      out.push(`${String(i / 30).padStart(3)}s gate=${s.gateIndex} rings=${s.gatesPassed} pos=(${s.x},${s.alt},${s.z}) v=${s.speed} g=${s.gamma} b=${s.bank} dist=${d.toFixed(0)} err=${err.toFixed(2)} clips=${s.clips}`);
      if (s.state !== 'flying') break;
    }
  }
  return out;
});
console.log(rows.join('\n'));
await browser.close();
