const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto('https://takeout.google.com/manage', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const i = t.indexOf('Status'); console.log(t.slice(i, i + 700));
  const archives = await page.locator('a[href*="/manage/archive/"]').evaluateAll(as => [...new Set(as.map(a => a.href))]);
  console.log('ORDER', archives.map(a => a.split('/').pop().slice(0, 8)).join(' '));
  await page.goto(archives[0], { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  const t2 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const j = t2.indexOf('Export summary'); console.log('FIRST', archives[0].split('/').pop().slice(0, 8), t2.slice(j, j + 500));
  await page.close(); await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
