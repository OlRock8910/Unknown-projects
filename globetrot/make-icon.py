"""Draws the launcher icon into android/res/mipmap-*/ic_launcher.png and web/icons/.

The PNGs are committed, so this only needs re-running to change the design:
    python3 globetrot/make-icon.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
S = 1024
NAVY = (10, 15, 30)
MINT = (46, 211, 167)
VIOLET = (139, 124, 255)
GOLD = (255, 200, 87)


def gradient(size, top, bottom):
    g = Image.new('RGB', (1, 256))
    for y in range(256):
        t = y / 255
        g.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return g.resize((size, size))


def draw():
    img = gradient(S, (24, 40, 82), NAVY).convert('RGBA')
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((150, 170, 870, 890), fill=MINT + (70,))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(90)))

    # The globe: a mint disc with a darker night side, crossed by meridians and parallels.
    cx, cy, r = 500, 540, 330
    globe = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(globe)
    gd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=MINT)
    shade = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shade).ellipse((cx - r + 120, cy - r + 90, cx + r + 260, cy + r + 230), fill=(8, 60, 70, 110))
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
    globe = Image.alpha_composite(globe, Image.composite(shade.filter(ImageFilter.GaussianBlur(30)), Image.new('RGBA', (S, S)), mask))
    lines = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    w = 16
    line = (6, 35, 27, 150)
    for f in (0.0, 0.5, 0.86):
        ld.ellipse((cx - r * f, cy - r, cx + r * f, cy + r), outline=line, width=w)
    for lat in (-0.5, 0, 0.5):
        y = cy + r * lat
        half = r * math.sqrt(1 - lat * lat)
        ld.line((cx - half, y, cx + half, y), fill=line, width=w)
    globe = Image.alpha_composite(globe, Image.composite(lines, Image.new('RGBA', (S, S)), mask))
    ImageDraw.Draw(globe).ellipse((cx - r, cy - r, cx + r, cy + r), outline=(255, 255, 255, 90), width=10)
    img = Image.alpha_composite(img, globe)

    # A gold map pin planted on the top right, with a soft shadow.
    px, py = 712, 330
    pin = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(pin)
    sd.ellipse((px - 70, py + 250, px + 70, py + 285), fill=(0, 0, 0, 90))
    pin = pin.filter(ImageFilter.GaussianBlur(10))
    pd = ImageDraw.Draw(pin)
    pr = 128
    pd.polygon([(px - pr * 0.82, py + pr * 0.55), (px + pr * 0.82, py + pr * 0.55), (px, py + 265)], fill=GOLD)
    pd.ellipse((px - pr, py - pr, px + pr, py + pr), fill=GOLD, outline=(255, 255, 255), width=0)
    pd.ellipse((px - 50, py - 50, px + 50, py + 50), fill=NAVY)
    img = Image.alpha_composite(img, pin)
    return img


def rounded(img, radius):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main():
    art = rounded(draw(), 230)
    sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for name, px in sizes.items():
        out = HERE / 'android' / 'res' / f'mipmap-{name}'
        out.mkdir(parents=True, exist_ok=True)
        art.resize((px, px), Image.LANCZOS).save(out / 'ic_launcher.png', optimize=True)
    icons = HERE / 'web' / 'icons'
    icons.mkdir(parents=True, exist_ok=True)
    for px in (192, 512):
        art.resize((px, px), Image.LANCZOS).save(icons / f'icon-{px}.png', optimize=True)
    docs = HERE / 'docs'
    docs.mkdir(exist_ok=True)
    art.resize((256, 256), Image.LANCZOS).save(docs / 'icon.png', optimize=True)
    print('icons written')


if __name__ == '__main__':
    main()
