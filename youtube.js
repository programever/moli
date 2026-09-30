#!/usr/bin/env node
// Upload one video to Iker's YouTube channel as PRIVATE, through the logged-in browser (YouTube Studio).
//   node youtube.js upload ~/photos/out/2026-08.mp4 "August 2026"
// Prints the video link when done.
const fs = require('fs');
const path = require('path');
const { connect } = require('./lib/browser');

const CHANNEL = 'UCvRJxeC70u_WWcBEeF7nBQA';
const PLAYLIST = 'Our Memory'; // Iker, 2026-09-30: every upload goes into this playlist
const PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLWJ9cw331A7M';

// Check on the playlist page that the video is really inside. If not, add it on the video's edit
// page: Playlists > tick > Done > Save. That page needs real mouse clicks at the right position.
async function ensureInPlaylist(page, videoId, title) {
  const listed = async () => {
    await page.goto(PLAYLIST_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const titles = await page.locator('ytd-playlist-video-renderer #video-title').allInnerTexts();
    return titles.some((t) => t.trim() === title);
  };
  if (await listed()) { console.log(`in playlist: ${PLAYLIST}`); return; }
  await page.goto(`https://studio.youtube.com/video/${videoId}/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.locator('ytcp-video-metadata-playlists ytcp-text-dropdown-trigger').first().click();
  await page.waitForTimeout(2500);
  const popup = page.locator('ytcp-playlist-dialog');
  const cb = popup.locator('li.row', { hasText: PLAYLIST }).locator('ytcp-checkbox, #checkbox').first();
  if ((await cb.getAttribute('aria-checked')) !== 'true') {
    const b = await cb.boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(800);
  }
  let b = await popup.locator('button', { hasText: 'Done' }).first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(1500);
  b = await page.locator('ytcp-button#save').first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(4000);
  if (!(await listed())) throw new Error(`video ${videoId} is uploaded but could not be added to the playlist "${PLAYLIST}"`);
  console.log(`added to playlist: ${PLAYLIST}`);
}

// In the upload dialog: Playlists > Select > tick the playlist > Done.
async function addToPlaylist(page, d, name) {
  await d.locator('ytcp-video-metadata-playlists ytcp-text-dropdown-trigger').first().click();
  await page.waitForTimeout(2500);
  const popup = page.locator('ytcp-playlist-dialog');
  const row = popup.locator('li.row', { hasText: name }).first();
  if (!(await row.count())) throw new Error(`playlist "${name}" not found in the list`);
  // The tick box and the Done button only react to real mouse clicks at their position.
  const cb = row.locator('ytcp-checkbox, #checkbox').first();
  const b = await cb.boundingBox();
  if (!b) throw new Error(`playlist "${name}" tick box is not on screen`);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(800);
  if ((await cb.getAttribute('aria-checked')) !== 'true') throw new Error(`playlist "${name}" did not get ticked`);
  const done = popup.locator('button', { hasText: 'Done' }).first();
  const db = await done.boundingBox();
  await page.mouse.click(db.x + db.width / 2, db.y + db.height / 2);
  await page.waitForTimeout(1500);
  const shown = await d.locator('ytcp-video-metadata-playlists').innerText().catch(() => '');
  if (!shown.includes(name)) throw new Error(`playlist "${name}" was not applied, dialog shows: ${shown.slice(0, 100)}`);
  console.log(`playlist: ${name}`);
}

async function upload(page, file, title) {
  if (!fs.existsSync(file)) throw new Error('no such file: ' + file);
  await page.goto(`https://studio.youtube.com/channel/${CHANNEL}/videos/upload?d=ud`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type=file]', { state: 'attached', timeout: 60000 });
  // Playwright refuses files over 50 MB through a remote connection, so hand the path to Chromium directly.
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await cdp.send('DOM.setFileInputFiles', { nodeId, files: [path.resolve(file)] });
  const d = page.locator('ytcp-uploads-dialog');
  await d.locator('#title-textarea #textbox, ytcp-video-title #textbox').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  const box = d.locator('#title-textarea #textbox, ytcp-video-title #textbox').first();
  await box.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(title);
  await d.locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]').click();
  await page.waitForTimeout(800);
  await addToPlaylist(page, d, PLAYLIST);
  for (let i = 0; i < 3; i++) { await d.locator('#next-button').click(); await page.waitForTimeout(2000); }
  await d.locator('tp-yt-paper-radio-button[name="PRIVATE"]').click();
  await page.waitForTimeout(800);
  // Wait for the upload itself to finish (up to 20 minutes) before pressing Save.
  // The video link shows up in the dialog at some point during the upload; keep looking for it.
  let link = null;
  for (let i = 0; i < 400; i++) {
    const t = await d.innerText();
    link = link || (t.match(/https:\/\/youtu\.be\/\S+/) || [])[0];
    if (link && !/Uploading \d+%/.test(t)) break;
    await page.waitForTimeout(3000);
  }
  await d.locator('#done-button').click();
  await page.waitForTimeout(4000);
  const close = page.locator('ytcp-uploads-still-processing-dialog #close-button').first();
  if (await close.count()) await close.click();
  console.log(`uploaded as private: ${title} ${link || '(link not seen)'}`);
  if (link) await ensureInPlaylist(page, link.split('/').pop(), title);
  return link;
}

// Delete a video for good: video page > Options (three dots) > Delete > tick > Delete forever.
async function del(page, videoId) {
  await page.goto(`https://studio.youtube.com/video/${videoId}/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.locator('ytcp-icon-button[aria-label="Options"], ytcp-button[aria-label="Options"]').first().click();
  await page.waitForTimeout(1500);
  await page.locator('tp-yt-paper-item:has-text("Delete"), [role=menuitem]:has-text("Delete")').first().click();
  await page.waitForTimeout(2000);
  const dlg = page.locator('ytcp-confirmation-dialog').first();
  const text = await dlg.innerText().catch(() => '');
  if (!/Permanently delete/i.test(text)) throw new Error('delete window did not open');
  let b = await dlg.locator('ytcp-checkbox-lit, #checkbox, tp-yt-paper-checkbox').first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(800);
  b = await dlg.locator('ytcp-button:has-text("Delete forever"), button:has-text("Delete forever")').first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(4000);
  console.log(`deleted video ${videoId}: ${text.split('\n').slice(1, 3).join(' ').trim()}`);
}

(async () => {
  const [cmd, file, title] = process.argv.slice(2);
  const { page } = await connect();
  if (cmd === 'upload' && file && title) await upload(page, file, title);
  else if (cmd === 'delete' && file) await del(page, file);
  else { console.log('use: node youtube.js upload <file.mp4> "<title>" | delete <videoId>'); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('youtube upload failed:', e.message.split('\n')[0]); process.exit(1); });
