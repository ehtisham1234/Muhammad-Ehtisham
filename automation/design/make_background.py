#!/usr/bin/env python3
"""Ember Calligraphy — procedural background art for Sukhan-e-Dil.

Deep charcoal-to-plum gradient, a single unbroken spiral ink gesture
(a quiet echo of the whirling turn), scattered ember-light, fine grain.
Center third left clear for poem text overlay. 1080x1920 PNG, no text.
"""
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1080, 1920
random.seed(7)
np.random.seed(7)

CHARCOAL = np.array([17, 15, 20])
PLUM = np.array([46, 22, 44])
DEEP_PLUM = np.array([28, 14, 30])
GOLD = np.array([196, 148, 84])


def build_gradient():
    """Multi-pass vertical gradient: charcoal -> plum -> deep plum, in
    several thin overlapping passes so it never reads as one flat ramp."""
    base = np.zeros((H, W, 3), dtype=np.float64)
    ys = np.linspace(0, 1, H)

    def ease(t):
        return t * t * (3 - 2 * t)

    stops = [(0.0, CHARCOAL), (0.45, PLUM), (0.75, PLUM * 0.85 + DEEP_PLUM * 0.15), (1.0, DEEP_PLUM)]
    for y_idx, t in enumerate(ys):
        for i in range(len(stops) - 1):
            t0, c0 = stops[i]
            t1, c1 = stops[i + 1]
            if t0 <= t <= t1 or (i == len(stops) - 2 and t > t1):
                local = 0 if t1 == t0 else (t - t0) / (t1 - t0)
                local = min(max(local, 0), 1)
                color = c0 + (c1 - c0) * ease(local)
                base[y_idx, :, :] = color
                break

    # faint horizontal warmth pooling toward lower-left, built as a second
    # thin pass rather than folded into the ramp above
    xs = np.linspace(0, 1, W)
    xv, yv = np.meshgrid(xs, ys)
    pool = np.exp(-(((xv - 0.28) ** 2) / 0.10 + ((yv - 0.80) ** 2) / 0.10))
    for c in range(3):
        base[:, :, c] += pool * (GOLD[c] - base[:, :, c].mean()) * 0.05

    # smooth away the seams where gradient stops meet
    img = to_image(base)
    img = img.filter(ImageFilter.GaussianBlur(14))
    return np.asarray(img).astype(np.float64)


def add_grain(arr, strength=5.0):
    noise = np.random.normal(0, strength, (H, W, 1))
    return arr + noise


def to_image(arr):
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, mode="RGB")


def spiral_points(cx, cy, turns, start_r, end_r, steps, wobble=3.0):
    pts = []
    for i in range(steps):
        t = i / (steps - 1)
        angle = t * turns * 2 * math.pi
        r = start_r + (end_r - start_r) * (t ** 0.82)
        wob = math.sin(t * 37.0) * wobble * (1 - t * 0.6)
        x = cx + math.cos(angle) * r + wob
        y = cy + math.sin(angle) * r * 1.35 + wob
        pts.append((x, y, t))
    return pts


def draw_stroke(draw, pts, taper_fn, base_radius, alpha_base, color_fn):
    """Lay down a continuous tapering stroke: a filled line between each
    consecutive pair of points, arc-length-dense so it never breaks into
    dots even where the path curvature is high."""
    for i in range(len(pts) - 1):
        x0, y0, t0 = pts[i]
        x1, y1, t1 = pts[i + 1]
        taper = taper_fn(t0)
        radius = base_radius * taper
        alpha = int(alpha_base * taper)
        if alpha <= 0 or radius <= 0.1:
            continue
        color = color_fn(t0)
        draw.line([(x0, y0), (x1, y1)], fill=color + (alpha,), width=max(1, int(radius * 2)))
        draw.ellipse([x1 - radius, y1 - radius, x1 + radius, y1 + radius], fill=color + (alpha,))


def draw_ink_swirl(base_img):
    """A single unbroken spiral gesture — the whirl, held in stillness.
    Rendered as a continuous tapering stroke so it reads as ink laid by a
    moving hand, not a plotted curve."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    cx, cy = W * 0.30, H * 0.83
    pts = spiral_points(cx, cy, turns=3.2, start_r=6, end_r=420, steps=900, wobble=5)

    def taper_main(t):
        return math.sin(t * math.pi) ** 0.55

    def color_main(t):
        gold_mix = 0.18 + 0.30 * (1 - t)
        r = int(GOLD[0] * gold_mix + 60 * (1 - gold_mix))
        g = int(GOLD[1] * gold_mix + 45 * (1 - gold_mix))
        b = int(GOLD[2] * gold_mix + 70 * (1 - gold_mix))
        return (r, g, b)

    draw_stroke(draw, pts, taper_main, base_radius=6.5, alpha_base=95, color_fn=color_main)

    # a second, fainter counter-spiral higher up for balance, well clear
    # of the center reading zone
    cx2, cy2 = W * 0.82, H * 0.10
    pts2 = spiral_points(cx2, cy2, turns=2.0, start_r=4, end_r=190, steps=500, wobble=3)

    def taper_second(t):
        return math.sin(t * math.pi) ** 0.7

    def color_second(_t):
        return (200, 160, 115)

    draw_stroke(draw, pts2, taper_second, base_radius=3.2, alpha_base=48, color_fn=color_second)

    layer = layer.filter(ImageFilter.GaussianBlur(1.3))
    base_img = base_img.convert("RGBA")
    return Image.alpha_composite(base_img, layer)


def scatter_embers(base_img, count=140):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    for _ in range(count):
        # bias away from the clear center band (0.38H - 0.68H)
        while True:
            y = random.uniform(0, H)
            if not (H * 0.36 < y < H * 0.70) or random.random() < 0.12:
                break
        x = random.uniform(0, W)
        # denser near the lower-left swirl
        dist = math.hypot(x - W * 0.30, y - H * 0.83)
        weight = max(0.05, 1.0 - dist / (W * 1.1))
        if random.random() > weight and random.random() > 0.15:
            continue
        r = random.uniform(0.6, 2.6)
        alpha = int(random.uniform(25, 110) * weight)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(230, 190, 140, alpha))

    layer = layer.filter(ImageFilter.GaussianBlur(0.4))
    base_img = base_img.convert("RGBA")
    return Image.alpha_composite(base_img, layer)


def vignette(base_img, strength=0.55):
    layer = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(layer)
    draw.ellipse([-W * 0.35, -H * 0.15, W * 1.35, H * 1.05], fill=255)
    layer = layer.filter(ImageFilter.GaussianBlur(220))
    arr = np.asarray(layer).astype(np.float64) / 255.0
    dark = np.stack([arr] * 3, axis=-1)

    base_arr = np.asarray(base_img.convert("RGB")).astype(np.float64)
    out = base_arr * (dark * (1 - strength) + strength)
    return to_image(out)


def main():
    grad = build_gradient()
    grad = add_grain(grad, strength=9.0)
    img = to_image(grad)

    img = draw_ink_swirl(img)
    img = scatter_embers(img)
    img = img.convert("RGB")
    img = vignette(img, strength=0.35)

    img = img.filter(ImageFilter.GaussianBlur(0.3))

    out_path = "background.png"
    img.save(out_path)
    print(f"Saved {out_path} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
