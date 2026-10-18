// Input probe: does a real DOM key event reach the game's key map, and does it bank the craft?
import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true, channel: 'chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 120000 });
await page.click('[data-testid="start"]');
await page.waitForTimeout(800);
console.log('before', JSON.stringify(await page.evaluate(() => window.AFTERLIGHT.api.status())));
await page.keyboard.down('KeyD');
await page.waitForTimeout(400);
console.log('held ', JSON.stringify(await page.evaluate(() => ({ keys: { ...window.AFTERLIGHT.game.keys }, s: window.AFTERLIGHT.api.status() }))));
await page.waitForTimeout(400);
await page.keyboard.up('KeyD');
console.log('after', JSON.stringify(await page.evaluate(() => ({ keys: { ...window.AFTERLIGHT.game.keys }, s: window.AFTERLIGHT.api.status() }))));
await page.waitForTimeout(200);
console.log('decay', JSON.stringify(await page.evaluate(() => window.AFTERLIGHT.api.status())));
await browser.close();
