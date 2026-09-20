# KaraSpot

A KaraFun-style karaoke web app that uses **your Spotify catalog** to pick songs, then sings from **audio you actually own** — with key/tempo changes, a guide-vocal mixer, a queue, and synced lyrics.

## What it can (and cannot) do

Spotify will not give third-party apps the raw audio of a track. That is a platform rule, not a missing feature: you cannot legally download a Spotify song and run Demucs on it through the official API. DJ apps that “play Spotify” hit the same wall — stems and offline files are blocked.

KaraSpot is honest about that split:

| Piece | Source |
| --- | --- |
| Search, liked songs, playlists, artwork | Spotify Web API (your account) |
| Synced lyrics | [LRCLIB](https://lrclib.net) |
| Backing track + guide vocal | A file you drop in, or a pair of stems |
| Key (±12 semitones) and tempo (70–130%) | Web Audio + Tone.js GrainPlayer |
| Vocal / instrumental mix | Instant stereo center/side split, or uploaded stems |

That is the same *control surface* as KaraFun (queue, singer name, key, tempo, vocal guide) on top of music you already have.

## Quick start

Serve the folder over HTTP. Opening `index.html` as a file URL will break Spotify login.

```bash
cd karaspot
python3 -m http.server 5500
```

Open **http://127.0.0.1:5500/** (use `127.0.0.1`, not `localhost`).

### Connect Spotify

1. Create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. In the app settings, add Redirect URI `http://127.0.0.1:5500/`.
3. In KaraSpot → Settings, paste the **Client ID** and save.
4. Click **Connect Spotify**.

No client secret is stored. Login uses Authorization Code + PKCE in the browser.

### Sing a song

1. Search Spotify and click a track (lyrics load automatically when they exist).
2. Drop an MP3/WAV/FLAC of that song, **or** upload a matching instrumental + vocal stem pair.
3. Pull **Guide vocal** down to 0 when you know the song; leave a little in while you learn it.
4. Nudge **Key** if the original is out of your range.

Keyboard: Space play/pause, `[` `]` key, arrows seek.

## Better stems than the built-in split

The one-file path uses a classic karaoke trick: treat the stereo mid as vocals and the sides as backing. It is instant and free. It is also messy on heavy mixes, mono files, and anything with wide lead vocals.

For KaraFun-like isolation, split the file first in one of these and upload both stems:

- [Moises](https://moises.ai)
- [LALAL.AI](https://www.lalal.ai)
- Local [Demucs](https://github.com/facebookresearch/demucs) / [Stemmy](https://github.com/pgotta/Stemmy)

```bash
pip install demucs
demucs -n htdemucs_ft your-song.mp3
```

Then use **Instrumental** + **Vocals** in the queue panel.

## Why not “separate Spotify in realtime”?

A few desktop tools tap system audio *after* Spotify has already decoded it on your machine, then run a local model (HTDemucs, Rubber Band). That is a system-audio product, not something a website can do: browsers cannot tap another tab’s DRM stream, and doing so still sits outside Spotify’s terms.

If you want that workflow later, the next step is a small Electron/Tauri wrapper around this UI plus a local Demucs/ONNX engine — same mixer, different audio source.

## Stack

- Static HTML/CSS/JS, no build step
- Spotify Authorization Code + PKCE
- Tone.js `GrainPlayer` for independent pitch and tempo
- LRCLIB for timed lyrics

Personal / practice use with files you own. Do not ship this as a public karaoke catalog of other people’s recordings.
