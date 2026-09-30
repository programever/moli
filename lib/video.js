// Turn a list of photos and video clips into one video with music and transitions.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Wide (landscape) by default. MOLI_SHAPE=tall gives a phone-shaped video.
const TALL = process.env.MOLI_SHAPE === 'tall';
const W = TALL ? 1080 : 1920, H = TALL ? 1920 : 1080, FPS = 30;
const PHOTO_SEC = 3.5;
const CLIP_SEC = 5;
const TITLE_SEC = 3;
const FADE = 0.7;
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const TRANSITIONS = ['fade', 'smoothleft', 'smoothright', 'smoothup', 'circleopen', 'dissolve', 'slideleft', 'slideup', 'fadewhite', 'wipeleft'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function run(cmd, args, log) {
  if (log) fs.appendFileSync(log, `\n$ ${cmd} ${args.join(' ')}\n`);
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', log ? fs.openSync(log, 'a') : 'pipe'] });
}

// Photo or video that does not fill the frame gets a blurred copy of itself as background.
const FIT = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=40,eq=brightness=-0.08[bg];` +
  `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;

const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '160k'];
const SILENCE = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];

function titleClip(month, out, log) {
  const [y, m] = month.split('-');
  const text = `${MONTHS[+m - 1]} ${y}`;
  run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=0x1b1b2f:s=${W}x${H}:r=${FPS}:d=${TITLE_SEC}`, ...SILENCE,
    '-vf', `drawtext=fontfile=${FONT}:text='${text}':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,1),t,1)'`,
    '-t', String(TITLE_SEC), ...ENC, '-shortest', out], log);
  return TITLE_SEC;
}

// Photos are first made into plain JPEGs (turned the right way up, HEIC decoded), then get a slow zoom.
function photoClip(file, idx, out, log) {
  const jpg = out.replace(/\.mp4$/, '.jpg');
  run('convert', [`${file}[0]`, '-auto-orient', '-resize', `${W * 2}x${H * 2}>`, '-quality', '92', jpg], log);
  const frames = Math.round(PHOTO_SEC * FPS);
  const zoomIn = idx % 2 === 0;
  const z = zoomIn ? `min(zoom+0.0012,1.15)` : `if(eq(on,1),1.15,max(zoom-0.0012,1.0))`;
  const pans = [`x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`, `x='0':y='ih/2-(ih/zoom/2)'`, `x='iw-iw/zoom':y='ih/2-(ih/zoom/2)'`, `x='iw/2-(iw/zoom/2)':y='0'`];
  const pan = pans[idx % pans.length];
  run('ffmpeg', ['-y', '-i', jpg, ...SILENCE, '-filter_complex',
    `${FIT},scale=${W * 2}:${H * 2},zoompan=z='${z}':${pan}:d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a', '-t', String(PHOTO_SEC), ...ENC, out], log);
  fs.unlinkSync(jpg);
  return PHOTO_SEC;
}

function videoClip(item, out, log) {
  const dur = Math.min(CLIP_SEC, item.duration);
  const start = item.duration > CLIP_SEC + 2 ? 1 : 0;
  const args = ['-y', '-ss', String(start), '-t', String(dur), '-i', item.file];
  if (!item.hasAudio) args.push(...SILENCE);
  args.push('-filter_complex', `${FIT},fps=${FPS},format=yuv420p[v]`, '-map', '[v]', '-map', item.hasAudio ? '0:a' : '1:a',
    '-t', String(dur), ...ENC, out);
  run('ffmpeg', args, log);
  return dur;
}

// Join all clips with transitions, then put music under everything.
function join(clips, music, out, log) {
  const inputs = [];
  clips.forEach((c) => inputs.push('-i', c.file));
  inputs.push('-i', music);
  const n = clips.length;
  let f = '';
  let outLen = clips[0].dur;
  let v = '[0:v]', a = '[0:a]';
  for (let i = 1; i < n; i++) {
    const t = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
    const offset = (outLen - FADE).toFixed(3);
    f += `${v}[${i}:v]xfade=transition=${t}:duration=${FADE}:offset=${offset}[v${i}];`;
    f += `${a}[${i}:a]acrossfade=d=${FADE}[a${i}];`;
    v = `[v${i}]`; a = `[a${i}]`;
    outLen += clips[i].dur - FADE;
  }
  const total = outLen.toFixed(3);
  f += `[${n}:a]atrim=0:${total},afade=t=in:d=2,afade=t=out:st=${(outLen - 4).toFixed(3)}:d=4,volume=0.45[m];`;
  f += `${a}[m]amix=inputs=2:duration=first:normalize=0[aout];`;
  f += `${v}fade=t=out:st=${(outLen - 1.5).toFixed(3)}:d=1.5[vout]`;
  run('ffmpeg', ['-y', ...inputs, '-filter_complex', f, '-map', '[vout]', '-map', '[aout]', '-t', total,
    ...ENC, '-movflags', '+faststart', out], log);
  return outLen;
}

// Every video gets its own music (Iker, 2026-09-30). Pick at random among the tracks used the
// fewest times, so no track is used twice before every track has been used once.
// The counts live in <musicDir>/../music-used.json.
function pickMusic(musicDir) {
  const songs = fs.readdirSync(musicDir).filter((f) => /\.(mp3|m4a|wav)$/i.test(f));
  if (!songs.length) throw new Error(`no music in ${musicDir}`);
  const usedFile = path.join(musicDir, '..', 'music-used.json');
  const used = fs.existsSync(usedFile) ? JSON.parse(fs.readFileSync(usedFile, 'utf8')) : {};
  const min = Math.min(...songs.map((f) => used[f] || 0));
  const fresh = songs.filter((f) => (used[f] || 0) === min);
  const pick = fresh[Math.floor(Math.random() * fresh.length)];
  used[pick] = (used[pick] || 0) + 1;
  fs.writeFileSync(usedFile, JSON.stringify(used, null, 1));
  return path.join(musicDir, pick);
}

function makeVideo({ month, chosen, workDir, musicDir, outFile }) {
  fs.mkdirSync(workDir, { recursive: true });
  const log = path.join(workDir, 'ffmpeg.log');
  fs.writeFileSync(log, '');
  const clips = [];
  const title = path.join(workDir, 'clip-000-title.mp4');
  clips.push({ file: title, dur: titleClip(month, title, log) });
  chosen.forEach((item, i) => {
    const out = path.join(workDir, `clip-${String(i + 1).padStart(3, '0')}.mp4`);
    try {
      const dur = item.type === 'photo' ? photoClip(item.file, i, out, log) : videoClip(item, out, log);
      clips.push({ file: out, dur });
      console.log(`clip ${i + 1}/${chosen.length} ${item.type} ok`);
    } catch (e) {
      console.log(`clip ${i + 1}/${chosen.length} ${item.type} FAILED, skipped: ${path.basename(item.file)}`);
    }
  });
  const music = pickMusic(musicDir);
  console.log(`music: ${path.basename(music)}`);
  const seconds = join(clips, music, outFile, log);
  // The small clips are only needed for the join. Delete them to save disk space.
  for (const c of clips) fs.unlinkSync(c.file);
  return { outFile, seconds, clips: clips.length - 1, music: path.basename(music) };
}

module.exports = { makeVideo };
