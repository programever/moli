#!/bin/bash
# Starts a hidden screen, a Chromium browser on it, and a noVNC web page so Iker can
# see and use the browser from the phone or Mac over Tailscale.
# Only the Tailscale address gets the web page. Nothing is open on the home router.
set -e
export DISPLAY=:99
TS_IP=$(tailscale ip -4)
CHROME=$HOME/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
PROFILE=$HOME/photos/browser-profile

trap 'kill 0' EXIT

Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
sleep 1
x11vnc -display :99 -listen localhost -listen6 ::1 -rfbport 5900 -nopw -forever -shared -quiet &
websockify --web /usr/share/novnc "$TS_IP:6080" localhost:5900 &
# --no-sandbox is needed because Ubuntu 24.04 blocks Chromium's own sandbox for normal users.
"$CHROME" --user-data-dir="$PROFILE" --remote-debugging-port=9222 --no-sandbox \
  --no-first-run --no-default-browser-check --window-size=1280,800 --window-position=0,0 \
  --disable-features=Translate "https://accounts.google.com" &
wait
