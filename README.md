# Moli

Moli makes one short video for each month from Iker's Google Photos.
It picks 30 photos and 3 videos at random from the month, adds music and
transitions, and saves a tall video for the phone.

Moli is Alpha's project. Alpha writes the code and runs it on the home box `alpha`.

## How it works

1. **Get the photos.** Google does not let a program read the photo library.
   So Moli uses Google Takeout. Takeout is a Google page that packs photos into
   zip files. Moli drives a real Chromium browser that Iker logged into one time.
   The browser runs on a hidden screen on the box. Iker can see that screen from
   the phone over Tailscale when a login is needed.
2. **Unpack.** The zip files are unpacked into `~/photos/library`.
3. **Pick.** `lib/pick.js` reads the date of every photo and video and picks
   30 photos and up to 3 videos for a month. iPhone "live photo" clips and
   screenshots are skipped. If a photo has an edited copy, the edited copy is used.
   The pick is saved in `~/photos/work/<month>/pick.json`, so the same month gives
   the same video again unless you ask for a new pick.
4. **Build.** `lib/video.js` uses ffmpeg. Each photo gets a slow zoom for 3.5
   seconds. Each video clip is cut to 5 seconds. Wide photos get a blurred copy
   of themselves as background. Clips are joined with random transitions. One
   music track is played under everything. The video is 1080x1920, 30 frames per second.

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
licensed under Creative Commons: By Attribution 4.0.

## Tools the box needs

```
sudo apt-get install ffmpeg imagemagick libheif-plugin-libde265 libimage-exiftool-perl unzip x11vnc novnc websockify
```

`libheif-plugin-libde265` is the decoder for iPhone HEIC photos. Without it,
ImageMagick says "Unsupported codec" and every HEIC photo is skipped.
