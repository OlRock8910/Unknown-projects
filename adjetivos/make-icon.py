"""Draws the launcher icon into android/res/mipmap-*/ic_launcher.png.

The PNGs are committed, so this only needs re-running to change the design:
    python3 spanish-adjectives/make-icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
S = 1024
FONTS = [
    '/usr/share/fonts/opentype/inter/Inter-Black.otf',
    '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]


def font(size):
    for f in FONTS:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def gradient(size, top, bottom):
    g = Image.new('RGB', (1, 256))
    for y in range(256):
        t = y / 255
        g.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return g.resize((size, size))


def draw():
    img = gradient(S, (124, 58, 237), (236, 72, 153)).convert('RGBA')
    d = ImageDraw.Draw(img)
    # Soft glow blobs.
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-200, -260, 620, 520), fill=(255, 255, 255, 60))
    gd.ellipse((560, 640, 1240, 1300), fill=(250, 204, 21, 70))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(60)))
    d = ImageDraw.Draw(img)

    # Speech bubble with a shadow.
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((190, 230, 834, 730), 150, fill=(40, 0, 80, 120))
    sd.polygon([(330, 700), (300, 850), (480, 715)], fill=(40, 0, 80, 120))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(24)).transform((S, S), Image.AFFINE, (1, 0, 0, 0, 1, -18)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((190, 210, 834, 710), 150, fill=(255, 255, 255))
    d.polygon([(330, 680), (300, 830), (480, 695)], fill=(255, 255, 255))

    # "¡ñ!" in the bubble.
    f = font(330)
    text = '¡ñ!'
    box = d.textbbox((0, 0), text, font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((S - w) / 2 - box[0], 460 - h / 2 - box[1]), text, font=f, fill=(109, 40, 217))

    # A little star, because games.
    cx, cy, r1, r2 = 800, 230, 110, 46
    import math
    pts = []
    for k in range(10):
        r = r1 if k % 2 == 0 else r2
        a = -math.pi / 2 + k * math.pi / 5
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=(250, 204, 21), outline=(255, 255, 255), width=10)
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
    print('icons written')


if __name__ == '__main__':
    main()
