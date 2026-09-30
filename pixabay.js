#!/usr/bin/env node
// Download free music from Pixabay into ~/photos/music, through the browser on this box.
//   node pixabay.js funky 130        get up to 130 tracks from https://pixabay.com/music/search/funky/
// Pixabay music is free to use, no name in the credits needed (Pixabay Content License).
// Tracks shorter than MIN_SEC are skipped, a month video is about 2 minutes long.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { connect } = require('./lib/browser');

const MUSIC = path.join(process.env.MOLI_DATA || path.join(os.homedir(), 'photos'), 'music');
const MIN_SEC = 90;

function seconds(text) {
  const m = text.match(/(\d+):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

(async () => {
  const [search, wantArg] = process.argv.slice(2);
  const want = Number(wantArg) || 50;
  if (!search) { console.log('use: node pixabay.js <search word> [how many]'); process.exit(1); }
  fs.mkdirSync(MUSIC, { recursive: true });
  const { page } = await connect();
  let got = 0;
  for (let pg = 1; pg <= 40 && got < want; pg++) {
    await page.goto(`https://pixabay.com/music/search/${encodeURIComponent(search)}/?pagi=${pg}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(400); }
    const buttons = page.locator('[aria-label="Download"]');
    // The card around each button shows the length like "2:15". Read all cards in one go.
    const lengths = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Download"]')].map((b) => {
      let e = b; for (let k = 0; k < 8 && e; k++) { e = e.parentElement; if (e && /\d+:\d{2}/.test(e.innerText || '')) return (e.innerText.match(/\d+:\d{2}/) || [''])[0]; }
      return '';
    }));
    const n = lengths.length;
    if (!n) { console.log(`page ${pg}: no tracks, stop`); break; }
    console.log(`page ${pg}: ${n} tracks`);
    for (let i = 0; i < n && got < want; i++) {
      const b = buttons.nth(i);
      const len = seconds(lengths[i]);
      if (len && len < MIN_SEC) continue;
      const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
      await b.scrollIntoViewIfNeeded().catch(() => {});
      await b.click({ timeout: 10000 }).catch(() => {});
      const d = await dl;
      if (!d) { console.log(`page ${pg} track ${i + 1}: no download`); continue; }
      const name = d.suggestedFilename().replace(/[^\w.-]+/g, '_');
      const out = path.join(MUSIC, name);
      if (fs.existsSync(out)) { await d.cancel().catch(() => {}); continue; }
      try {
        await d.saveAs(out);
        got++;
        console.log(`${got}: ${name} (${len ? len + 's' : 'length unknown'})`);
      } catch (e) {
        console.log(`page ${pg} track ${i + 1}: save failed: ${e.message.split('\n')[0]}`);
      }
      // After a download Pixabay shows a "Nice one! Say thanks" window. Close it, else the next click fails.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1500);
    }
  }
  console.log(`done: ${got} new tracks in ${MUSIC}`);
  process.exit(0);
})().catch((e) => { console.error('pixabay failed:', e.message.split('\n')[0]); process.exit(1); });
