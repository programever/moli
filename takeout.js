#!/usr/bin/env node
// Drive Google Takeout in the logged-in browser.
//   node takeout.js create <year> [more years]   ask Google to pack "Photos from <year>" (zip files, 10 GB each)
//   node takeout.js status           print what the Takeout manage page says
//   node takeout.js download         download all finished zip files to ~/photos/takeout
const fs = require('fs');
const path = require('path');
const os = require('os');
const { connect } = require('./lib/browser');

const DATA = process.env.MOLI_DATA || path.join(os.homedir(), 'photos');
const ZIPS = path.join(DATA, 'takeout');

async function create(page, years) {
  await page.goto('https://takeout.google.com/settings/takeout', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.locator('text=Deselect all').first().click();
  await page.waitForTimeout(1000);
  await page.locator("input[aria-label='Select Google Photos']").click();
  await page.waitForTimeout(1000);
  await page.locator('text=All photo albums included').first().click();
  await page.waitForTimeout(1500);
  const dialog = page.locator('[role=dialog]');
  await dialog.locator('text=Deselect all').first().click();
  await page.waitForTimeout(800);
  for (const year of years) {
    await dialog.locator(`text=Photos from ${year}`).first().click();
    await page.waitForTimeout(800);
  }
  // The OK button is not a real <button>, and it only reacts to a real mouse click.
  const ok = dialog.getByText('OK', { exact: true }).locator('visible=true').first();
  const box = await ok.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1500);
  const summary = await page.innerText('body');
  if (!summary.includes(`${years.length} photo album${years.length > 1 ? 's' : ''} selected`)) throw new Error('album choice did not stick');
  await page.locator("button:has-text('Next step')").click();
  await page.waitForTimeout(2000);
  const size = page.locator('[role=combobox], [role=listbox]').filter({ hasText: '2 GB' }).first();
  await size.scrollIntoViewIfNeeded();
  await size.click();
  await page.waitForTimeout(1000);
  await page.locator("[role=option]:has-text('10 GB')").first().click();
  await page.waitForTimeout(1000);
  await page.locator("button:has-text('Create export')").click();
  await page.waitForTimeout(3000);
  const text = await page.innerText('body');
  if (!text.includes('Google is creating a copy')) throw new Error('export did not start:\n' + text.slice(0, 500));
  console.log(`export for ${years.join(', ')} started`);
}

async function status(page) {
  await page.goto('https://takeout.google.com/manage', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const t = await page.innerText('body');
  const i = t.indexOf('Summary');
  console.log(t.slice(i, i + 900));
}

// The manage page lists finished exports. Each export page has one "Download part N" link per zip.
// Chromium saves the files in ~/Downloads. Google asks for the password again before the first
// download; if that happens, Iker must type it on the noVNC screen, then run this command again.
async function download(page) {
  await page.goto('https://takeout.google.com/manage', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const archives = await page.locator('a[href*="/manage/archive/"]').evaluateAll((as) => [...new Set(as.map((a) => a.href))]);
  if (!archives.length) { console.log('no finished export yet'); return; }
  await page.goto(archives[0], { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const parts = await page.locator('a[aria-label="Download"], a[aria-label^="Download part"]').count();
  if (!parts) { console.log('no download links on', archives[0]); return; }
  for (let i = 0; i < parts; i++) {
    await page.locator('a[aria-label="Download"], a[aria-label^="Download part"]').nth(i).click({ noWaitAfter: true });
    await page.waitForTimeout(4000);
    if (page.url().includes('accounts.google.com')) {
      console.log('PASSWORD NEEDED: Google asks Iker to type the password on the noVNC screen. After that, run "node takeout.js download" again.');
      return;
    }
    console.log(`part ${i + 1} of ${parts} started, Chromium saves it in ~/Downloads`);
  }
  console.log('when no *.crdownload file is left in ~/Downloads, move the zip files to ' + ZIPS);
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  const arg = args[0];
  const { page } = await connect();
  if (cmd === 'create' && args.length && args.every((y) => /^\d{4}$/.test(y))) await create(page, args);
  else if (cmd === 'status') await status(page);
  else if (cmd === 'download') await download(page);
  else { console.log('use: node takeout.js create <year> | status | download'); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('takeout failed:', e.message); process.exit(1); });
