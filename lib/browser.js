// Connect to the Chromium that photo-browser.service keeps running on this box.
// The browser is already logged in to Iker's personal Google account.
const { chromium } = require('playwright');

const CDP = 'http://127.0.0.1:9222';

async function connect() {
  const browser = await chromium.connectOverCDP(CDP);
  const context = browser.contexts()[0];
  let page = context.pages().find((p) => !p.url().startsWith('chrome'));
  if (!page) page = await context.newPage();
  await page.bringToFront();
  return { browser, context, page };
}

module.exports = { connect };
