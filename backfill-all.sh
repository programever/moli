#!/bin/bash
# Do every month from March 2016 to the month that just ended, oldest first.
# Years come in pairs from Google Takeout to save disk space and Iker's password entries.
# Photos of 2016 and 2026 are expected to be on the box already.
#   ./backfill-all.sh
set -u
cd ~/moli
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
exec 9>~/photos/moli.lock; flock 9
LOG=~/photos/backfill-all.log
exec >> "$LOG" 2>&1
LIB="$HOME/photos/library/Takeout/Google Photos"

# The photos are on the box, or the videos of that year were already made (photos deleted after).
have_year() { [ -d "$LIB/Photos from $1" ] || ls ~/photos/out/$1-*.mp4 >/dev/null 2>&1; }

do_years() {  # do_years 2017 2018
  local need=()
  for y in "$@"; do have_year "$y" || need+=("$y"); done
  if [ ${#need[@]} -gt 0 ]; then
    echo "=== $(date -Is) asking Google Takeout for ${need[*]}"
    node status.js progress "asking Google Takeout for Photos from ${need[*]}" >/dev/null
    if ! node takeout.js create "${need[@]}"; then
      node status.js fail "${need[*]}" "could not start the Google Takeout export; is the browser still logged in? Check http://100.115.99.53:6080/vnc.html" >/dev/null
      return 1
    fi
    sleep 120
    while node takeout.js status 2>&1 | grep -q "in progress"; do sleep 300; done
    node status.js progress "downloading Photos from ${need[*]}" >/dev/null
    flock -u 9   # fetch-export.sh takes the lock itself, only while it touches the browser
    ./fetch-export.sh "${need[*]}"; local rc=$?
    flock 9
    [ $rc -eq 0 ] || return 1
  fi
  echo "=== $(date -Is) months of $*"
  flock -u 9   # backfill.sh takes the lock itself
  ./backfill.sh "$@"
  flock 9
}

do_years 2016 || exit 1
do_years 2017 2018 || exit 1
do_years 2019 2020 || exit 1
do_years 2021 2022 || exit 1
do_years 2023 2024 || exit 1
do_years 2025 2026 || exit 1
node status.js progress "all months from March 2016 are done" >/dev/null
echo "=== $(date -Is) all done"
