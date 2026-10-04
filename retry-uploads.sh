#!/bin/bash
# Upload again every month whose video is made but whose upload failed (YouTube allows only about
# 10 uploads per day). Runs every day at 11:30 Vietnam time (systemd user timer moli-retry-uploads).
set -u
cd ~/moli
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
years=$(node -e "const s=require('$HOME/photos/status.json'); console.log([...new Set(Object.keys(s.failed).map(m=>m.slice(0,4)))].sort().join(' '))")
[ -z "$years" ] && { echo "$(date -Is) nothing to retry"; exit 0; }
echo "$(date -Is) retrying failed months of $years"
./backfill.sh $years
