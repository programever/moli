# Moli

Moli makes one short video for each month from Iker's Google Photos.
It picks 30 photos and 5 videos at random from the month, adds music and
transitions, and saves a wide (landscape) video.

Moli is Alpha's project. Alpha writes the code and runs it on the home box `alpha`.

## How it works

1. **Get the photos.** Google does not let a program read the photo library.
   So Moli uses Google Takeout. Takeout is a Google page that packs photos into
   zip files. Moli drives a real Chromium browser that Iker logged into one time.
   The browser runs on a hidden screen on the box. Iker can see that screen from
   the phone over Tailscale when a login is needed.
2. **Unpack.** The zip files are unpacked into `~/photos/library`.
3. **Pick.** `lib/pick.js` reads the date of every photo and video and picks
   30 photos and up to 5 videos for a month. iPhone "live photo" clips and
   screenshots are skipped. If a photo has an edited copy, the edited copy is used.
   The pick is saved in `~/photos/work/<month>/pick.json`, so the same month gives
   the same video again unless you ask for a new pick.
4. **Build.** `lib/video.js` uses ffmpeg. Each photo gets a slow zoom for 3.5
   seconds. Each video clip is cut to 5 seconds. Wide photos get a blurred copy
   of themselves as background. Clips are joined with random transitions. One
   music track is played under everything. The video is wide, 1920x1080, 30 frames per
   second. Set `MOLI_SHAPE=tall` for a phone-shaped 1080x1920 video.

## Commands

```
node takeout.js create 2026     ask Google to pack "Photos from 2026"
node takeout.js status          see if Google is done
node moli.js months             show how many photos and videos each month has
node moli.js make 2026-08       make the video for August 2026
node moli.js make 2026-08 --again   pick new random photos and make it again
node drive.js shot /tmp/a.png   screenshot of the browser (for debugging)
```

Finished videos go to `~/photos/out/<month>.mp4`.

## Folders on the box (not in git)

```
~/photos/browser-profile   the logged-in Chromium profile. Private.
~/photos/takeout           zip files from Google Takeout
~/photos/library           unpacked photos and videos
~/photos/music             music tracks (mp3)
~/photos/work              index, picks, temporary clips, ffmpeg logs
~/photos/out               finished videos
~/photos/start-screen.sh   starts the hidden screen, the browser and noVNC
```

The systemd user service `photo-browser.service` keeps the browser running.
`moli-web.service` serves `~/photos/out` on the Tailscale address, port 8080,
so Iker can watch the videos on the phone.

## Music

The tracks in `~/photos/music` are by Kevin MacLeod (incompetech.com),
licensed under Creative Commons: By Attribution 4.0. Only happy, upbeat tracks (Iker, 2026-09-30).
Every video gets its own track: the picker takes a random track among the least used ones, and
counts uses in `~/photos/music-used.json`. So no track repeats before all tracks were used once.
To add music, drop mp3 files into `~/photos/music`.

## Tools the box needs

```
sudo apt-get install ffmpeg imagemagick libheif-plugin-libde265 libimage-exiftool-perl unzip x11vnc novnc websockify
```

`libheif-plugin-libde265` is the decoder for iPhone HEIC photos. Without it,
ImageMagick says "Unsupported codec" and every HEIC photo is skipped.

## YouTube

`node youtube.js upload ~/photos/out/2026-08.mp4 "August 2026"` uploads one video to
Iker's YouTube channel as **private**, through the YouTube Studio page in the logged-in
browser. No Google API key is needed. If Google changes the Studio page, this script
must be fixed.

## Runs by itself

- `monthly.sh` runs on the 1st of every month at 04:00 (systemd user timer `moli-monthly.timer`).
  It asks Takeout for the year, downloads, unpacks, makes the video of the month that just ended,
  and uploads it as private into the playlist "Our Memory".
- `fetch-export.sh <label>` downloads and unpacks the newest finished export. If Google asks for
  Iker's password, it writes that into Alpha's memory and waits up to 6 days for Iker.
- `run-month.sh YYYY-MM` makes and uploads one month. `backfill.sh 2016 2017 ...` does every month
  of those years, oldest first, skipping months already uploaded.
- `status.js` keeps `~/photos/status.json` and renders it into Alpha's memory file
  `moli-status.md` in the alpha repo, so Alpha can remind Iker when something is stuck.
- `resume-downloads.js` presses Resume on downloads that stopped because the internet dropped.
- Logs: `~/photos/monthly.log`, `~/photos/backfill.log`, `~/photos/work/<month>.log`.

## Disk space

The box has about 100 GB free. A year of photos is 3 to 13 GB as a zip and the same again unpacked.
So: zips are deleted right after unpacking, the small clips are deleted after the join, and
`backfill.sh` deletes a year's photos from `~/photos/library` when all its months are uploaded.
The photos are still in Google Photos. Fetch at most two years at a time.
