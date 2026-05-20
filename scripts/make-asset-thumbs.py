#!/usr/bin/env python3
"""Render the campaign-assets designs to thumbnails.

Each entry captures a page via headless Chrome at a window size matched to
the design's natural width, top-crops to 3:2, then resizes to the final
thumb dimensions. Output PNGs land in images/thumbs/.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "images" / "thumbs"
THUMB_W, THUMB_H = 480, 320  # 3:2, 2x of 240x160 display

# Runs first in <head> — bypasses scripts/password-gate.js before it checks.
BYPASS_GATE = (
    "<script>try{sessionStorage.setItem('cr-unlocked','1');}catch(e){}</script>"
)

# Hides the screen-only print-spec banner so the actual ad fills the capture.
# Goes at the END of <head> so it overrides the source page's own CSS.
HIDE_PRINT_META = (
    "<style>.print-meta{display:none!important;}"
    "body{padding:0!important;margin:0!important;background:#fff!important;}"
    "</style>"
)


@dataclass
class Job:
    src: str                   # html file relative to repo root
    name: str                  # output basename
    cap_w: int                 # capture window width (CSS px)
    cap_h: int                 # capture window height (CSS px)
    inject_bottom: str = ""    # <style>/<script> inserted before </head>


# Capture sizes are wide enough that the design fills the frame (no
# horizontal white bars), and tall enough to include the hero/headline.
JOBS = [
    Job("email-1-announce.html", "email-1",     700, 900),
    Job("email-2-speaker.html",  "email-2",     700, 900),
    Job("email-3-lastcall.html", "email-3",     700, 900),
    Job("ad-quarter.html",       "ad-quarter",  500, 1140, inject_bottom=HIDE_PRINT_META),
    Job("ad-eighth.html",        "ad-eighth",   500,  520, inject_bottom=HIDE_PRINT_META),
    Job("ad-half.html",          "ad-half",     1000, 1120, inject_bottom=HIDE_PRINT_META),
    Job("ad-corkboard-300x250.html", "ad-corkboard", 320, 270, inject_bottom=HIDE_PRINT_META),
    Job("flyer.html",            "flyer",       850, 1120, inject_bottom=HIDE_PRINT_META),
    Job("brand-guide.html",      "brand-guide", 1200, 900),
]


def staged_source(job: Job) -> Path:
    """Write a staged copy of the page next to the original (so relative
    asset paths still resolve) with:
      • BYPASS_GATE injected at the TOP of <head> — runs before the gate
        script and sets sessionStorage so the overlay never appears.
      • job.inject_bottom injected just before </head> — last-wins CSS
        overrides (e.g. hide the print-spec banner).
    """
    src_path = ROOT / job.src
    html = src_path.read_text(encoding="utf-8")

    patched, n_top = re.subn(
        r"(<head[^>]*>)",
        f"\\1{BYPASS_GATE}",
        html,
        count=1,
        flags=re.IGNORECASE,
    )
    if n_top == 0:
        raise RuntimeError(f"No <head> in {job.src}; can't inject gate bypass")

    if job.inject_bottom:
        patched, n_bot = re.subn(
            r"(</head>)",
            f"{job.inject_bottom}\\1",
            patched,
            count=1,
            flags=re.IGNORECASE,
        )
        if n_bot == 0:
            raise RuntimeError(f"No </head> in {job.src}; can't inject overrides")

    staged = ROOT / f".thumb-stage-{job.name}.html"
    staged.write_text(patched, encoding="utf-8")
    return staged


def capture(job: Job, tmp: Path) -> Path:
    raw = tmp / f"{job.name}.raw.png"
    src = staged_source(job)
    try:
        cmd = [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=2",
            "--virtual-time-budget=8000",
            f"--window-size={job.cap_w},{job.cap_h}",
            f"--screenshot={raw}",
            f"file://{src}",
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        src.unlink(missing_ok=True)
    if not raw.exists():
        raise RuntimeError(f"Chrome produced no screenshot for {job.src}")
    return raw


def process(raw: Path, name: str) -> Path:
    """Top-crop to THUMB_W:THUMB_H aspect, resize to thumb dims, save PNG."""
    img = Image.open(raw).convert("RGB")
    cw, ch = img.size
    target_ratio = THUMB_W / THUMB_H
    src_ratio = cw / ch
    if src_ratio > target_ratio:
        # Too wide → trim sides (rare for our captures, but handle it).
        new_w = int(ch * target_ratio)
        left = (cw - new_w) // 2
        img = img.crop((left, 0, left + new_w, ch))
    else:
        # Too tall → trim bottom (keep headline).
        new_h = int(cw / target_ratio)
        img = img.crop((0, 0, cw, new_h))
    img = img.resize((THUMB_W, THUMB_H), Image.LANCZOS)
    out = OUT_DIR / f"{name}.png"
    img.save(out, "PNG", optimize=True)
    return out


def main() -> int:
    if not Path(CHROME).exists():
        print(f"Chrome not found at {CHROME}", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for job in JOBS:
            print(f"→ {job.src}", flush=True)
            raw = capture(job, tmp)
            out = process(raw, job.name)
            size_kb = out.stat().st_size / 1024
            print(f"   wrote {out.relative_to(ROOT)}  ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
