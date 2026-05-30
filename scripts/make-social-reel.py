#!/usr/bin/env python3
"""Assemble the vertical (1080×1920) social Reel for the CR 20th Anniversary.

Three crossfaded scenes, built entirely from existing campaign assets — no
shoot required:

  Scene 1 (church cinemagraph)  the rainbow-church clip as a full-width sharp
                                band over a blurred fill of itself, with the
                                seal + "20 Years of Hope & Healing" headline.
  Scene 2 (hands, Ken Burns)    hands-connecting photo, slow zoom, with
                                "Free Friday Night · All Are Welcome · Tommy".
  Scene 3 (end card)            the static 9:16 design (dates + CTA), slow zoom.

On-brand Montserrat type is rendered to transparent PNG overlays via headless
Chrome (same engine as make-web-banners.py), then composited in ffmpeg. Output
is a silent H.264 MP4 — add audio in-app when posting (the algorithms prefer
their own library tracks, and baked-in music is a licensing risk).

Run:  python3 scripts/make-social-reel.py
      python3 scripts/make-social-reel.py --audio path/to/track.mp3

With --audio, a second file (…-music.mp4) is written: the same video with the
track muxed on, trimmed to length, with a short fade in/out. The silent master
is always produced too.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "downloads" / "cr-zion-social-reel-1080x1920.mp4"
OUT_MUSIC = ROOT / "downloads" / "cr-zion-social-reel-1080x1920-music.mp4"
TMP = Path("/tmp")

# Sources
VIDEO    = ROOT / "assets" / "zionlutheranchurch-celebrate-recovery.mp4"
HANDS    = ROOT / "images" / "hands-connecting.jpeg"
ENDCARD  = ROOT / "downloads" / "cr-zion-social-story-1080x1920.png"
TITLE1_HTML = ROOT / "scripts" / "reel-title-1.html"
TITLE2_HTML = ROOT / "scripts" / "reel-title-2.html"
TITLE1_PNG  = TMP / "reel-title-1.png"
TITLE2_PNG  = TMP / "reel-title-2.png"

# Scene timing (seconds) and crossfade
S1, S2, S3 = 4.0, 5.0, 4.5
XF = 0.7
FPS = 30
TOTAL = round(S1 + S2 + S3 - 2 * XF, 2)   # final reel length (= 12.1s)


def render_overlay(html: Path, png: Path) -> None:
    cmd = [
        CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
        "--default-background-color=00000000",      # transparent canvas
        "--force-device-scale-factor=2",            # 2160×3840 for crisp type
        "--virtual-time-budget=8000",               # let fonts + seal load
        "--window-size=1080,1920",
        f"--screenshot={png}", f"file://{html}",
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not png.exists():
        raise RuntimeError(f"Chrome produced no overlay PNG for {html.name}")


def build_filter() -> str:
    return (
        # ── Scene 1: church band over blurred fill + title1 ──────────────
        f"[0:v]trim=0:{S1},setpts=PTS-STARTPTS,fps={FPS}[v];"
        "[v]split[vbg][vfg];"
        "[vbg]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,boxblur=26:2,eq=brightness=-0.05[bg];"
        "[vfg]scale=1080:-2[band];"                       # 1080×602 sharp band
        "[3:v]scale=1080:1920[t1];"
        "[bg][t1]overlay=0:0[bgt];"
        "[bgt][band]overlay=0:659:format=auto,"
        "setsar=1,format=yuv420p[s1];"
        # ── Scene 2: hands photo Ken Burns zoom + title2 ─────────────────
        # Cover-crop the 3:2 photo to 9:16 BEFORE zoompan — feeding a non-9:16
        # source straight to a 9:16 output stretches it. Prep at 2× for zoom
        # headroom, then a gentle zoom (same aspect in/out = no distortion).
        "[1:v]scale=2160:3840:force_original_aspect_ratio=increase,"
        "crop=2160:3840,setsar=1,"
        f"zoompan=z='min(zoom+0.0006,1.12)':d={int(S2*FPS)}:s=1080x1920:"
        "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"fps={FPS}[bg2];"
        "[4:v]scale=1080:1920[t2];"
        "[bg2][t2]overlay=0:0,setsar=1,format=yuv420p[s2];"
        # ── Scene 3: static end card slow zoom ───────────────────────────
        "[2:v]scale=1188:2112,setsar=1,"
        f"zoompan=z='min(zoom+0.0004,1.05)':d={int(S3*FPS)}:s=1080x1920:"
        "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"fps={FPS}[s3];"
        # ── Crossfades ───────────────────────────────────────────────────
        f"[s1][s2]xfade=transition=fade:duration={XF}:offset={S1-XF}[x1];"
        f"[x1][s3]xfade=transition=fade:duration={XF}:offset={S1+S2-2*XF}[v];"
        f"[v]format=yuv420p[out]"
    )


def mux_audio(audio: Path, start: float = 0.0) -> Path:
    """Mux a music track onto the finished silent reel, trimmed to length with
    a 0.3s fade-in and 0.5s fade-out. Re-uses the encoded video (-c:v copy).

    `start` seeks into the track first, so you can skip a slow intro and ride
    the fuller/climactic part of the song under the 12s reel.
    """
    fade_out_start = round(TOTAL - 0.5, 2)
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-ss", str(start), "-i", str(audio),   # seek into the track
        "-i", str(OUT),
        "-filter:a", f"afade=t=in:st=0:d=0.3,afade=t=out:st={fade_out_start}:d=0.5",
        "-map", "1:v", "-map", "0:a",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest", "-movflags", "+faststart",
        str(OUT_MUSIC),
    ]
    subprocess.run(cmd, check=True)
    return OUT_MUSIC


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the CR 20th Anniversary social Reel.")
    ap.add_argument("--audio", type=Path, default=None,
                    help="optional music track (mp3/wav/m4a) to mux onto the reel")
    ap.add_argument("--audio-start", type=float, default=0.0, metavar="SEC",
                    help="seconds to skip into the track before the reel's audio "
                         "begins (use to ride the fuller part of the song)")
    args = ap.parse_args()

    for p in (VIDEO, HANDS, ENDCARD, TITLE1_HTML, TITLE2_HTML):
        if not p.exists():
            print(f"Missing source: {p}", file=sys.stderr)
            return 1
    if args.audio and not args.audio.exists():
        print(f"Audio file not found: {args.audio}", file=sys.stderr)
        return 1
    if not Path(CHROME).exists():
        print(f"Chrome not found at {CHROME}", file=sys.stderr)
        return 1

    print("→ rendering type overlays …", flush=True)
    render_overlay(TITLE1_HTML, TITLE1_PNG)
    render_overlay(TITLE2_HTML, TITLE2_PNG)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    print("→ assembling reel with ffmpeg …", flush=True)
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(VIDEO),
        "-i", str(HANDS),
        "-i", str(ENDCARD),
        "-i", str(TITLE1_PNG),
        "-i", str(TITLE2_PNG),
        "-filter_complex", build_filter(),
        "-map", "[out]",
        "-r", str(FPS),
        "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-crf", "19", "-preset", "medium",
        "-movflags", "+faststart",
        "-an",
        str(OUT),
    ]
    subprocess.run(cmd, check=True)
    size_mb = OUT.stat().st_size / 1e6
    print(f"   wrote {OUT.relative_to(ROOT)}  ({size_mb:.1f} MB)")

    if args.audio:
        print(f"→ muxing audio ({args.audio.name}, start {args.audio_start:g}s) …", flush=True)
        out_music = mux_audio(args.audio, args.audio_start)
        size_mb = out_music.stat().st_size / 1e6
        print(f"   wrote {out_music.relative_to(ROOT)}  ({size_mb:.1f} MB)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
