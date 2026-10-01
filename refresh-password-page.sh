#!/bin/bash
# While the job waits for Iker's password, Google's password page can expire after some hours.
# This re-opens a fresh password page every 2 hours, and stops as soon as the page is not a
# Google login page any more (Iker typed the password, or the job moved on).
cd ~/moli
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
for i in $(seq 1 72); do
  sleep 7200
  url=$(node drive.js eval "location.href" 2>/dev/null || echo "")
  case "$url" in
    *accounts.google.com*) node takeout.js download >/dev/null 2>&1 || true; echo "$(date -Is) fresh password page opened" ;;
    *) echo "$(date -Is) not on the password page any more, stop"; exit 0 ;;
  esac
done
