#!/usr/bin/env node
// Drive Google Takeout in the logged-in browser.
//   node takeout.js create <year> [more years]   ask Google to pack "Photos from <year>" (zip files, 10 GB each)
//   node takeout.js status           print what the Takeout manage page says
//   node takeout.js download [N|id]  start the downloads of export N on the manage page (0 = newest) or of the export whose id contains <id>
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

// Files already on disk from this export: running downloads (*.crdownload) and finished zips.
// Google starts part 1 by itself after Iker types the password, so this tells which parts are
// already started and which still need a click.
function filesOnDisk() {
  const dirs = [path.join(os.homedir(), 'Downloads'), ...fs.readdirSync('/tmp').filter((d) => d.startsWith('playwright-artifacts-')).map((d) => path.join('/tmp', d))];
  let n = 0;
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const file = path.join(d, f);
      if (!fs.statSync(file).isFile()) continue;
      if (f.endsWith('.crdownload')) { n++; continue; }
      const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(2); fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd);
      if (b.toString() === 'PK') n++;
    }
  }
  return n;
}

// The manage page lists finished exports, newest first; `which` picks one: a number (0 = newest)
// or a piece of the export's id from its address, which is safer when new exports appear.
// Each export page has one "Download part N of M" link per zip. Chromium saves the files in
// ~/Downloads. Google asks for the password again before the first download; if that happens,
// Iker must type it on the noVNC screen, then this command runs again (fetch-export.sh does that).
//
// Which parts still need a click? Two things are known: how many files of this export are on
// disk (running downloads and finished zips), and which links this code already clicked
// (remembered in ~/photos/takeout/started.json, so the 5-minute loop never starts a part twice).
// Google usually hides the link of a part that was downloaded, but not always, so the links on
// the page alone are not trusted. On 2026-10-05 the old code compared the number of files on
// disk with the number of links left on the page and skipped part 2 of 3 of the 2023-2024 export.
const STARTED = path.join(ZIPS, 'started.json');
const LINKS = 'a[aria-label="Download"], a[aria-label^="Download part"]';

function loadStarted() { try { return JSON.parse(fs.readFileSync(STARTED, 'utf8')); } catch { return {}; } }
function saveStarted(m) { fs.mkdirSync(ZIPS, { recursive: true }); fs.writeFileSync(STARTED, JSON.stringify(m, null, 1)); }

async function download(page, which = 0) {
  await page.goto('https://takeout.google.com/manage', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const archives = await page.locator('a[href*="/manage/archive/"]').evaluateAll((as) => [...new Set(as.map((a) => a.href))]);
  if (!archives.length) { console.log('no finished export yet'); return; }
  const archive = (typeof which === 'string' ? archives.find((a) => a.includes(which)) : archives[which]) || archives[0];
  const id = archive.split('/').pop();
  await page.goto(archive, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const labels = await page.locator(LINKS).evaluateAll((as) => as.map((a) => a.getAttribute('aria-label')));
  if (!labels.length) { console.log('no download links on', archive, '(every part was downloaded already)'); return; }
  const total = Math.max(1, ...labels.map((l) => Number((l.match(/of (\d+)/) || [])[1] || 1)));
  const started = loadStarted();
  const onDisk = filesOnDisk();
  // A part clicked just before Google asked for the password is only "pending": Google starts it
  // by itself once Iker has typed the password. If a new file has appeared on disk since that
  // click, the part is running. If not, forget the click, so the part is clicked again below.
  for (const [key, v] of Object.entries(started)) {
    if (v && v.pending) { if (onDisk > v.onDisk) started[key] = v.time; else delete started[key]; }
  }
  saveStarted(started);
  if (onDisk >= total) { console.log(`all ${total} part(s) already started`); return; }
  let needed = total - onDisk;
  for (const label of labels) {
    if (needed <= 0) break;
    const key = `${id} ${label}`;
    if (started[key]) { console.log(`${label}: already started earlier, skipped`); continue; }
    await page.locator(`a[aria-label="${label}"]`).first().click({ noWaitAfter: true });
    await page.waitForTimeout(4000);
    if (page.url().includes('accounts.google.com')) {
      started[key] = { pending: true, onDisk, time: new Date().toISOString() }; saveStarted(started);
      console.log('PASSWORD NEEDED: Google asks Iker to type the password on the noVNC screen. After that, run "node takeout.js download" again.');
      return;
    }
    started[key] = new Date().toISOString(); saveStarted(started);
    needed--;
    console.log(`${label} started, Chromium saves it in ~/Downloads`);
  }
  console.log('when no *.crdownload file is left in ~/Downloads, move the zip files to ' + ZIPS);
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  const arg = args[0];
  const { page } = await connect();
  if (cmd === 'create' && args.length && args.every((y) => /^\d{4}$/.test(y))) await create(page, args);
  else if (cmd === 'status') await status(page);
  else if (cmd === 'download') await download(page, arg && !/^\d+$/.test(arg) ? arg : Number(arg) || 0);
  else { console.log('use: node takeout.js create <year> | status | download'); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('takeout failed:', e.message); process.exit(1); });
