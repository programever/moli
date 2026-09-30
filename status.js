#!/usr/bin/env node
// Keep the Moli status in Alpha's memory, so Alpha can remind Iker when something is stuck.
//   node status.js open "text"          something Iker must do ("" = nothing open)
//   node status.js progress "text"      what is running now
//   node status.js done 2016-03 <link>  a month is uploaded
//   node status.js fail 2016-03 "why"   a month failed
// State lives in ~/photos/status.json. The memory file is rendered from it and pushed to the alpha repo.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const STATE = path.join(process.env.MOLI_DATA || path.join(os.homedir(), 'photos'), 'status.json');
const MEMORY = path.join(os.homedir(), 'alpha', 'alpha', 'memory', 'moli-status.md');

function load() {
  if (!fs.existsSync(STATE)) return { open: '', progress: '', done: {}, failed: {} };
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}

function render(s) {
  const today = new Date().toISOString().slice(0, 10);
  const done = Object.keys(s.done).sort();
  const failed = Object.keys(s.failed).sort();
  const lines = [
    '---', 'name: moli-status',
    'description: Current state of the Moli monthly videos; read this at the start of every session and remind Iker if something is open',
    'metadata:', '  type: project', '---', '',
    `Updated ${today} by Alpha (rendered by ~/moli/status.js, state in ~/photos/status.json).`, '',
    `**Open for Iker:** ${s.open || 'none right now.'}`, '',
    `**In progress:** ${s.progress || 'nothing.'}`, '',
    `**Failed (Alpha should retry or tell Iker):** ${failed.length ? '' : 'none.'}`,
    ...failed.map((m) => `- ${m}: ${s.failed[m]}`), '',
    `**Uploaded to YouTube (private, playlist "Our Memory"):** ${done.length} months.` +
      (done.length ? ` First ${done[0]}, last ${done[done.length - 1]}.` : ''),
    ...done.slice(-12).map((m) => `- ${m}: ${s.done[m]}`),
    done.length > 12 ? `- (older months not listed, see ~/photos/status.json)` : '',
    '',
  ];
  return lines.join('\n');
}

const [cmd, a, b] = process.argv.slice(2);
const s = load();
if (cmd === 'open') s.open = a || '';
else if (cmd === 'progress') s.progress = a || '';
else if (cmd === 'done' && a) { s.done[a] = b || 'uploaded'; delete s.failed[a]; }
else if (cmd === 'fail' && a) s.failed[a] = b || 'failed';
else if (cmd !== 'show') { console.log('use: node status.js open|progress <text> | done <month> <link> | fail <month> <why> | show'); process.exit(1); }
fs.mkdirSync(path.dirname(STATE), { recursive: true });
fs.writeFileSync(STATE, JSON.stringify(s, null, 1));
fs.writeFileSync(MEMORY, render(s));
if (cmd !== 'show') {
  try {
    execSync(`cd ~/alpha && git pull --ff-only -q && git add alpha/memory/moli-status.md && git -c user.name=Alpha -c user.email=tdtrinh.web@gmail.com commit -qm "Moli status: ${cmd} ${a || ''}" && git push -q`, { stdio: 'ignore', shell: '/bin/bash' });
  } catch { console.log('(memory file written, but git push failed)'); }
}
console.log(render(s));
