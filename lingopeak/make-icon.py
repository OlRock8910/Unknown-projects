"""Draws the launcher icon (android/res/mipmap-*/ic_launcher.png) and the web
icons (web/icons/): a white mountain with a coral flag on cobalt blue.

    python3 make-icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
S = 1024
BLUE, BLUE_D, WHITE, CORAL, YELLOW, INK = (47, 91, 234), (31, 63, 176), (255, 255, 255), (255, 90, 78), (255, 197, 49), (27, 29, 42)


def draw(size, round_icon=True):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if round_icon:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=230, fill=BLUE)
    else:
        d.rectangle((0, 0, S, S), fill=BLUE)
    d.ellipse((650, 190, 790, 330), fill=YELLOW)                       # sun
    d.polygon([(130, 820), (450, 300), (590, 520), (680, 400), (900, 820)], fill=WHITE)   # mountains
    d.polygon([(450, 300), (520, 410), (470, 390), (430, 430), (395, 390)], fill=(220, 228, 255))  # snow cap
    d.rectangle((130, 820, 900, 860), fill=WHITE)
    d.line([(450, 300), (450, 150)], fill=INK, width=18)                # flag pole
    d.polygon([(459, 150), (600, 190), (459, 232)], fill=CORAL)        # flag
    return im.resize((size, size), Image.LANCZOS)


for folder, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    out = HERE / 'android' / 'res' / f'mipmap-{folder}' / 'ic_launcher.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    draw(px).save(out)
(HERE / 'web' / 'icons').mkdir(parents=True, exist_ok=True)
for px in (192, 512):
    draw(px, round_icon=False).save(HERE / 'web' / 'icons' / f'icon-{px}.png')
print('icons drawn')
