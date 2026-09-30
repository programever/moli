#!/bin/bash
# Download the newest finished Google Takeout export, wait for it, unpack it into ~/photos/library.
# If Google asks for Iker's password, this writes a note into Alpha's memory and keeps waiting
# (up to 6 days, the export is valid for 7). Iker types the password on the noVNC page; then the
# download starts by itself in the browser and this script picks it up.
set -u
cd ~/moli
# systemd does not know the nvm node; use the same node as the shell.
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
DATA=${MOLI_DATA:-$HOME/photos}
DIRS="$HOME/Downloads /tmp/playwright-artifacts-*"
LABEL=${1:-export}

have_download() { ls $DIRS/*.crdownload >/dev/null 2>&1; }
have_zip() { for f in $(ls -S $DIRS/* 2>/dev/null); do [ -f "$f" ] && [ "$(head -c 2 "$f")" = "PK" ] && return 0; done; return 1; }

out=$(node takeout.js download 2>&1); echo "$out"
if echo "$out" | grep -q "PASSWORD NEEDED"; then
  node status.js open "Google asks for Iker's password before Moli can download the photos ($LABEL). Iker: open http://100.115.99.53:6080/vnc.html with Tailscale on, press Connect, type the password, press Next. The download then starts by itself." >/dev/null
fi

# Wait until the download is running, then until it is finished. Check every 5 minutes.
for i in $(seq 1 1728); do
  if have_download; then
    while have_download; do
      sleep 60
      # Chromium stops for good when the internet drops; press Resume on every stopped item.
      node resume-downloads.js >/dev/null 2>&1 || true
    done
    break
  fi
  have_zip && break
  # Iker may have typed the password: try the download again, quietly.
  node takeout.js download >/dev/null 2>&1 || true
  sleep 300
done

if ! have_zip; then
  node status.js fail "$LABEL" "the Takeout download never arrived, the export has probably expired; run the month again" >/dev/null
  echo "no zip arrived"; exit 1
fi
node status.js open "" >/dev/null

mkdir -p "$DATA/takeout" "$DATA/library"
n=0
for f in $(ls -S $DIRS/* 2>/dev/null); do
  [ -f "$f" ] || continue
  [ "$(head -c 2 "$f")" = "PK" ] || continue
  n=$((n+1)); z="$DATA/takeout/$LABEL-$n.zip"
  mv "$f" "$z"
  echo "unpacking $z"
  unzip -q -n "$z" -d "$DATA/library" && rm -f "$z"
done
echo "unpacked $n zip file(s)"
