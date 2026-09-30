#!/usr/bin/env node
// Upload one video to Iker's YouTube channel as PRIVATE, through the logged-in browser (YouTube Studio).
//   node youtube.js upload ~/photos/out/2026-08.mp4 "August 2026"
// Prints the video link when done.
const fs = require('fs');
const path = require('path');
const { connect } = require('./lib/browser');

const CHANNEL = 'UCvRJxeC70u_WWcBEeF7nBQA';

async function upload(page, file, title) {
  if (!fs.existsSync(file)) throw new Error('no such file: ' + file);
  await page.goto(`https://studio.youtube.com/channel/${CHANNEL}/videos/upload?d=ud`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type=file]', { timeout: 30000 });
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
