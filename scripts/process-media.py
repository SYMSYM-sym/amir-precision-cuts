#!/usr/bin/env python3
"""
process-media.py — turn assets-src/media/*.png into responsive site images.

WHY THIS EXISTS, AND WHY THE SOURCES ARE NOT IN site/

AF5 says the site is derived output: `rm -rf site && npm run derive` must
reproduce every byte. That rules out dropping finished JPEGs into
site/assets/img/ and calling them content — the first `rm -rf site` would
delete artwork nothing could regenerate. It is the same defect that had
script.js living in the output directory.

So the ORIGINALS live in assets-src/media/ (a tracked input, like templates/)
and this script derives the shipped files from them. Delete site/ and the
imagery comes back.

WHAT IT DOES

  1. Trims flat border matting. Several sources came back with a cream
     "gallery poster" frame the prompt never asked for; a border that is not
     part of the art becomes a pale bar on a near-black page.
  2. Resizes to two widths (1600 / 800) so a phone does not download a
     desktop hero.
  3. Encodes WebP + a JPEG fallback. WebP is ~35% smaller and universally
     supported now, but a fallback costs one line in a <picture>.
  4. Writes manifest.json with the FINAL pixel dimensions of every image.
     Those become width/height attributes, which is what stops a late-loading
     image from shoving the page down — CLS is 0 on this site and it stays 0.

Run via `npm run derive -- --only=assets`. Standalone: python3 scripts/process-media.py
"""
import hashlib
import json
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError:
    sys.exit("Pillow is required: pip install pillow --break-system-packages")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src" / "media"
OUT = ROOT / "site" / "assets" / "img" / "media"

WIDTHS = [1600, 800]
JPEG_QUALITY = 82
WEBP_QUALITY = 80


def _line_stats(px, coords):
    vals = [sum(px[c]) / 3 for c in coords]
    return sum(vals) / len(vals), max(vals) - min(vals)


# A matte is near-white paper. Measured across this set: the two genuinely
# matted images sit at 233 and 252 mean luminance on every edge, while the
# gold-gradient artwork peaks at 167 on its lightest edge and disagrees between
# opposite edges by 60+. An ABSOLUTE threshold separates them cleanly; a
# threshold relative to the image centre does not, because a silhouette makes
# the centre almost black and then the gold background looks like paper.
MATTE_MIN_LUMA = 225
MATTE_MAX_SPREAD = 30


def trim_border(im, max_fraction=0.22):
    """
    Remove a flat matte border if one is present.

    Scans inward from each edge and stops at the first line that is not
    near-white and near-uniform. Keeps at least (1 - max_fraction) of each
    dimension, so it can shave a frame but never crop the picture.

    Two earlier versions were wrong in opposite directions and both are worth
    remembering. Corner sampling missed every matte, because the generated
    frames are subtly warmer on one side than the other. Centre-relative
    thresholding then over-corrected and ate 200px of a gold gradient, because
    the artwork it was measuring against is a black silhouette.
    """
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    step_x = max(1, w // 64)
    step_y = max(1, h // 64)

    def scan(is_row, forward):
        limit = int((h if is_row else w) * max_fraction)
        n = 0
        rng = range(h if is_row else w)
        for i in (rng if forward else reversed(rng)):
            coords = ([(x, i) for x in range(0, w, step_x)] if is_row
                      else [(i, y) for y in range(0, h, step_y)])
            mean, spread = _line_stats(px, coords)
            if mean < MATTE_MIN_LUMA or spread > MATTE_MAX_SPREAD:
                break
            n += 1
            if n >= limit:
                break
        return n

    top, bottom = scan(True, True), scan(True, False)
    left, right = scan(False, True), scan(False, False)
    if top + bottom + left + right == 0:
        return im, False
    box = (left, top, w - right, h - bottom)
    if box[2] - box[0] < w * 0.5 or box[3] - box[1] < h * 0.5:
        return im, False
    return im.crop(box), True


def process(path, manifest):
    stem = path.stem
    im = Image.open(path)
    im, trimmed = trim_border(im)
    im = im.convert("RGB")
    src_w, src_h = im.size

    entry = {"source": path.name, "trimmed": trimmed, "variants": []}
    for width in WIDTHS:
        if width > src_w:
            width = src_w
        height = round(src_h * (width / src_w))
        resized = im.resize((width, height), Image.LANCZOS)
        # Content-hashed filenames, so these can be cached FOREVER.
        #
        # Without a hash the only safe header is max-age=0, and a repeat visitor
        # re-validates seven images on every page view. With one, the URL changes
        # whenever the bytes do, so `immutable` is not a gamble.
        #
        # The hash never appears in business.config.yaml: the config references a
        # logical name and site-render.mjs resolves it through the manifest. A
        # human editing config should not have to know a checksum.
        tmp_jpg = OUT / f".{stem}-{width}.tmp.jpg"
        resized.save(tmp_jpg, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        digest = hashlib.sha256(tmp_jpg.read_bytes()).hexdigest()[:8]
        base = f"{stem}-{width}.{digest}"
        webp = OUT / f"{base}.webp"
        jpg = OUT / f"{base}.jpg"
        tmp_jpg.rename(jpg)
        resized.save(webp, "WEBP", quality=WEBP_QUALITY, method=6)
        entry["variants"].append({
            "width": width, "height": height,
            "webp": f"/assets/img/media/{base}.webp",
            "jpg": f"/assets/img/media/{base}.jpg",
            "webp_bytes": webp.stat().st_size,
            "jpg_bytes": jpg.stat().st_size,
        })
        if width == max(WIDTHS) or width == src_w:
            # The path the config points at, and the dimensions the markup needs.
            entry["src"] = f"/assets/img/media/{base}.jpg"
            entry["srcset_webp"] = ""
            entry["width"] = width
            entry["height"] = height
    entry["srcset_webp"] = ", ".join(
        f'{v["webp"]} {v["width"]}w' for v in sorted(entry["variants"], key=lambda v: v["width"]))
    entry["srcset_jpg"] = ", ".join(
        f'{v["jpg"]} {v["width"]}w' for v in sorted(entry["variants"], key=lambda v: v["width"]))
    manifest[stem] = entry
    kb = sum(v["webp_bytes"] for v in entry["variants"]) / 1024
    print(f"      {stem:<12} {src_w}x{src_h}"
          f"{' (border trimmed)' if trimmed else ''} -> {len(entry['variants'])} widths, {kb:.0f} KB webp")


def main():
    if not SRC.is_dir():
        print(f"SKIP  assets-src/media/ (not present) — no imagery configured")
        return 0
    sources = sorted(p for p in SRC.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})
    if not sources:
        print("SKIP  assets-src/media/ is empty")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    # Content-hashed names mean a changed image writes a NEW file rather than
    # overwriting one. Without a sweep, every edit leaves its predecessor behind
    # and the deployed site grows a tail of unreachable images forever.
    for stale in OUT.glob("*"):
        if stale.is_file():
            stale.unlink()
    manifest = {}
    for p in sources:
        process(p, manifest)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    total = sum(v["webp_bytes"] for e in manifest.values() for v in e["variants"]) / 1024
    print(f"WRITE site/assets/img/media/ ({len(manifest)} image(s), {total:.0f} KB webp total)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
