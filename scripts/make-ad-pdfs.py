#!/usr/bin/env python3
"""Render the print-ad HTML pages to press-ready PDFs.

Each ad page already declares its trim size via `@page { size: ... }` and
hides the on-screen print-spec banner inside `@media print`. We just need
to feed the page through headless Chrome's `--print-to-pdf` while:
  • bypassing scripts/password-gate.js (sessionStorage flag injected in <head>)
  • suppressing Chrome's URL/date header & footer

Output lands in downloads/ and is wired into campaign-assets.html as a
direct download so Liz / the newspaper contact doesn't have to do
File → Print → Save-as-PDF themselves.
"""
from __future__ import annotations

import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "downloads"

# Runs first in <head> — flips the gate's sessionStorage before it checks.
BYPASS_GATE = (
    "<script>try{sessionStorage.setItem('cr-unlocked','1');}catch(e){}</script>"
)

# Chrome's --print-to-pdf decodes Cloudinary's auto-format (often WebP/AVIF)
# and re-embeds it as a sizable raster — a clean Cloudinary delivery turns
# into a 22 MB PDF. Forcing f_jpg with a sane width keeps the PDF small
# while staying well above 300 DPI for the printed sizes we ship.
CLOUDINARY_DELIVERY = re.compile(
    r"https://res\.cloudinary\.com/dsbllwpbh/image/upload/[^\"'\s)]*?"
    r"cr-zion-20th/[^\"'\s)]+"
)


def cloudinary_constrain(url: str) -> str:
    """Rewrite a Cloudinary delivery URL to force f_jpg, q_80, w_1800.
    Leaves SVG assets alone (we shouldn't rasterize the seal)."""
    if url.endswith(".svg"):
        return url
    # Strip any existing transformation segment between `/upload/` and the
    # asset id, then insert our own.
    prefix, tail = url.split("/upload/", 1)
    # tail looks like  "f_auto,q_auto,w_1200/cr-zion-20th/foo.png"
    # or               "cr-zion-20th/foo.png"
    # or               "v1778548225/cr-zion-20th/foo.svg"
    parts = tail.split("/")
    # Drop a leading transformation segment if it contains "_" (Cloudinary
    # uses key_value pairs separated by commas), but keep a "v123..." version.
    if parts and "_" in parts[0] and not parts[0].startswith("v"):
        parts = parts[1:]
    rebuilt = "/".join(parts)
    return f"{prefix}/upload/f_jpg,q_80,w_1800/{rebuilt}"


def print_override(width_in: float, height_in: float) -> str:
    """Inline stylesheet injected at the end of <head> in the staged copy.
    Forces the print layout *unconditionally* — we can't rely on Chrome's
    --print-to-pdf reliably activating @media print, and screen defaults
    (body padding, flex centering, .ad-wrap < page size) leave a white
    band at the top and cause the bottom to bleed onto page 2."""
    w, h = f"{width_in}in", f"{height_in}in"
    return f"""<style>
@page {{ size: {w} {h}; margin: 0; }}
html, body {{
  margin: 0 !important;
  padding: 0 !important;
  width: {w} !important;
  height: {h} !important;
  min-height: 0 !important;
  background: #fff !important;
  display: block !important;
  overflow: hidden !important;
}}
.print-meta {{ display: none !important; }}
.ad-wrap {{
  width: {w} !important;
  height: {h} !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  page-break-after: avoid !important;
  break-after: avoid !important;
  overflow: hidden !important;
}}
</style>"""


@dataclass
class Job:
    src: str        # html file relative to repo root
    out: str        # pdf filename (no path)
    width_in: float
    height_in: float


JOBS = [
    # Quarter-page width is 4.92" per Ann at the Fairbanks News-Miner
    # (2026-05-14 email); design was originally drawn at 4.625" so we
    # widened the wrap to match the column spec they actually print at.
    Job("ad-quarter.html", "cr-zion-ad-quarter-4.92x10.5.pdf",  4.92,  10.5),
    Job("ad-half.html",    "cr-zion-ad-half-9.375x10.5.pdf",   9.375, 10.5),
]


def staged_source(job: Job) -> Path:
    """Write a staged copy of the page next to the original (so relative
    asset paths still resolve) with BYPASS_GATE injected at the top of
    <head>. Returns the staged path; caller cleans up.
    """
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
    # Constrain every Cloudinary delivery URL on the page (skips SVG).
    patched = CLOUDINARY_DELIVERY.sub(lambda m: cloudinary_constrain(m.group(0)), patched)
    # Inject print-layout override at the END of <head> (last-wins).
    patched, n2 = re.subn(
        r"(</head>)",
        f"{print_override(job.width_in, job.height_in)}\\1",
        patched,
        count=1,
        flags=re.IGNORECASE,
    )
    if n2 == 0:
        raise RuntimeError(f"No </head> in {job.src}; can't inject print override")
    staged = ROOT / f".pdf-stage-{Path(job.src).stem}.html"
    staged.write_text(patched, encoding="utf-8")
    return staged


def render(job: Job) -> Path:
    out_path = OUT_DIR / job.out
    src = staged_source(job)
    try:
        cmd = [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-pdf-header-footer",
            "--virtual-time-budget=10000",
            f"--print-to-pdf={out_path}",
            f"file://{src}",
        ]
        subprocess.run(
            cmd, check=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    finally:
        src.unlink(missing_ok=True)
    if not out_path.exists():
        raise RuntimeError(f"Chrome produced no PDF for {job.src}")
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
