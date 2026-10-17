"""Builds web/og-image.png, the picture shown when someone posts the link
(1280x640, also fits GitHub's social preview). Run promo/screenshots.mjs first."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'docs' / 'screenshots'
W, H = 1280, 640
FONTS = ['/usr/share/fonts/opentype/inter/Inter-Black.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']
FONTS_MED = ['/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']


def font(paths, size):
    for f in paths:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def phone(name, height):
    shot = Image.open(SHOTS / f'{name}.jpg').convert('RGBA')
    w = int(shot.width * height / shot.height)
    shot = shot.resize((w, height), Image.LANCZOS)
    mask = Image.new('L', shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, height - 1), 36, fill=255)
    framed = Image.new('RGBA', (w + 16, height + 16), (0, 0, 0, 0))
    ImageDraw.Draw(framed).rounded_rectangle((0, 0, w + 15, height + 15), 44, fill=(30, 27, 60, 255))
    framed.paste(shot, (8, 8), mask)
    return framed


def main():
    img = Image.new('RGBA', (W, H), (11, 11, 30, 255))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((-300, -300, 600, 500), fill=(124, 58, 237, 150))
    g.ellipse((700, 250, 1500, 1000), fill=(219, 39, 119, 130))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(120)))
    d = ImageDraw.Draw(img)

    icon = Image.open(ROOT / 'web' / 'icons' / 'icon-512.png').convert('RGBA').resize((120, 120), Image.LANCZOS)
    img.alpha_composite(icon, (70, 90))
    d.text((70, 235), 'Adjetivos', font=font(FONTS, 96), fill=(255, 255, 255))
    d.text((74, 355), 'Learn Spanish describing words', font=font(FONTS_MED, 38), fill=(216, 210, 255))
    d.text((74, 402), 'with 19 mini games', font=font(FONTS_MED, 38), fill=(216, 210, 255))
    chips = ['🫧 pop', '🥷 slice', '🔨 whack', '🎧 listen']
    x = 74
    for c in ['Free', 'No ads', 'Offline']:
        f = font(FONTS, 26)
        w = d.textlength(c, font=f) + 36
        d.rounded_rectangle((x, 480, x + w, 528), 24, fill=(250, 204, 21))
        d.text((x + 18, 488), c, font=f, fill=(40, 20, 0))
        x += w + 12

    for i, (name, dx, dy) in enumerate([('bubble-pop', 700, 40), ('whack', 960, 90)]):
        p = phone(name, 560)
        shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle((dx + 10, dy + 20, dx + p.width + 10, dy + p.height + 20), 44, fill=(0, 0, 0, 140))
        img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(18)))
        img.alpha_composite(p, (dx, dy))

    img.convert('RGB').save(ROOT / 'web' / 'og-image.png', optimize=True)
    print('web/og-image.png written')


if __name__ == '__main__':
    main()
