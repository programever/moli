#!/bin/bash
# Runs by itself on the 1st of every month (systemd timer moli-monthly.timer).
# Gets the photos of the month that just ended from Google Takeout, makes the video, uploads it.
#   ./monthly.sh            month that just ended
#   ./monthly.sh 2026-09    a given month
set -u
cd ~/moli
# systemd does not know the nvm node; use the same node as the shell.
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
# Only one Moli job at a time, they share the one browser.
exec 9>~/photos/moli.lock; flock 9
M=${1:-$(date -d "$(date +%Y-%m-01) -1 day" +%Y-%m)}
# While the big catch-up job (all months since 2016) is still running, it will also do this month.
if systemctl --user is-active --quiet moli-backfill-all.service; then
  echo "$(date -Is) backfill-all is running, it will do $M; nothing to do" >> ~/photos/monthly.log; exit 0
fi
Y=${M%-*}
exec >> ~/photos/monthly.log 2>&1
echo "=== $(date -Is) monthly run for $M"

node status.js progress "monthly run for $M: asking Google Takeout for Photos from $Y" >/dev/null
if ! node takeout.js create "$Y"; then
  node status.js fail "$M" "could not start the Google Takeout export (is the browser still logged in? check http://100.115.99.53:6080/vnc.html)" >/dev/null
  exit 1
fi
# Wait until Google has packed the photos (usually minutes, at most a day or two).
sleep 120
while node takeout.js status 2>&1 | grep -q "in progress"; do sleep 300; done
node status.js progress "monthly run for $M: downloading the photos" >/dev/null
./fetch-export.sh "$M" || exit 1
./run-month.sh "$M"
