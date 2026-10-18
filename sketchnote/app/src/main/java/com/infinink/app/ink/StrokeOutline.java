package com.infinink.app.ink;

import com.infinink.app.model.Brush;

/**
 * Turns the points of a freehand stroke into the filled shape that is drawn for it: a ribbon
 * whose width follows the pen pressure (or, for fingers, the speed), with tapered or rounded
 * ends. In the spirit of the "perfect-freehand" approach, but written for this app.
 *
 * Input points are (x, y, pressure) triples with pressure in 0..1. Output goes into an
 * {@link Outline}: one main polygon (the renderer smooths it with quadratic curves), plus filled
 * circles at sharp corners, where a single offset outline would otherwise leave a notch, plus, for
 * the calligraphy nib, a set of quads swept by the nib.
 */
public final class StrokeOutline {
    private StrokeOutline() {}

    public static final class Params {
        public float size;
        /** How much pressure changes the width: 0 = not at all, 1 = from nothing to double. */
        public float thinning;
        /** 0..1: how much the line is pulled smooth behind the pen. */
        public float streamline;
        /** Length over which the start / end narrows to a point, in board units. */
        public float taperStart, taperEnd;
        /** Calligraphy: a flat nib held at a fixed angle instead of a round tip. */
        public boolean nib;
        public float nibAngle = (float) Math.toRadians(-40);
    }

    public static final class Outline {
        public final FloatList poly = new FloatList(256);
        public final FloatList circles = new FloatList(32);
        public final FloatList quads = new FloatList(32);

        public void clear() {
            poly.clear();
            circles.clear();
            quads.clear();
        }

        public boolean isEmpty() {
            return poly.size() == 0 && quads.size() == 0 && circles.size() == 0;
        }
    }

    /** The feel of each brush. Real pen pressure tapers by itself, so it gets less fake taper. */
    public static Params forBrush(int brush, float size, boolean realPressure) {
        Params p = new Params();
        p.size = size;
        switch (brush) {
            case Brush.PENCIL:
                p.thinning = 0.45f;
                p.streamline = 0.3f;
                p.taperStart = realPressure ? 0 : size * 1.2f;
                p.taperEnd = realPressure ? 0 : size * 1.6f;
                break;
            case Brush.BRUSH:
                p.thinning = 0.9f;
                p.streamline = 0.5f;
                p.taperStart = size * (realPressure ? 1.5f : 3f);
                p.taperEnd = size * 4f;
                break;
            case Brush.CALLIGRAPHY:
                p.thinning = 0.35f;
                p.streamline = 0.45f;
                p.nib = true;
                break;
            case Brush.MARKER:
            case Brush.HIGHLIGHTER:
                p.thinning = 0;
                p.streamline = 0.35f;
                break;
            case Brush.PEN:
            default:
                p.thinning = 0.6f;
                p.streamline = 0.45f;
                p.taperStart = realPressure ? 0 : size * 1.2f;
                p.taperEnd = size * (realPressure ? 1.2f : 2.6f);
                break;
        }
        return p;
    }

    private static final int CAP_STEPS = 8;
    private static final float CORNER_COS = (float) Math.cos(Math.toRadians(60));

    /** Builds the outline of the first n points of pts (stride 3) into out. */
    public static void build(float[] pts, int n, Params prm, Outline out) {
        out.clear();
        if (n <= 0 || prm.size <= 0) return;

        // 1. Streamline: each point is pulled only part of the way toward the raw input, which
        //    irons out hand jitter. The last point is the raw one so the line ends under the pen.
        float t = 1f - Math.max(0f, Math.min(0.95f, prm.streamline));
        float minStep = prm.size * 0.04f;
        float[] xs = new float[n + 1], ys = new float[n + 1], ps = new float[n + 1];
        int m = 0;
        float sx = pts[0], sy = pts[1];
        xs[0] = sx;
        ys[0] = sy;
        ps[0] = clampPressure(pts[2]);
        m = 1;
        for (int i = 1; i < n; i++) {
            float rx = pts[3 * i], ry = pts[3 * i + 1];
            sx += (rx - sx) * t;
            sy += (ry - sy) * t;
            if (Geometry.dist(xs[m - 1], ys[m - 1], sx, sy) < minStep) {
                ps[m - 1] = Math.max(ps[m - 1], clampPressure(pts[3 * i + 2]));
                continue;
            }
            xs[m] = sx;
            ys[m] = sy;
            ps[m] = clampPressure(pts[3 * i + 2]);
            m++;
        }
        float lx = pts[3 * (n - 1)], ly = pts[3 * (n - 1) + 1];
        if (n > 1) {
            if (m > 1 && Geometry.dist(xs[m - 1], ys[m - 1], lx, ly) < minStep) {
                xs[m - 1] = lx;
                ys[m - 1] = ly;
            } else if (Geometry.dist(xs[m - 1], ys[m - 1], lx, ly) >= minStep) {
                xs[m] = lx;
                ys[m] = ly;
                ps[m] = clampPressure(pts[3 * (n - 1) + 2]);
                m++;
            }
        }

        // 2. A dot.
        if (m == 1) {
            float r = radius(prm, ps[0]);
            if (prm.nib) r *= 0.6f;
            circle(out.poly, xs[0], ys[0], Math.max(r, prm.size * 0.15f), 16);
            return;
        }

        // 3. Running length, for the tapers.
        float[] len = new float[m];
        for (int i = 1; i < m; i++) len[i] = len[i - 1] + Geometry.dist(xs[i - 1], ys[i - 1], xs[i], ys[i]);
        float total = len[m - 1];
        float ts = prm.taperStart, te = prm.taperEnd;
        if (ts + te > total && ts + te > 0) {
            float k = total / (ts + te);
            ts *= k;
            te *= k;
        }

        // 4. Per point: direction, normal and radius.
        float[] nx = new float[m], ny = new float[m], rad = new float[m];
        float dxPrev = 1, dyPrev = 0;
        for (int i = 0; i < m; i++) {
            int a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
            float dx = xs[b] - xs[a], dy = ys[b] - ys[a];
            float dl = (float) Math.sqrt(dx * dx + dy * dy);
            if (dl < 1e-6f) {
                dx = dxPrev;
                dy = dyPrev;
            } else {
                dx /= dl;
                dy /= dl;
            }
            dxPrev = dx;
            dyPrev = dy;
            nx[i] = -dy;
            ny[i] = dx;

            float p = (ps[a] + 2 * ps[i] + ps[b]) / 4f;
            float r = radius(prm, p);
            float taper = 1f;
            if (ts > 0) taper *= easeOut(Math.min(1f, len[i] / ts));
            if (te > 0) taper *= easeOut(Math.min(1f, (total - len[i]) / te));
            rad[i] = r * Math.max(0.04f, taper);
        }

        if (prm.nib) {
            buildNib(xs, ys, nx, ny, rad, m, prm, out);
            return;
        }

        // 5. Corners sharper than ~60 degrees get a filled circle so the ribbon has no notch.
        for (int i = 1; i < m - 1; i++) {
            float ax = xs[i] - xs[i - 1], ay = ys[i] - ys[i - 1];
            float bx = xs[i + 1] - xs[i], by = ys[i + 1] - ys[i];
            float la = (float) Math.sqrt(ax * ax + ay * ay), lb = (float) Math.sqrt(bx * bx + by * by);
            if (la > 0 && lb > 0 && (ax * bx + ay * by) / (la * lb) < CORNER_COS) {
                out.circles.add(xs[i], ys[i], rad[i]);
            }
        }

        // 6. Left side forward, round end cap, right side back, round start cap.
        FloatList poly = out.poly;
        for (int i = 0; i < m; i++) poly.add(xs[i] + nx[i] * rad[i], ys[i] + ny[i] * rad[i]);
        cap(poly, xs[m - 1], ys[m - 1], nx[m - 1], ny[m - 1], rad[m - 1], false);
        for (int i = m - 1; i >= 0; i--) poly.add(xs[i] - nx[i] * rad[i], ys[i] - ny[i] * rad[i]);
        cap(poly, xs[0], ys[0], nx[0], ny[0], rad[0], true);
    }

    /** A flat nib swept along the line: each step is a quad between two nib positions. */
    private static void buildNib(float[] xs, float[] ys, float[] nx, float[] ny, float[] rad, int m,
                                 Params prm, Outline out) {
        float cx = (float) Math.cos(prm.nibAngle), cy = (float) Math.sin(prm.nibAngle);
        float hair = prm.size * 0.05f;
        float[] lx = new float[m], ly = new float[m], rx = new float[m], ry = new float[m];
        for (int i = 0; i < m; i++) {
            // Hairline: a sliver of width across the direction of travel, so strokes along the
            // nib still show, like real ink would.
            float hx = nx[i] * hair, hy = ny[i] * hair;
            lx[i] = xs[i] + cx * rad[i] + hx;
            ly[i] = ys[i] + cy * rad[i] + hy;
            rx[i] = xs[i] - cx * rad[i] - hx;
            ry[i] = ys[i] - cy * rad[i] - hy;
        }
        FloatList q = out.quads;
        for (int i = 0; i < m - 1; i++) {
            float x0 = lx[i], y0 = ly[i], x1 = lx[i + 1], y1 = ly[i + 1];
            float x2 = rx[i + 1], y2 = ry[i + 1], x3 = rx[i], y3 = ry[i];
            // One winding direction for every quad, so overlapping quads add up instead of
            // cancelling out under the non-zero fill rule.
            float area = (x1 - x0) * (y1 + y0) + (x2 - x1) * (y2 + y1) + (x3 - x2) * (y3 + y2) + (x0 - x3) * (y0 + y3);
            if (area < 0) {
                q.add(x0, y0);
                q.add(x1, y1);
                q.add(x2, y2);
                q.add(x3, y3);
            } else {
                q.add(x3, y3);
                q.add(x2, y2);
                q.add(x1, y1);
                q.add(x0, y0);
            }
        }
    }

    private static float radius(Params prm, float pressure) {
        float r = prm.size * (0.5f - prm.thinning * (0.5f - pressure));
        return Math.max(prm.size * 0.05f, r);
    }

    private static float clampPressure(float p) {
        if (Float.isNaN(p) || p < 0) return 0.5f;
        return Math.min(1f, p);
    }

    private static float easeOut(float u) {
        return u * (2f - u);
    }

    /** Half circle around (x, y) from one side of the line to the other. */
    private static void cap(FloatList poly, float x, float y, float nx, float ny, float r, boolean start) {
        // Direction of travel is (ny, -nx) rotated from the normal (-dy, dx).
        float dx = ny, dy = -nx;
        if (start) {
            dx = -dx;
            dy = -dy;
            nx = -nx;
            ny = -ny;
        }
        for (int s = 1; s < CAP_STEPS; s++) {
            double th = Math.PI * s / CAP_STEPS;
            float c = (float) Math.cos(th), si = (float) Math.sin(th);
            poly.add(x + r * (c * nx + si * dx), y + r * (c * ny + si * dy));
        }
    }

    private static void circle(FloatList poly, float x, float y, float r, int steps) {
        for (int s = 0; s < steps; s++) {
            double th = 2 * Math.PI * s / steps;
            poly.add(x + r * (float) Math.cos(th), y + r * (float) Math.sin(th));
        }
    }
}
