#!/usr/bin/env python3
"""
Brand asset generator — favicon / icon / apple-touch / OG card.

Why this exists (R4): two real, silent, high-cost failures —
  1. No favicon at all  -> Google's listing showed NO logo.
  2. og:image referenced /og.jpg which 404'd -> every social share AND the
     LocalBusiness schema image was broken, sitewide, invisibly.
Referencing an asset is not the same as it existing. Generate them, then VERIFY 200.

Deps:  pip install Pillow PyYAML
Run:   python3 scripts/generate-assets.py   (or `npm run derive --only=assets`)
Then:  curl -I https://<domain>/favicon.ico   # expect 200
       curl -I https://<domain>/og.jpg        # expect 200

Text is drawn with a real TTF (crisp, correct) rather than image generation,
which garbles small text.

CHANGED FROM THE REFERENCE — two things, both load-bearing:

  1. It no longer falls back to a hardcoded business. The reference wrapped the
     config read in `except Exception: pass` over a CONFIG dict pre-filled with
     the reference barbershop, so ANY problem -- a missing key, a typo, a config
     that had not been created yet -- silently produced that shop's OG card and
     monogram for somebody else's site. That is bug A4 in Python, and it is not
     in the porting notes. It is a hard failure now.

  2. It handles light palettes. The reference assumed a dark background
     throughout (a literal (28,28,30) border, a literal "accent_dim"), so a
     brand with a light background got an OG card with near-invisible text --
     and nobody inspects their own og.jpg.
"""
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit(
        "Pillow is not installed.\n"
        "  pip install Pillow\n\n"
        "Note: the asset generator is Python, not Node -- a machine without "
        "Python 3 + Pillow is a silent failure inside an otherwise-npm workflow."
    )

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The deployable root. Everything the browser can reach lives under site/.
SITE = os.path.join(ROOT, "site")
CONFIG_PATH = os.environ.get("BUSINESS_CONFIG") or os.path.join(ROOT, "business.config.yaml")
if not os.path.isabs(CONFIG_PATH):
    CONFIG_PATH = os.path.join(ROOT, CONFIG_PATH)


def die(msg):
    sys.exit(f"generate-assets: {msg}")


def load_config():
    """Read the config, or stop. No defaults -- see the note at the top."""
    try:
        import yaml
    except ImportError:
        die("PyYAML is not installed.  pip install PyYAML")
    if not os.path.exists(CONFIG_PATH):
        die(
            f"business.config.yaml not found at {CONFIG_PATH}.\n"
            "  There is deliberately no fallback: a default would render another "
            "business's monogram and OG card onto this site."
        )
    with open(CONFIG_PATH, encoding="utf-8") as f:
        c = yaml.safe_load(f)

    missing = []

    def need(path):
        node = c
        for k in path.split("."):
            if not isinstance(node, dict) or k not in node or node[k] in (None, ""):
                missing.append(path)
                return None
            node = node[k]
        return node

    vals = {
        "initials": need("business.initials"),
        "name": need("business.name"),
        "type": need("business.type"),
        "city": need("location.address_city"),
        "model": need("booking.model"),
        "bg": need("brand.palette.bg"),
        "accent": need("brand.palette.accent"),
        "muted": need("brand.palette.muted"),
        "text": need("brand.palette.text"),
    }
    if missing:
        die("business.config.yaml is missing: " + ", ".join(missing))
    return vals


def hex_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def luminance(rgb):
    def lin(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = (la, lb) if la > lb else (lb, la)
    return (hi + 0.05) / (lo + 0.05)


raw = load_config()

BG = hex_rgb(raw["bg"])
ACCENT = hex_rgb(raw["accent"])
MUTED = hex_rgb(raw["muted"])
TEXT = hex_rgb(raw["text"])
DARK_THEME = luminance(BG) < 0.5

# Derived, not hardcoded.
ACCENT_DIM = mix(ACCENT, BG, 0.35)
BORDER = mix(BG, TEXT, 0.10)

# A pale accent on a pale ground is unreadable at favicon size.
if contrast(ACCENT, BG) < 3.0:
    ACCENT_ON_BG = TEXT
    print(
        f"  note: accent {raw['accent']} is only {contrast(ACCENT, BG):.2f}:1 on "
        f"{raw['bg']} -- using the text colour so the monogram stays legible"
    )
else:
    ACCENT_ON_BG = ACCENT

CONFIG = {
    "initials": raw["initials"],
    "name": raw["name"].upper(),
    "subline": f'{raw["type"]}  \u00b7  {raw["city"]}'.upper(),
    "footline": raw["model"].upper(),
}

FONT_CANDIDATES = {
    "serif": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "C:/Windows/Fonts/georgiab.ttf",
    ],
    "sans": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ],
}


def find_font(kind):
    for p in FONT_CANDIDATES[kind]:
        if os.path.exists(p):
            return p
    die(
        f"No {kind} font found. Tried:\n  " + "\n  ".join(FONT_CANDIDATES[kind]) +
        "\nInstall one (e.g. `apt install fonts-dejavu-core`) or add your brand TTF."
    )


SERIF = find_font("serif")
SANS = find_font("sans")


def spaced(draw, cx, y, text, font, fill, tracking):
    """Draw letter-spaced, horizontally centred text."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking


def fit_font(draw, text, path, max_width, start, tracking, floor=18):
    """Shrink until it fits. A long business name used to run off the card."""
    size = start
    while size > floor:
        f = ImageFont.truetype(path, size)
        w = sum(draw.textlength(ch, font=f) for ch in text) + tracking * (len(text) - 1)
        if w <= max_width:
            return f
        size -= 2
    return ImageFont.truetype(path, floor)


def monogram(size):
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    pad = int(size * 0.07)
    bw = max(1, int(size * 0.015))
    d.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=int(size * 0.16), outline=ACCENT_DIM, width=bw,
    )
    # Scale down as the monogram gets longer so 4 characters do not overflow.
    scale = {2: 0.42, 3: 0.34, 4: 0.26}.get(len(CONFIG["initials"]), 0.30)
    f = ImageFont.truetype(SERIF, int(size * scale))
    d.text((size / 2, size * 0.50), CONFIG["initials"], font=f, fill=ACCENT_ON_BG, anchor="mm")
    return img


def og_card():
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W - 1, H - 1], outline=BORDER, width=2)

    name_font = fit_font(d, CONFIG["name"], SERIF, W - 160, 96, 6)
    spaced(d, W / 2, H / 2 - 110, CONFIG["name"], name_font, ACCENT_ON_BG, 6)
    d.line([(W / 2 - 150, H / 2 + 30), (W / 2 + 150, H / 2 + 30)], fill=ACCENT_DIM, width=2)

    sub_font = fit_font(d, CONFIG["subline"], SANS, W - 160, 30, 4)
    spaced(d, W / 2, H / 2 + 60, CONFIG["subline"], sub_font, MUTED, 4)
    spaced(d, W / 2, H - 70, CONFIG["footline"], ImageFont.truetype(SANS, 22), ACCENT_DIM, 6)
    return img


os.makedirs(os.path.join(SITE, "assets", "img"), exist_ok=True)
icon = monogram(512)
icon.save(os.path.join(SITE, "assets", "img", "icon-512.png"))          # + schema logo
monogram(180).save(os.path.join(SITE, "assets", "img", "apple-touch-icon.png"))
icon.save(os.path.join(SITE, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
og_card().save(os.path.join(SITE, "og.jpg"), quality=92)

for p in ["assets/img/icon-512.png", "assets/img/apple-touch-icon.png", "favicon.ico", "og.jpg"]:
    fp = os.path.join(SITE, p)
    if os.path.getsize(fp) == 0:
        die(f"{p} wrote zero bytes")
    print(f"  site/{p:34s} {os.path.getsize(fp):>7} bytes  {Image.open(fp).size}")

print(f"\n  theme detected: {'dark' if DARK_THEME else 'light'} (bg {raw['bg']})")
print("  Generated. Now deploy and VERIFY each returns 200 on the live domain (R4).")
