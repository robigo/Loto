// Run with Playwright installed: node tests/table-tabs-browser.cjs
const {chromium} = require('playwright');
const {readFile} = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({headless: true,
    ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})});
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({viewport: {width, height: 844}});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // All app requests use local files; no production accounts or services.
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'https://loto.test') return route.abort();
        const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(root + path.sep)) return route.abort();
        try {
          const body = await readFile(file);
          const contentType = file.endsWith('.js') ? 'application/javascript' :
            file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html';
          await route.fulfill({body, contentType});
        } catch { await route.fulfill({status: 404, body: ''}); }
      });
      await page.goto('https://loto.test/');
      await page.waitForFunction(() => !document.getElementById('random').disabled);
      assert.equal(await page.locator('#table-tabs [role=tab]').count(), 14);
      assert.equal(await page.locator('#tables > .panel:visible').count(), 1);
      for (const n of [1, 8, 10, 12, 14, 24]) {
        await page.locator(`#table-page-1 .numbers [data-number="${n}"]`).click();
      }
      await page.locator('#table-page-1 .strong [data-number="5"]').click();
      const fixed = await page.evaluate(() => window.lotoForm.getFixedDraw());
      await page.locator('#table-tab-14').click();
      assert.equal(await page.locator('#table-page-14').isVisible(), true);
      await page.locator('#table-tab-14').press('ArrowLeft');
      assert.equal(await page.locator('#table-tab-1').getAttribute('aria-selected'), 'true');
      await page.locator('#random').click();
      assert.deepEqual(await page.evaluate(() => window.lotoForm.getFixedDraw()), fixed);
      // Comparison still visits hidden tables; switching tabs preserves its marks.
      await page.locator('#validate').click();
      assert.equal(await page.locator('#tables .panel-status').filter({hasText: 'התאמות'}).count(), 14);
      await page.locator('#table-tab-2').click();
      assert.equal(await page.locator('#tables > .panel:visible').count(), 1);
      await page.locator('#analysis-tab').click();
      assert.equal(await page.locator('#ticket-panel').isVisible(), false);
      await page.locator('#systematic-tab').click();
      assert.equal(await page.locator('#systematic-panel').isVisible(), true);
      await page.locator('#past-tab').click();
      assert.equal(await page.locator('#table-page-2').isVisible(), true);
      await page.locator('#clear').click();
      assert.deepEqual(await page.evaluate(() => window.lotoForm.getFixedDraw()), fixed);
      assert.equal(await page.locator('#tables > .panel:visible').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.emulateMedia({media: 'print'});
      assert.equal(await page.locator('#tables > .panel:visible').count(), 14);
      assert.equal(await page.locator('#table-tabs').isVisible(), false);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: mobile/desktop tabs, real number state, generator, comparison, clear, mode switching, overflow and print.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
