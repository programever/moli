#!/usr/bin/env node
// Drive Google Takeout in the logged-in browser.
//   node takeout.js create <year>    ask Google to pack "Photos from <year>" (zip files, 10 GB each)
//   node takeout.js status           print what the Takeout manage page says
//   node takeout.js download         download all finished zip files to ~/photos/takeout
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { connect } = require('./lib/browser');

const DATA = process.env.MOLI_DATA || path.join(os.homedir(), 'photos');
const ZIPS = path.join(DATA, 'takeout');

async function create(page, year) {
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
  await dialog.locator(`text=Photos from ${year}`).first().click();
  await page.waitForTimeout(800);
  const checked = await dialog.locator('input[type=checkbox]:checked').count();
  if (checked !== 1) throw new Error(`expected 1 album ticked, got ${checked}`);
  // The OK button only reacts to a real mouse click, not to a scripted one.
  const ok = dialog.locator("button:has-text('OK')").first();
  const box = await ok.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1500);
  const summary = await page.innerText('body');
  if (!summary.includes('1 photo album selected')) throw new Error('album choice did not stick');
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
  console.log(`export for ${year} started`);
}

async function status(page) {
  await page.goto('https://takeout.google.com/manage', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const t = await page.innerText('body');
  const i = t.indexOf('Summary');
  console.log(t.slice(i, i + 900));
}

// Google gives one "Download" link per zip. We use the browser's cookies with curl,
// because a 10 GB file must go straight to disk, not through memory.
async function download(page, context) {
  await page.goto('https://takeout.google.com/manage', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const links = await page.locator('a[href*="takeout/download"], a:has-text("Download")').evaluateAll((as) =>
    as.map((a) => a.href).filter((h) => h && h.includes('takeout')));
  const unique = [...new Set(links)];
  if (!unique.length) { console.log('no download links yet'); return; }
  fs.mkdirSync(ZIPS, { recursive: true });
  const cookies = await context.cookies(['https://takeout.google.com', 'https://accounts.google.com', 'https://google.com']);
  const jar = path.join(ZIPS, 'cookies.txt');
  fs.writeFileSync(jar, '# Netscape HTTP Cookie File\n' + cookies.map((c) =>
    [c.domain, c.domain.startsWith('.') ? 'TRUE' : 'FALSE', c.path, c.secure ? 'TRUE' : 'FALSE', Math.floor(c.expires > 0 ? c.expires : 2e9), c.name, c.value].join('\t')).join('\n') + '\n', { mode: 0o600 });
  let n = 0;
  for (const url of unique) {
    n++;
    const out = path.join(ZIPS, `takeout-${new Date().toISOString().slice(0, 10)}-${String(n).padStart(3, '0')}.zip`);
    if (fs.existsSync(out)) { console.log('have', out); continue; }
    console.log('downloading', n, 'of', unique.length);
    execFileSync('curl', ['-L', '-sS', '-b', jar, '-c', jar, '-o', out + '.part', url], { stdio: 'inherit' });
    const fd = fs.openSync(out + '.part', 'r');
    const head = Buffer.alloc(300);
    fs.readSync(fd, head, 0, 300, 0);
    fs.closeSync(fd);
    if (head.toString('latin1', 0, 2) !== 'PK') {
      const peek = head.toString('utf8').replace(/\s+/g, ' ');
      throw new Error(`file ${n} is not a zip. Google probably asked to log in again. Start of file: ${peek}`);
    }
    fs.renameSync(out + '.part', out);
    console.log('saved', out);
  }
  fs.unlinkSync(jar);
}

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  const { page, context } = await connect();
  if (cmd === 'create' && /^\d{4}$/.test(arg || '')) await create(page, arg);
  else if (cmd === 'status') await status(page);
  else if (cmd === 'download') await download(page, context);
  else { console.log('use: node takeout.js create <year> | status | download'); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('takeout failed:', e.message); process.exit(1); });
