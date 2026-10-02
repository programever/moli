#!/bin/bash
# Make the video for one month and upload it as private into the playlist "Our Memory".
# The photos for that month must already be in ~/photos/library.
#   ./run-month.sh 2016-03
set -u
cd ~/moli
# systemd does not know the nvm node; use the same node as the shell.
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
M=${1:?month YYYY-MM}
DATA=${MOLI_DATA:-$HOME/photos}
MONTHS=(January February March April May June July August September October November December)
Y=${M%-*}; N=$((10#${M#*-}))
TITLE="${MONTHS[$((N-1))]} $Y"

node status.js progress "making and uploading $TITLE" >/dev/null
# A video that was already made is reused (for example when only the upload failed last time).
if [ -s "$DATA/out/$M.mp4" ]; then
  echo "$M: video already made, upload only" | tee -a "$DATA/work/$M.log"
elif ! node moli.js make "$M" > "$DATA/work/$M.log" 2>&1; then
  if grep -q "nothing to do" "$DATA/work/$M.log"; then
    node status.js fail "$M" "no photos or videos found for this month in the library" >/dev/null
  else
    node status.js fail "$M" "video build failed, see ~/photos/work/$M.log" >/dev/null
  fi
  echo "$M: build failed"; exit 1
fi
link=$(node youtube.js upload "$DATA/out/$M.mp4" "$TITLE" 2>&1 | tee -a "$DATA/work/$M.log" | grep -o 'https://youtu.be/[^ ]*' | head -1)
if [ -z "$link" ]; then
  if grep -q "DAILY LIMIT" "$DATA/work/$M.log"; then
    node status.js fail "$M" "video is made, but YouTube said 'Daily upload limit reached'. Run the month again after 24 hours, or Iker does the one-time verification in YouTube Studio so the limit goes away" >/dev/null
  else
    node status.js fail "$M" "video was made but the YouTube upload failed, see ~/photos/work/$M.log; try: node youtube.js upload $DATA/out/$M.mp4 \"$TITLE\"" >/dev/null
  fi
  echo "$M: upload failed"; exit 1
fi
node status.js done "$M" "$link" >/dev/null
node status.js progress "" >/dev/null
echo "$M: done $link"
