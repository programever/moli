#!/usr/bin/env node
// Upload one video to Iker's YouTube channel as PRIVATE, through the logged-in browser (YouTube Studio).
//   node youtube.js upload ~/photos/out/2026-08.mp4 "August 2026"
// Prints the video link when done.
const fs = require('fs');
const path = require('path');
const { connect } = require('./lib/browser');

const CHANNEL = 'UCvRJxeC70u_WWcBEeF7nBQA';
const PLAYLIST = 'Our Memory'; // Iker, 2026-09-30: every upload goes into this playlist

// In the upload dialog: Playlists > Select > tick the playlist > Done.
async function addToPlaylist(page, d, name) {
  await d.locator('ytcp-video-metadata-playlists ytcp-text-dropdown-trigger, ytcp-video-metadata-playlists #dropdown-trigger, ytcp-text-dropdown-trigger:has-text("Select")').first().click();
  await page.waitForTimeout(1500);
  const popup = page.locator('ytcp-playlist-dialog, tp-yt-iron-dropdown').locator('visible=true').first();
  const row = popup.locator(`[role=option]:has-text("${name}"), ytcp-checkbox-group-item:has-text("${name}"), li:has-text("${name}")`).first();
  if (!(await row.count())) throw new Error(`playlist "${name}" not found in the list`);
  await row.click();
  await page.waitForTimeout(800);
  await popup.locator('ytcp-button:has-text("Done"), button:has-text("Done")').first().click();
  await page.waitForTimeout(1000);
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
  const link = ((await d.innerText()).match(/https:\/\/youtu\.be\/\S+/) || [])[0];
  // Wait for the upload itself to finish (up to 20 minutes) before pressing Save.
  for (let i = 0; i < 400; i++) {
    const t = await d.innerText();
    if (!/Uploading \d+%/.test(t)) break;
    await page.waitForTimeout(3000);
  }
  await d.locator('#done-button').click();
  await page.waitForTimeout(4000);
  const close = page.locator('ytcp-uploads-still-processing-dialog #close-button').first();
  if (await close.count()) await close.click();
  console.log(`uploaded as private: ${title} ${link || '(link not seen)'}`);
  return link;
}

(async () => {
  const [cmd, file, title] = process.argv.slice(2);
  if (cmd !== 'upload' || !file || !title) { console.log('use: node youtube.js upload <file.mp4> "<title>"'); process.exit(1); }
  const { page } = await connect();
  await upload(page, file, title);
  process.exit(0);
})().catch((e) => { console.error('youtube upload failed:', e.message.split('\n')[0]); process.exit(1); });
