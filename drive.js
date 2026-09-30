#!/usr/bin/env node
// Small helper to look at and poke the logged-in browser by hand.
//   node drive.js goto <url>
//   node drive.js shot [file.png]        screenshot of the page
//   node drive.js text                   visible text of the page
//   node drive.js click <playwright selector>
//   node drive.js fill <selector> <text>
//   node drive.js eval <javascript>
const { connect } = require('./lib/browser');

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  const { browser, page } = await connect();
  try {
    if (cmd === 'goto') {
      await page.goto(args[0], { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      console.log(page.url());
    } else if (cmd === 'shot') {
      const file = args[0] || '/tmp/shot.png';
      await page.screenshot({ path: file, fullPage: false });
      console.log(file, page.url());
    } else if (cmd === 'text') {
      console.log(await page.innerText('body'));
    } else if (cmd === 'click') {
      await page.locator(args[0]).first().click({ timeout: 10000 });
      await page.waitForTimeout(2000);
      console.log('clicked', args[0], page.url());
    } else if (cmd === 'fill') {
      await page.locator(args[0]).first().fill(args[1]);
      console.log('filled');
    } else if (cmd === 'eval') {
      console.log(await page.evaluate(args[0]));
    } else {
      console.log('url:', page.url(), '\ntitle:', await page.title());
    }
  } finally {
    // Just drop the connection. Never close the browser, it must stay logged in.
    process.exit(0);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
