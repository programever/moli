#!/usr/bin/env node
// Moli: one video per month from random photos and videos.
//   node moli.js months            show how many photos and videos each month has
//   node moli.js make 2026-08      make the video for one month
//   node moli.js make 2026-08 --again   forget the old pick and pick again
// Videos are wide (1920x1080). Set MOLI_SHAPE=tall for a phone-shaped video.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildIndex, pickMonth, listMonths } = require('./lib/pick');
const { makeVideo } = require('./lib/video');

const DATA = process.env.MOLI_DATA || path.join(os.homedir(), 'photos');
const LIB = path.join(DATA, 'library');
const INDEX = path.join(DATA, 'work', 'index.json');
const MUSIC = path.join(DATA, 'music');
const OUT = path.join(DATA, 'out');

const [cmd, arg, flag] = process.argv.slice(2);

if (cmd === 'months') {
  const items = buildIndex(LIB, INDEX);
  const months = listMonths(items);
  for (const m of Object.keys(months).sort().reverse()) console.log(m, months[m]);
} else if (cmd === 'make' && /^\d{4}-\d{2}$/.test(arg || '')) {
  const month = arg;
  const work = path.join(DATA, 'work', month);
  fs.mkdirSync(work, { recursive: true });
  const pickFile = path.join(work, 'pick.json');
  let pick;
  if (fs.existsSync(pickFile) && flag !== '--again') {
    pick = JSON.parse(fs.readFileSync(pickFile, 'utf8'));
  } else {
    const items = buildIndex(LIB, INDEX);
    pick = pickMonth(items, month);
    fs.writeFileSync(pickFile, JSON.stringify(pick, null, 1));
  }
  console.log(`${month}: ${pick.counts.photosInMonth} photos and ${pick.counts.videosInMonth} videos in the month, ${pick.chosen.length} picked`);
  if (!pick.chosen.length) { console.log('nothing to do'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const res = makeVideo({ month, chosen: pick.chosen, workDir: work, musicDir: MUSIC, outFile: path.join(OUT, `${month}.mp4`) });
  console.log(`done: ${res.outFile} (${Math.round(res.seconds)} seconds, ${res.clips} clips, music ${res.music})`);
} else {
  console.log('use: node moli.js months | node moli.js make YYYY-MM [--again]');
  process.exit(1);
}
