#!/usr/bin/env python3
"""Render web-banner HTML pages to 1:1 PNGs at their exact pixel size.

Different shape from make-ad-pdfs.py: banners ship as static images to
ad networks (News-Miner Corkboard, IAB Medium Rectangle), so we capture
PNG at the design's natural pixel dimensions rather than print inches.
Output lands in downloads/ next to the print PDFs.
"""
from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "downloads"

BYPASS_GATE = (
    "<script>try{sessionStorage.setItem('cr-unlocked','1');}catch(e){}</script>"
)


def isolate_banner(width_px: int, height_px: int) -> str:
    """Strip body padding and screen-only chrome so the banner element is
    flush at (0,0) and we can crop the screenshot to exactly width×height."""
    return f"""<style>
html, body {{
  margin: 0 !important;
  padding: 0 !important;
  background: #fff !important;
  width: {width_px}px !important;
  height: {height_px}px !important;
  overflow: hidden !important;
  display: block !important;
}}
.print-meta {{ display: none !important; }}
.banner {{
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  margin: 0 !important;
  box-shadow: none !important;
}}
</style>"""


@dataclass
class Job:
    src: str
    out: str
    width_px: int
    height_px: int


JOBS = [
    # News-Miner Corkboard placement (IAB Medium Rectangle).
    Job("ad-corkboard-300x250.html", "cr-zion-corkboard-300x250.png", 300, 250),
]


def staged_source(job: Job) -> Path:
    src_path = ROOT / job.src
    html = src_path.read_text(encoding="utf-8")
    patched, n = re.subn(
        r"(<head[^>]*>)",
        f"\\1{BYPASS_GATE}",
        html,
        count=1,
        flags=re.IGNORECASE,
    )
    if n == 0:
        raise RuntimeError(f"No <head> in {job.src}; can't inject gate bypass")
    patched, n2 = re.subn(
        r"(</head>)",
        f"{isolate_banner(job.width_px, job.height_px)}\\1",
        patched,
        count=1,
        flags=re.IGNORECASE,
    )
    if n2 == 0:
        raise RuntimeError(f"No </head> in {job.src}; can't inject isolate CSS")
    staged = ROOT / f".banner-stage-{Path(job.src).stem}.html"
    staged.write_text(patched, encoding="utf-8")
    return staged


def render(job: Job) -> Path:
    out_path = OUT_DIR / job.out
    src = staged_source(job)
    # Capture at 2x for retina-grade output, then downsample. Chrome's
    # --force-device-scale-factor=2 produces a 2x-sized PNG that we Lanczos
    # back to exact (width_px, height_px) — sharper than capturing at 1x.
    raw = OUT_DIR / f".raw-{job.out}"
    try:
        cmd = [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=2",
            "--virtual-time-budget=8000",
            f"--window-size={job.width_px},{job.height_px}",
            f"--screenshot={raw}",
            f"file://{src}",
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not raw.exists():
            raise RuntimeError(f"Chrome produced no PNG for {job.src}")
        img = Image.open(raw).convert("RGB")
        # Chrome's screenshot may include a few extra pixels — crop to spec.
        cw, ch = img.size
        if cw > job.width_px * 2 or ch > job.height_px * 2:
            img = img.crop((0, 0, job.width_px * 2, job.height_px * 2))
        img = img.resize((job.width_px, job.height_px), Image.LANCZOS)
        img.save(out_path, "PNG", optimize=True)
    finally:
        src.unlink(missing_ok=True)
        raw.unlink(missing_ok=True)
    return out_path


def main() -> int:
    if not Path(CHROME).exists():
        print(f"Chrome not found at {CHROME}", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for job in JOBS:
        print(f"→ {job.src}", flush=True)
        out = render(job)
        size_kb = out.stat().st_size / 1024
        print(f"   wrote {out.relative_to(ROOT)}  ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
