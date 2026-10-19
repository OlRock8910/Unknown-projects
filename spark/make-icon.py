"""Draws Spark's icon (a white sparkle on a warm gradient) and writes the
launcher icons into android/res/mipmap-*/ic_launcher.png and the web icons
into web/icons/.

The PNGs are committed, so this only needs re-running to change the design:
    python3 spark/make-icon.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
S = 1024


def gradient(size, stops):
    """A diagonal gradient through the given (position, colour) stops."""
    line = Image.new('RGB', (512, 1))
    for x in range(512):
        t = x / 511
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                k = (t - p0) / (p1 - p0)
                line.putpixel((x, 0), tuple(int(c0[i] + (c1[i] - c0[i]) * k) for i in range(3)))
                break
    big = line.resize((size * 2, size * 2)).rotate(-45, resample=Image.BICUBIC)
    o = size // 2
    return big.crop((o, o, o + size, o + size))


def sparkle(cx, cy, r, p=4.2):
    """A four-pointed star with sharp points and inward-curving sides."""
    pts = []
    for k in range(360):
        a = k / 360 * 2 * math.pi
        c, s = math.cos(a), math.sin(a)
        pts.append((cx + r * math.copysign(abs(s) ** p, s), cy - r * math.copysign(abs(c) ** p, c)))
    return pts


def draw():
    img = gradient(S, [(0, (255, 177, 61)), (0.45, (255, 122, 61)), (1, (255, 79, 139))]).convert('RGBA')

    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((262, 262, 762, 762), fill=(255, 255, 255, 110))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(90)))

    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon(sparkle(500, 540, 360), fill=(120, 20, 60, 110))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(26)))

    d = ImageDraw.Draw(img)
    d.polygon(sparkle(500, 510, 360), fill=(255, 255, 255))
    d.polygon(sparkle(785, 245, 120), fill=(255, 255, 255, 235))
    d.polygon(sparkle(250, 800, 80), fill=(255, 255, 255, 210))
    return img


def rounded(img, radius):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main():
    art = draw()
    icon = rounded(art, 230)
    sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for name, px in sizes.items():
        out = HERE / 'android' / 'res' / f'mipmap-{name}'
        out.mkdir(parents=True, exist_ok=True)
        icon.resize((px, px), Image.LANCZOS).save(out / 'ic_launcher.png', optimize=True)
    icons = HERE / 'web' / 'icons'
    icons.mkdir(parents=True, exist_ok=True)
    for px in (192, 512):
        icon.resize((px, px), Image.LANCZOS).save(icons / f'icon-{px}.png', optimize=True)
    # Full-bleed square for Android's "maskable" home-screen icons.
    art.convert('RGB').resize((512, 512), Image.LANCZOS).save(icons / 'maskable-512.png', optimize=True)
    print('icons written')


if __name__ == '__main__':
    main()
