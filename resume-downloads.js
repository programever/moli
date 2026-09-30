#!/usr/bin/env node
// Chromium stops a download for good when the internet drops for a moment ("Network disconnected").
// This opens chrome://downloads and presses the hidden Resume button on every stopped item.
const { connect } = require('./lib/browser');

(async () => {
  const { context } = await connect();
  const p = await context.newPage();
  await p.goto('chrome://downloads', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const n = await p.evaluate(() => {
    const m = document.querySelector('downloads-manager');
    if (!m || !m.shadowRoot) return 0;
    let n = 0;
    for (const item of m.shadowRoot.querySelectorAll('downloads-item')) {
      const text = item.shadowRoot.textContent;
      const b = item.shadowRoot.querySelector('#pause-or-resume');
      if (b && /Failed|interrupted|disconnected/i.test(text)) { b.click(); n++; }
    }
    return n;
  });
  if (n) console.log(`resumed ${n} download(s)`);
  await p.close();
  process.exit(0);
})().catch((e) => { console.error(e.message.split('\n')[0]); process.exit(1); });
