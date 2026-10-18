// Quick live probe: print console + page errors while the game boots.
import { chromium } from 'playwright';
const URL = process.env.AL_URL || 'http://127.0.0.1:8099/index.html';
const wait = Number(process.env.AL_WAIT || 12000);
const browser = await chromium.launch({
  headless: process.env.AL_HEADFUL !== '1',
  channel: process.env.AL_HEADFUL !== '1' ? 'chromium' : undefined,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 6).join('\n')}`));
page.on('requestfailed', (r) => console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(wait);
const info = await page.evaluate(() => ({
  ready: document.documentElement.dataset.ready || null,
  hasApi: !!window.AFTERLIGHT,
  errors: window.__AL_ERRORS || [],
  fatal: document.getElementById('fatal')?.hidden === false ? document.getElementById('fatal-msg')?.textContent : null,
}));
console.log('STATE', JSON.stringify(info, null, 2));
await page.screenshot({ path: process.env.AL_SHOT || '/opt/data/cache/scratch/probe.png' });
await browser.close();
