import { webkit, devices } from 'playwright';

// Local diagnostic only: a fresh browser context, routed HTML, no application
// code or user storage. Every Cache promise has a rejection handler.
const browser = await webkit.launch({ headless: true });
const result = [];
try {
  for (const mode of ['control', 'cache']) {
    const context = await browser.newContext({ ...devices['iPhone 15'], serviceWorkers: 'block' });
    await context.route('https://cache-reload.invalid/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Cache reload probe</title><p>Local browser diagnostic</p>' }));
    const page = await context.newPage(), errors = [], crashes = [];
    let iteration = -1;
    page.on('pageerror', error => errors.push({ iteration, name: error.name, message: error.message, stack: error.stack }));
    page.on('crash', () => crashes.push(iteration));
    await page.goto('https://cache-reload.invalid/');
    const available = await page.evaluate(() => Boolean(globalThis.caches?.open));
    for (iteration = 0; iteration < 25; iteration++) {
      await page.evaluate(mode => {
        const read = async () => { const cache = await caches.open('isolated-reload-probe'); return cache.keys(); };
        const tasks = Array.from({ length: 30 }, () => mode === 'cache' ? read() : Promise.resolve([]));
        globalThis.handledCacheProbe = Promise.all(tasks).catch(() => []);
      }, mode);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    await context.close();
    result.push({ mode, available, iterations: iteration, errors, crashes });
  }
} finally { await browser.close(); }
console.log(JSON.stringify(result, null, 2));
