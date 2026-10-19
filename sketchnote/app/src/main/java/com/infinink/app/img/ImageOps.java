package com.infinink.app.img;

import java.util.Arrays;

/**
 * Pixel work for the picture editor: cutting out backgrounds, the magic wand, erase/restore
 * brushes, picking and summarising colours. Pure Java on ARGB int arrays and a separate alpha
 * mask (255 = keep, 0 = removed), so it is unit-tested without a phone.
 *
 * Background removal is colour based, not AI: it removes whatever touches the picture's edges
 * and looks like the colours found along those edges. That suits photos of things on a fairly
 * plain background (paper, a wall, a table, the sky); the brushes tidy up the rest.
 */
public final class ImageOps {
    private ImageOps() {}

    /** Perceptual-ish colour distance ("redmean"); 0 for equal, about 765 for black vs white. */
    public static float dist(int a, int b) {
        int r1 = (a >> 16) & 255, g1 = (a >> 8) & 255, b1 = a & 255;
        int r2 = (b >> 16) & 255, g2 = (b >> 8) & 255, b2 = b & 255;
        float rm = (r1 + r2) / 2f;
        int dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
        return (float) Math.sqrt((2 + rm / 256f) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256f) * db * db);
    }

    /** Tolerance 0..1 as a colour distance. */
    public static float threshold(float tolerance) {
        return 18f + Math.max(0f, Math.min(1f, tolerance)) * 170f;
    }

    public static byte[] fullMask(int n) {
        byte[] m = new byte[n];
        Arrays.fill(m, (byte) 255);
        return m;
    }

    static int alpha(byte[] mask, int i) {
        return mask[i] & 255;
    }

    /**
     * Removes the background: everything connected to the picture's edges whose colour is close
     * to one of the main edge colours. Returns the number of pixels removed.
     */
    public static int removeBackground(int[] px, int w, int h, float tolerance, byte[] mask) {
        // The main colours along the edges.
        int perim = 2 * (w + h);
        int step = Math.max(1, perim / 4000);
        int[] border = new int[perim / step + 8];
        int nb = 0;
        for (int i = 0; i < perim && nb < border.length; i += step) {
            int x, y;
            if (i < w) { x = i; y = 0; }
            else if (i < 2 * w) { x = i - w; y = h - 1; }
            else if (i < 2 * w + h) { x = 0; y = i - 2 * w; }
            else { x = w - 1; y = i - 2 * w - h; }
            if (x < w && y < h && alpha(mask, y * w + x) > 0) border[nb++] = px[y * w + x];
        }
        if (nb == 0) return 0;
        int[] counts = new int[4];
        int[] bg = kmeans(Arrays.copyOf(border, nb), 4, counts);
        int keep = 0;
        for (int k = 0; k < bg.length; k++) if (counts[k] * 100 >= nb * 6) bg[keep++] = bg[k];
        bg = Arrays.copyOf(bg, Math.max(1, keep));

        float t = threshold(tolerance);
        byte[] removed = new byte[w * h];
        int[] queue = new int[w * h];
        int head = 0, tail = 0;
        for (int x = 0; x < w; x++) {
            tail = seed(px, w, x, 0, bg, t, removed, mask, queue, tail);
            tail = seed(px, w, x, h - 1, bg, t, removed, mask, queue, tail);
        }
        for (int y = 0; y < h; y++) {
            tail = seed(px, w, 0, y, bg, t, removed, mask, queue, tail);
            tail = seed(px, w, w - 1, y, bg, t, removed, mask, queue, tail);
        }
        while (head < tail) {
            int i = queue[head++];
            int x = i % w, y = i / w;
            if (x > 0) tail = seed(px, w, x - 1, y, bg, t, removed, mask, queue, tail);
            if (x < w - 1) tail = seed(px, w, x + 1, y, bg, t, removed, mask, queue, tail);
            if (y > 0) tail = seed(px, w, x, y - 1, bg, t, removed, mask, queue, tail);
            if (y < h - 1) tail = seed(px, w, x, y + 1, bg, t, removed, mask, queue, tail);
        }
        applyRemoval(removed, w, h, mask);
        return tail;
    }

    private static int seed(int[] px, int w, int x, int y, int[] bg, float t, byte[] removed, byte[] mask,
                            int[] queue, int tail) {
        int i = y * w + x;
        if (removed[i] != 0) return tail;
        if (alpha(mask, i) == 0) { // already gone: lets the fill carry on through earlier cut-outs
            removed[i] = 1;
            queue[tail++] = i;
            return tail;
        }
        int c = px[i];
        for (int b : bg) {
            if (dist(c, b) < t) {
                removed[i] = 1;
                queue[tail++] = i;
                return tail;
            }
        }
        return tail;
    }

    /** Magic wand: removes the area around (x, y) whose colour is close to the colour there. */
    public static int magicWand(int[] px, int w, int h, int x, int y, float tolerance, byte[] mask) {
        if (x < 0 || y < 0 || x >= w || y >= h) return 0;
        int start = y * w + x;
        if (alpha(mask, start) == 0) return 0;
        int seedColor = px[start];
        float t = threshold(tolerance);
        byte[] removed = new byte[w * h];
        int[] queue = new int[w * h];
        int head = 0, tail = 0;
        removed[start] = 1;
        queue[tail++] = start;
        while (head < tail) {
            int i = queue[head++];
            int cx = i % w, cy = i / w;
            for (int d = 0; d < 4; d++) {
                int nx = cx + (d == 0 ? -1 : d == 1 ? 1 : 0), ny = cy + (d == 2 ? -1 : d == 3 ? 1 : 0);
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                int n = ny * w + nx;
                if (removed[n] != 0 || alpha(mask, n) == 0) continue;
                if (dist(px[n], seedColor) < t) {
                    removed[n] = 1;
                    queue[tail++] = n;
                }
            }
        }
        applyRemoval(removed, w, h, mask);
        return tail;
    }

    /** Clears removed pixels, with a one-pixel soft edge so cut-outs do not look jagged. */
    private static void applyRemoval(byte[] removed, int w, int h, byte[] mask) {
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int i = y * w + x;
                if (removed[i] != 0) {
                    mask[i] = 0;
                    continue;
                }
                // A kept pixel next to removed ones becomes partly see-through.
                int gone = 0, total = 0;
                for (int dy = -1; dy <= 1; dy++) {
                    int yy = y + dy;
                    if (yy < 0 || yy >= h) continue;
                    for (int dx = -1; dx <= 1; dx++) {
                        int xx = x + dx;
                        if (xx < 0 || xx >= w) continue;
                        total++;
                        if (removed[yy * w + xx] != 0) gone++;
                    }
                }
                if (gone > 0) {
                    int a = 255 - gone * 160 / total;
                    if (a < alpha(mask, i)) mask[i] = (byte) a;
                }
            }
        }
    }

    /**
     * A round brush on the mask: keep=false erases, keep=true brings pixels back. The outer
     * quarter of the radius fades so edges come out soft. Returns the touched area
     * {left, top, right, bottom} (right/bottom exclusive), or null if it missed the picture.
     */
    public static int[] brush(byte[] mask, int w, int h, float cx, float cy, float r, boolean keep) {
        int l = Math.max(0, (int) Math.floor(cx - r)), t = Math.max(0, (int) Math.floor(cy - r));
        int rr = Math.min(w, (int) Math.ceil(cx + r) + 1), b = Math.min(h, (int) Math.ceil(cy + r) + 1);
        if (l >= rr || t >= b) return null;
        float soft = Math.max(1f, r * 0.25f);
        for (int y = t; y < b; y++) {
            for (int x = l; x < rr; x++) {
                float d = (float) Math.hypot(x + 0.5f - cx, y + 0.5f - cy);
                if (d > r) continue;
                float f = d < r - soft ? 1f : (r - d) / soft;
                int i = y * w + x;
                int a = alpha(mask, i);
                int v = Math.round(f * 255);
                if (keep) a = Math.max(a, v);
                else a = Math.min(a, 255 - v);
                mask[i] = (byte) a;
            }
        }
        return new int[]{l, t, rr, b};
    }

    /** Average colour of the kept pixels within radius of (cx, cy); 0 if there are none. */
    public static int average(int[] px, int w, int h, int cx, int cy, int radius, byte[] mask) {
        long r = 0, g = 0, b = 0;
        int n = 0;
        for (int y = Math.max(0, cy - radius); y <= Math.min(h - 1, cy + radius); y++) {
            for (int x = Math.max(0, cx - radius); x <= Math.min(w - 1, cx + radius); x++) {
                if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > radius * radius) continue;
                int i = y * w + x;
                if (mask != null && alpha(mask, i) < 128) continue;
                int c = px[i];
                r += (c >> 16) & 255;
                g += (c >> 8) & 255;
                b += c & 255;
                n++;
            }
        }
        if (n == 0) return 0;
        return 0xFF000000 | (int) (r / n) << 16 | (int) (g / n) << 8 | (int) (b / n);
    }

    /** The picture's main colours, most common first, without near-duplicates. */
    public static int[] dominantColors(int[] px, int w, int h, byte[] mask, int max) {
        int n = w * h;
        int step = Math.max(1, n / 20000);
        int[] sample = new int[n / step + 1];
        int ns = 0;
        for (int i = 0; i < n; i += step) {
            if (mask != null && alpha(mask, i) < 128) continue;
            sample[ns++] = px[i] | 0xFF000000;
        }
        if (ns == 0) return new int[0];
        int k = Math.min(max + 3, 10);
        int[] counts = new int[k];
        int[] centers = kmeans(Arrays.copyOf(sample, ns), k, counts);
        Integer[] order = new Integer[centers.length];
        for (int i = 0; i < order.length; i++) order[i] = i;
        final int[] cnt = counts;
        Arrays.sort(order, new java.util.Comparator<Integer>() {
            @Override
            public int compare(Integer a, Integer b) {
                return cnt[b] - cnt[a];
            }
        });
        int[] out = new int[max];
        int no = 0;
        for (int idx : order) {
            if (no == max || counts[idx] == 0) break;
            boolean dup = false;
            for (int j = 0; j < no; j++) if (dist(out[j], centers[idx]) < 45) dup = true;
            if (!dup) out[no++] = centers[idx];
        }
        return Arrays.copyOf(out, no);
    }

    /**
     * k-means on colours with farthest-first starting points. Returns up to k centres; counts
     * receives how many colours fell in each.
     */
    static int[] kmeans(int[] colors, int k, int[] counts) {
        int n = colors.length;
        k = Math.min(k, n);
        int[] centers = new int[k];
        centers[0] = colors[n / 2];
        float[] best = new float[n];
        Arrays.fill(best, Float.MAX_VALUE);
        for (int c = 1; c < k; c++) {
            int far = 0;
            float farD = -1;
            for (int i = 0; i < n; i++) {
                best[i] = Math.min(best[i], dist(colors[i], centers[c - 1]));
                if (best[i] > farD) {
                    farD = best[i];
                    far = i;
                }
            }
            centers[c] = colors[far];
        }
        int[] assign = new int[n];
        for (int iter = 0; iter < 10; iter++) {
            long[] sr = new long[k], sg = new long[k], sb = new long[k];
            int[] cn = new int[k];
            for (int i = 0; i < n; i++) {
                int bi = 0;
                float bd = Float.MAX_VALUE;
                for (int c = 0; c < k; c++) {
                    float d = dist(colors[i], centers[c]);
                    if (d < bd) {
                        bd = d;
                        bi = c;
                    }
                }
                assign[i] = bi;
                int col = colors[i];
                sr[bi] += (col >> 16) & 255;
                sg[bi] += (col >> 8) & 255;
                sb[bi] += col & 255;
                cn[bi]++;
            }
            for (int c = 0; c < k; c++) {
                if (cn[c] > 0) {
                    centers[c] = 0xFF000000 | (int) (sr[c] / cn[c]) << 16 | (int) (sg[c] / cn[c]) << 8 | (int) (sb[c] / cn[c]);
                }
                if (counts != null && c < counts.length) counts[c] = cn[c];
            }
        }
        return centers;
    }

    /** Rotates pixels (and mask) a quarter turn clockwise; the new size is h x w. */
    public static int[] rotate(int[] px, int w, int h) {
        int[] out = new int[px.length];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) out[x * h + (h - 1 - y)] = px[y * w + x];
        return out;
    }

    public static byte[] rotate(byte[] m, int w, int h) {
        byte[] out = new byte[m.length];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) out[x * h + (h - 1 - y)] = m[y * w + x];
        return out;
    }

    public static void flip(int[] px, int w, int h) {
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w / 2; x++) {
                int a = y * w + x, b = y * w + (w - 1 - x);
                int t = px[a];
                px[a] = px[b];
                px[b] = t;
            }
        }
    }

    public static void flip(byte[] m, int w, int h) {
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w / 2; x++) {
                int a = y * w + x, b = y * w + (w - 1 - x);
                byte t = m[a];
                m[a] = m[b];
                m[b] = t;
            }
        }
    }

    /** The cropped area with the mask applied as transparency. */
    public static int[] cutOut(int[] px, int w, byte[] mask, int left, int top, int cw, int ch) {
        int[] out = new int[cw * ch];
        for (int y = 0; y < ch; y++) {
            for (int x = 0; x < cw; x++) {
                int i = (top + y) * w + left + x;
                int a = ((px[i] >>> 24) * alpha(mask, i)) / 255;
                out[y * cw + x] = (a << 24) | (px[i] & 0x00FFFFFF);
            }
        }
        return out;
    }

    public static boolean anyTransparent(int[] px) {
        for (int p : px) if ((p >>> 24) != 255) return true;
        return false;
    }
}
