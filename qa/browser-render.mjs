/** Optional real-browser regression. Needs Playwright; see qa/README.md. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const port = process.env.QA_PORT || '3019';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite did not start')), 20000);
    const finish = callback => value => { clearTimeout(timer); callback(value); };
    server.on('error', finish(reject));
    server.on('exit', code => finish(reject)(new Error(`Vite exited ${code}`)));
    server.stderr.on('data', data => process.stderr.write(data));
    server.stdout.on('data', data => { if (String(data).includes('Local:')) finish(resolve)(); });
  });
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const mode of ['different', 'same', 'pending', 'unlinked']) {
    await page.goto(`http://127.0.0.1:${port}/qa/browser-editor.html?mode=${mode}`);
    await page.locator('#comm-box-1').waitFor();
    assert(await page.locator('[id^="comm-box-"]').count() <= 480);
    await page.keyboard.press('End');
    await page.locator('#comm-box-3000').waitFor({ timeout: 10000 });
    assert(await page.locator('[id^="comm-box-"]').count() <= 480);
    await page.keyboard.press('Home');
    await page.locator('#comm-box-1').waitFor({ timeout: 10000 });
    if (mode === 'unlinked') {
      await page.getByTitle('ישנן 3000 שורות לא מקושרות', { exact: true }).click();
      assert.equal(await page.locator('[data-unlinked-panel] [id^="comm-box-"]').count(), 60);
      await page.locator('[data-unlinked-panel] #comm-box-60').scrollIntoViewIfNeeded();
      await page.getByTitle('עמוד הבא', { exact: true }).click();
      await page.locator('[data-unlinked-panel] #comm-box-61').waitFor();
      const firstRow = await page.locator('[data-unlinked-panel] #comm-box-61').boundingBox();
      assert(firstRow && firstRow.y >= 0 && firstRow.y < 800, 'new pages start at their first row');
      await page.getByTitle('סגור', { exact: true }).click();
    }
    // Editing a line must keep Home/End available to the input instead of jumping the document.
    await page.locator('#comm-box-1 button[title^="ערוך קישור ידנית"]').click();
    const input = page.locator('input[type="number"]');
    await input.focus();
    await input.press('End');
    await page.getByText('עריכת קישור שורת פירוש #1', { exact: true }).waitFor();
    await page.keyboard.press('Escape'); // close with the modal's button if Escape is not bound
    if (await input.isVisible()) await page.locator('.fixed.inset-0 button').first().click();
    console.log(`PASS browser ${mode}: bounded DOM, Home/End, modal editing and pending pagination`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.kill();
}
