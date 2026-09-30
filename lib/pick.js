// Find photos and videos in the library and pick a random set for one month.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.heic', '.heif', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.3gp']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Takeout puts a small JSON file next to each photo with the real "taken" time.
function sidecarTime(file, allFiles) {
  const base = path.basename(file);
  const dir = path.dirname(file);
  const cand = allFiles.filter((f) => path.dirname(f) === dir && f.endsWith('.json') &&
    path.basename(f).startsWith(base.replace(/-edited(?=\.[^.]+$)/, '')));
  for (const j of cand) {
    try {
      const m = JSON.parse(fs.readFileSync(j, 'utf8'));
      const ts = m.photoTakenTime && Number(m.photoTakenTime.timestamp);
      if (ts) return ts * 1000;
    } catch { /* ignore broken json */ }
  }
  return null;
}

function exifTime(file) {
  try {
    const out = execFileSync('exiftool', ['-j', '-DateTimeOriginal', '-CreateDate', '-MediaCreateDate', file],
      { encoding: 'utf8' });
    const m = JSON.parse(out)[0] || {};
    const raw = m.DateTimeOriginal || m.MediaCreateDate || m.CreateDate;
    if (!raw) return null;
    const mm = raw.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!mm) return null;
    return new Date(+mm[1], +mm[2] - 1, +mm[3], +mm[4], +mm[5], +mm[6]).getTime();
  } catch { return null; }
}

function videoInfo(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type',
      '-of', 'json', file], { encoding: 'utf8' });
    const j = JSON.parse(out);
    return {
      duration: Number(j.format && j.format.duration) || 0,
      hasAudio: (j.streams || []).some((s) => s.codec_type === 'audio'),
    };
  } catch { return { duration: 0, hasAudio: false }; }
}

// Build (or reuse) the list of all media with their month. Saved in indexFile.
function buildIndex(libraryDir, indexFile) {
  const old = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
  const all = walk(libraryDir);
  const items = {};
  const imageBases = new Set();
  for (const f of all) {
    const ext = path.extname(f).toLowerCase();
    if (PHOTO_EXT.has(ext)) imageBases.add(f.slice(0, -ext.length).replace(/-edited$/, ''));
  }
  for (const f of all) {
    const ext = path.extname(f).toLowerCase();
    const isPhoto = PHOTO_EXT.has(ext);
    const isVideo = VIDEO_EXT.has(ext);
    if (!isPhoto && !isVideo) continue;
    const name = path.basename(f);
    if (/screenshot|screen recording|screen_recording/i.test(name)) continue;
    const base = f.slice(0, -ext.length).replace(/-edited$/, '');
    // A .MOV next to a photo with the same name is an iPhone "live photo" clip, not a real video.
    if (isVideo && imageBases.has(base)) continue;
    if (old[f]) { items[f] = old[f]; continue; }
    const time = sidecarTime(f, all) || exifTime(f) || fs.statSync(f).mtimeMs;
    const d = new Date(time);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const item = { file: f, type: isPhoto ? 'photo' : 'video', time, month, base, edited: /-edited$/.test(f.slice(0, -ext.length)) };
    if (isVideo) Object.assign(item, videoInfo(f));
    items[f] = item;
  }
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  fs.writeFileSync(indexFile, JSON.stringify(items, null, 1));
  return items;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick photos and videos for one month. If a photo has an edited copy, use the edited copy.
function pickMonth(items, month, { photos = 30, videos = 5 } = {}) {
  const inMonth = Object.values(items).filter((i) => i.month === month);
  const byBase = new Map();
  for (const i of inMonth.filter((i) => i.type === 'photo')) {
    const cur = byBase.get(i.base);
    if (!cur || (i.edited && !cur.edited)) byBase.set(i.base, i);
  }
  const photoPool = shuffle([...byBase.values()]);
  const videoPool = shuffle(inMonth.filter((i) => i.type === 'video' && i.duration >= 2));
  const chosen = [...photoPool.slice(0, photos), ...videoPool.slice(0, videos)];
  chosen.sort((a, b) => a.time - b.time);
  return { month, chosen, counts: { photosInMonth: photoPool.length, videosInMonth: videoPool.length } };
}

function listMonths(items) {
  const months = {};
  for (const i of Object.values(items)) {
    months[i.month] = months[i.month] || { photos: 0, videos: 0 };
    months[i.month][i.type === 'photo' ? 'photos' : 'videos']++;
  }
  return months;
}

module.exports = { buildIndex, pickMonth, listMonths };
