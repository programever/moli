#!/bin/bash
# Make and upload every month of the given years, oldest first. The photos of those years must
# already be in ~/photos/library (use takeout.js create + fetch-export.sh first).
#   ./backfill.sh 2016 2017          all months of 2016 and 2017 that have photos
#   FROM=2016-03 TO=2026-09 ./backfill.sh 2016 2017 ...   limit the range
set -u
cd ~/moli
# Only one Moli job at a time, they share the one browser.
exec 9>~/photos/moli.lock; flock 9
FROM=${FROM:-2016-03}
TO=${TO:-$(date -d "$(date +%Y-%m-01) -1 day" +%Y-%m)}
exec >> ~/photos/backfill.log 2>&1
for Y in "$@"; do
  for N in 01 02 03 04 05 06 07 08 09 10 11 12; do
    M="$Y-$N"
    [[ "$M" < "$FROM" || "$M" > "$TO" ]] && continue
    if node -e "const s=require('$HOME/photos/status.json'); process.exit(s.done['$M'] ? 0 : 1)" 2>/dev/null; then
      echo "$M already uploaded, skip"; continue
    fi
    echo "=== $(date -Is) $M"
    ./run-month.sh "$M"
  done
done
