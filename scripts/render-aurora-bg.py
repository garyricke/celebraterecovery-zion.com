#!/usr/bin/env python3
"""
Render an aurora-style email background PNG that mirrors the website's
.aurora-stage CSS:

    background:
      radial-gradient(ellipse 70% 420px at 18% 0%,  rgba(232,98,42,.45), transparent 65%),
      radial-gradient(ellipse 80% 480px at 82% 12%, rgba(64,140,200,.48), transparent 68%),
      linear-gradient(180deg, #0a1340 0%, #0F1F5C 32%, #0F1F5C 100%);

Output: images/aurora-bg-email.png  (1200×500, optimized PNG)
"""
from pathlib import Path
import numpy as np
from PIL import Image

W, H = 1200, 500
OUT = Path(__file__).resolve().parent.parent / "images" / "aurora-bg-email.png"


def linear_v_gradient(top_rgb, bot_rgb, stop=1.0):
    """Vertical linear gradient. `stop` < 1 holds bot_rgb after that fraction."""
    band = np.zeros((H, W, 3), dtype=np.float32)
    for y in range(H):
        t = min(y / (H * stop), 1.0)
        band[y, :, 0] = top_rgb[0] + (bot_rgb[0] - top_rgb[0]) * t
        band[y, :, 1] = top_rgb[1] + (bot_rgb[1] - top_rgb[1]) * t
        band[y, :, 2] = top_rgb[2] + (bot_rgb[2] - top_rgb[2]) * t
    return band


def radial_overlay(cx, cy, rx, ry, rgb, peak_alpha, transparent_at=0.65, exp=1.6):
    """
    Mimics CSS `radial-gradient(ellipse <rx> <ry> at <cx> <cy>,
                                 rgba(...peak), transparent <transparent_at>)`.
    Returns a (H, W, 4) float32 RGBA layer in 0..255.
    """
    y, x = np.ogrid[:H, :W]
    d = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    t = np.clip(d / transparent_at, 0, 1)
    falloff = (1.0 - t) ** exp
    alpha = peak_alpha * falloff
    layer = np.zeros((H, W, 4), dtype=np.float32)
    layer[..., 0] = rgb[0]
    layer[..., 1] = rgb[1]
    layer[..., 2] = rgb[2]
    layer[..., 3] = alpha
    return layer


def composite(base_rgb, overlay_rgba):
    """Alpha-composite an RGBA overlay onto an RGB base. Both float32 0..255."""
    a = overlay_rgba[..., 3:4] / 255.0
    return base_rgb * (1 - a) + overlay_rgba[..., :3] * a


# ── 1. Base vertical gradient #0a1340 → #0F1F5C ──
base = linear_v_gradient((10, 19, 64), (15, 31, 92), stop=0.45)

# ── 2. Orange glow upper-left ──
# center at 18% from left, slightly above frame; ellipse 70% × ~420px
orange = radial_overlay(
    cx=W * 0.18, cy=-H * 0.05,
    rx=W * 0.70, ry=420,
    rgb=(232, 98, 42),
    peak_alpha=255 * 0.45,
    transparent_at=0.65,
    exp=1.4,
)

# ── 3. Blue glow upper-right ──
blue = radial_overlay(
    cx=W * 0.82, cy=H * 0.12,
    rx=W * 0.80, ry=480,
    rgb=(64, 140, 200),
    peak_alpha=255 * 0.48,
    transparent_at=0.68,
    exp=1.4,
)

# ── 4. Composite ──
result = composite(base, orange)
result = composite(result, blue)
result = np.clip(result, 0, 255).astype(np.uint8)

# ── 5. Save ──
OUT.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray(result, "RGB").save(OUT, "PNG", optimize=True)
print(f"✅  wrote {OUT}  ({OUT.stat().st_size // 1024} KB)")
