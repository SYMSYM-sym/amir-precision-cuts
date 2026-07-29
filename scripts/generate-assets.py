#!/usr/bin/env python3
"""
Brand asset generator — favicon / icon / apple-touch / OG card.

Why this exists (R4): two real, silent, high-cost failures —
  1. No favicon at all  -> Google's listing showed NO logo.
  2. og:image referenced /og.jpg which 404'd -> every social share AND the
     LocalBusiness schema image was broken, sitewide, invisibly.
Referencing an asset is not the same as it existing. Generate them, then VERIFY 200.

Deps:  pip install pillow    (Pillow only; no design tool needed)
Run:   python3 scripts/generate-assets.py
Then:  curl -I https://<domain>/favicon.ico   # expect 200
       curl -I https://<domain>/og.jpg        # expect 200

Reads brand values from business.config.yaml when available, else edit CONFIG below.
Text is drawn with a real TTF (crisp, correct) rather than AI image generation,
which garbles small text.
"""
from PIL import Image, ImageDraw, ImageFont
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---- CONFIG (or load from business.config.yaml) -----------------------------
CONFIG = {
    "initials":  "IFM",                       # business.initials (2-3 chars)
    "name":      "IGOR FOR MEN",              # business.name, uppercase reads best
    "subline":   "PRIVATE MALE GROOMING  ·  WEST HOLLYWOOD",   # type · city
    "footline":  "BY APPOINTMENT ONLY",       # booking.model
    "bg":        (11, 11, 13),                # brand.palette.bg
    "accent":    (200, 164, 92),              # brand.palette.accent
    "accent_dim":(176, 142, 86),
    "muted":     (176, 176, 176),             # brand.palette.muted
}
try:  # optional: pull straight from the config file
    import yaml, re
    with open(os.path.join(ROOT, "business.config.yaml")) as f:
        c = yaml.safe_load(f)
    hexc = lambda h, d: tuple(int(h.lstrip('#')[i:i+2], 16) for i in (0, 2, 4)) if h else d
    CONFIG["initials"] = c["business"]["initials"] or CONFIG["initials"]
    CONFIG["name"]     = (c["business"]["name"] or CONFIG["name"]).upper()
    CONFIG["subline"]  = f'{c["business"]["type"]}  ·  {c["location"]["address_city"]}'.upper()
    CONFIG["footline"] = (c["booking"]["model"] or CONFIG["footline"]).upper()
    CONFIG["bg"]       = hexc(c["brand"]["palette"]["bg"], CONFIG["bg"])
    CONFIG["accent"]   = hexc(c["brand"]["palette"]["accent"], CONFIG["accent"])
    CONFIG["muted"]    = hexc(c["brand"]["palette"]["muted"], CONFIG["muted"])
except Exception:
    pass  # fall back to CONFIG above

# Use a serif for the wordmark/monogram, sans for sublines. Swap to your brand TTFs.
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
for p in (SERIF, SANS):
    if not os.path.exists(p):
        sys.exit(f"Font not found: {p} — install fonts or point these at your brand TTFs.")

def spaced(draw, cx, y, text, font, fill, tracking):
    """Draw letter-spaced, horizontally centered text."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking

def monogram(size):
    img = Image.new("RGB", (size, size), CONFIG["bg"])
    d = ImageDraw.Draw(img)
    pad, bw = int(size * 0.07), max(1, int(size * 0.015))
    d.rounded_rectangle([pad, pad, size - pad, size - pad],
                        radius=int(size * 0.16), outline=CONFIG["accent_dim"], width=bw)
    f = ImageFont.truetype(SERIF, int(size * 0.40))
    d.text((size / 2, size * 0.50), CONFIG["initials"], font=f, fill=CONFIG["accent"], anchor="mm")
    return img

def og_card():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), CONFIG["bg"])
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W - 1, H - 1], outline=(28, 28, 30), width=2)
    spaced(d, W / 2, H / 2 - 110, CONFIG["name"], ImageFont.truetype(SERIF, 96), CONFIG["accent"], 6)
    d.line([(W / 2 - 150, H / 2 + 30), (W / 2 + 150, H / 2 + 30)], fill=CONFIG["accent_dim"], width=2)
    spaced(d, W / 2, H / 2 + 60, CONFIG["subline"], ImageFont.truetype(SANS, 30), CONFIG["muted"], 4)
    spaced(d, W / 2, H - 70, CONFIG["footline"], ImageFont.truetype(SANS, 22), CONFIG["accent_dim"], 6)
    return img

os.makedirs(os.path.join(ROOT, "assets", "img"), exist_ok=True)
icon = monogram(512)
icon.save(os.path.join(ROOT, "assets", "img", "icon-512.png"))          # + schema logo
monogram(180).save(os.path.join(ROOT, "assets", "img", "apple-touch-icon.png"))
icon.save(os.path.join(ROOT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
og_card().save(os.path.join(ROOT, "og.jpg"), quality=92)

for p in ["assets/img/icon-512.png", "assets/img/apple-touch-icon.png", "favicon.ico", "og.jpg"]:
    fp = os.path.join(ROOT, p)
    print(f"  {p:36s} {os.path.getsize(fp):>7} bytes  {Image.open(fp).size}")
print("\nGenerated. Now deploy and VERIFY each returns 200 on the live domain (R4).")
