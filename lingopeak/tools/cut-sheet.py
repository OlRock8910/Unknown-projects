#!/usr/bin/env python3
"""Cuts a 5×2 picture sheet (10 drawings on a magenta background) into ten
separate pictures with see-through backgrounds.

    python3 tools/cut-sheet.py art/sheets/cast-neutral.jpg web/img/cast \
        banana shark dino astro penguin bee pizza knight avocado croissant

Writes web/img/cast/banana.webp etc. Add a suffix with --suffix=-happy.
Other grids: --cols=5 --rows=3 (then give 15 names). Icons made of
separate parts (three hearts, a tick and a cross) need --gap=60.
"""
import sys
import numpy as np
from PIL import Image

COLS, ROWS = 5, 2


def key_out_magenta(rgb):
    """Alpha from how magenta each pixel is, with the pink fringe removed."""
    a = rgb.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g                      # 150–220 on the background, ≤ 30 on the drawings
    alpha = np.clip((140 - m) / 80, 0, 1)         # opaque below 60, clear above 140
    spill = np.clip(m, 0, None) * (m > 25)        # take the magenta cast off edge pixels
    out = np.stack([r - spill, g, b - spill], -1).clip(0, 255)
    return out.astype(np.uint8), (alpha * 255).astype(np.uint8)


def main_run(counts, gap=8):
    """The stretch of rows/columns holding the most drawing, so stray specks
    from a neighbouring cell are left out."""
    runs, start, last = [], None, None
    for i, c in enumerate(counts):
        if c > 2:
            if start is None or i - last > gap:
                if start is not None:
                    runs.append((start, last))
                start = i
            last = i
    if start is not None:
        runs.append((start, last))
    if not runs:
        return None
    return max(runs, key=lambda r: counts[r[0]:r[1] + 1].sum())


def crop_box(alpha, pad=6, gap=8):
    solid = alpha > 40
    cols = main_run(solid.sum(0), gap)
    if cols is None:
        return None
    rows = main_run(solid[:, cols[0]:cols[1] + 1].sum(1), gap)
    x0, x1 = cols
    y0, y1 = rows
    return max(0, x0 - pad), max(0, y0 - pad), min(alpha.shape[1], x1 + pad + 1), min(alpha.shape[0], y1 + pad + 1)


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    opts = dict(x[2:].split('=', 1) for x in sys.argv[1:] if x.startswith('--'))
    src, out_dir, names = args[0], args[1], args[2:]
    suffix = opts.get('suffix', '')
    size = int(opts.get('size', '0'))
    gap = int(opts.get('gap', '8'))
    global COLS, ROWS
    COLS, ROWS = int(opts.get('cols', COLS)), int(opts.get('rows', ROWS))
    assert len(names) == COLS * ROWS, f'need {COLS * ROWS} names'
    sheet = np.array(Image.open(src).convert('RGB'))
    rgb, alpha = key_out_magenta(sheet)
    H, W = alpha.shape
    import os
    os.makedirs(out_dir, exist_ok=True)
    for k, name in enumerate(names):
        cx, cy = k % COLS, k // COLS
        x0, x1 = round(cx * W / COLS), round((cx + 1) * W / COLS)
        y0, y1 = round(cy * H / ROWS), round((cy + 1) * H / ROWS)
        a = alpha[y0:y1, x0:x1].copy()
        # Ignore anything touching the cell edge (bits of the neighbours).
        a[:3, :] = 0; a[-3:, :] = 0; a[:, :3] = 0; a[:, -3:] = 0
        box = crop_box(a, gap=gap)
        if box is None:
            print('empty cell', name)
            continue
        bx0, by0, bx1, by1 = box
        piece = np.dstack([rgb[y0:y1, x0:x1], a])[by0:by1, bx0:bx1]
        im = Image.fromarray(piece, 'RGBA')
        if size and max(im.size) > size:
            im.thumbnail((size, size), Image.LANCZOS)
        path = f'{out_dir}/{name}{suffix}.webp'
        im.save(path, 'WEBP', quality=88, method=6)
        print(path, im.size)


if __name__ == '__main__':
    main()
