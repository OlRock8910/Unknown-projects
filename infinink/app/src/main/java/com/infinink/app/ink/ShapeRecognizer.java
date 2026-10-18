package com.infinink.app.ink;

/**
 * "Hold to snap": recognises a hand-drawn line, triangle, rectangle, circle/ellipse or a few-sided
 * polygon in a freehand stroke and returns the clean version. Everything is relative to the size
 * of the drawing, so it works the same at any zoom.
 */
public final class ShapeRecognizer {
    private ShapeRecognizer() {}

    public static final int LINE = 1;
    public static final int POLYLINE = 2;
    public static final int TRIANGLE = 3;
    public static final int RECTANGLE = 4;
    public static final int ELLIPSE = 5;
    public static final int POLYGON = 6;

    public static final class Shape {
        public final int kind;
        /** Corner points as (x, y) pairs; an ellipse is sampled finely. */
        public final float[] xy;
        public final boolean closed;

        Shape(int kind, float[] xy, boolean closed) {
            this.kind = kind;
            this.xy = xy;
            this.closed = closed;
        }

        public int pointCount() {
            return xy.length / 2;
        }
    }

    /** pts are (x, y, pressure) triples. Returns null when the stroke is not a clear shape. */
    public static Shape recognize(float[] pts, int n) {
        if (n < 2) return null;
        float[] xy = new float[2 * n];
        float minX = Float.MAX_VALUE, minY = Float.MAX_VALUE, maxX = -Float.MAX_VALUE, maxY = -Float.MAX_VALUE;
        for (int i = 0; i < n; i++) {
            float x = pts[3 * i], y = pts[3 * i + 1];
            xy[2 * i] = x;
            xy[2 * i + 1] = y;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
        float diag = Geometry.dist(minX, minY, maxX, maxY);
        if (diag < 1e-3f) return null;
        float pathLen = Geometry.length(xy, n, 2);
        float sx = xy[0], sy = xy[1], ex = xy[2 * n - 2], ey = xy[2 * n - 1];
        float chord = Geometry.dist(sx, sy, ex, ey);

        // Straight line: everything close to the start-end chord, and no doubling back.
        if (chord > 0.5f * diag && pathLen < chord * 1.25f) {
            float maxDev = 0;
            for (int i = 0; i < n; i++) {
                maxDev = Math.max(maxDev, (float) Math.sqrt(
                        Geometry.distToSegmentSq(xy[2 * i], xy[2 * i + 1], sx, sy, ex, ey)));
            }
            if (maxDev < chord * 0.09f) {
                float[] end = snapAngle(sx, sy, ex, ey);
                return new Shape(LINE, new float[]{sx, sy, end[0], end[1]}, false);
            }
        }

        boolean closed = chord < diag * 0.28f && pathLen > diag * 1.6f;
        if (closed) return closedShape(xy, n, diag, minX, minY, maxX, maxY);
        return openPolyline(xy, n, diag);
    }

    private static Shape closedShape(float[] xy, int n, float diag,
                                     float minX, float minY, float maxX, float maxY) {
        // Ellipse fit against the bounding box.
        float cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        float rx = Math.max(1e-3f, (maxX - minX) / 2), ry = Math.max(1e-3f, (maxY - minY) / 2);
        float ellipseErr = 0;
        for (int i = 0; i < n; i++) {
            float ux = (xy[2 * i] - cx) / rx, uy = (xy[2 * i + 1] - cy) / ry;
            ellipseErr += Math.abs((float) Math.sqrt(ux * ux + uy * uy) - 1f);
        }
        ellipseErr /= n;

        // Polygon fit: simplify the loop and count the corners.
        float[] loop = new float[2 * (n + 1)];
        System.arraycopy(xy, 0, loop, 0, 2 * n);
        loop[2 * n] = xy[0];
        loop[2 * n + 1] = xy[1];
        int[] keep = Geometry.simplify(loop, n + 1, 2, diag * 0.075f);
        float[] corners = mergeStraightCorners(loop, keep);
        int v = corners.length / 2;
        float polyErr = v >= 3 ? meanDistToPolygon(xy, n, corners) / diag : Float.MAX_VALUE;

        boolean ellipseGood = ellipseErr < 0.085f;
        if (ellipseGood && (v > 4 || v < 3 || ellipseErr < polyErr * 2.2f)) {
            return ellipse(cx, cy, rx, ry);
        }
        if (v == 3 && polyErr < 0.05f) return new Shape(TRIANGLE, corners, true);
        if (v == 4 && polyErr < 0.05f) return new Shape(RECTANGLE, squareUp(corners, minX, minY, maxX, maxY), true);
        if (v >= 5 && v <= 8 && polyErr < 0.035f) return new Shape(POLYGON, corners, true);
        if (ellipseGood) return ellipse(cx, cy, rx, ry);
        return null;
    }

    private static Shape openPolyline(float[] xy, int n, float diag) {
        int[] keep = Geometry.simplify(xy, n, 2, diag * 0.06f);
        if (keep.length < 3 || keep.length > 5) return null;
        float[] c = new float[2 * keep.length];
        for (int i = 0; i < keep.length; i++) {
            c[2 * i] = xy[2 * keep[i]];
            c[2 * i + 1] = xy[2 * keep[i] + 1];
        }
        float err = 0;
        for (int i = 0; i < n; i++) {
            float best = Float.MAX_VALUE;
            for (int k = 0; k < keep.length - 1; k++) {
                best = Math.min(best, Geometry.distToSegmentSq(xy[2 * i], xy[2 * i + 1],
                        c[2 * k], c[2 * k + 1], c[2 * k + 2], c[2 * k + 3]));
            }
            err += (float) Math.sqrt(best);
        }
        err /= n;
        if (err / diag > 0.025f) return null;
        return new Shape(POLYLINE, c, false);
    }

    private static Shape ellipse(float cx, float cy, float rx, float ry) {
        // Nearly round: make it a true circle.
        if (Math.abs(rx - ry) < 0.12f * Math.max(rx, ry)) rx = ry = (rx + ry) / 2;
        int steps = 72;
        float[] xy = new float[2 * steps];
        for (int i = 0; i < steps; i++) {
            double th = 2 * Math.PI * i / steps;
            xy[2 * i] = cx + rx * (float) Math.cos(th);
            xy[2 * i + 1] = cy + ry * (float) Math.sin(th);
        }
        return new Shape(ELLIPSE, xy, true);
    }

    /** Corner points (without the repeated closing point), dropping ones on a straight run. */
    private static float[] mergeStraightCorners(float[] loop, int[] keep) {
        int k = keep.length - 1; // the last kept index is the copy of the first point
        FloatList out = new FloatList();
        for (int i = 0; i < k; i++) {
            int prev = keep[(i - 1 + k) % k], cur = keep[i], next = keep[(i + 1) % k];
            float ax = loop[2 * cur] - loop[2 * prev], ay = loop[2 * cur + 1] - loop[2 * prev + 1];
            float bx = loop[2 * next] - loop[2 * cur], by = loop[2 * next + 1] - loop[2 * cur + 1];
            float la = (float) Math.sqrt(ax * ax + ay * ay), lb = (float) Math.sqrt(bx * bx + by * by);
            if (la < 1e-6f || lb < 1e-6f) continue;
            float cos = (ax * bx + ay * by) / (la * lb);
            if (cos > 0.94f) continue; // under ~20 degrees of turn: not a corner
            out.add(loop[2 * cur], loop[2 * cur + 1]);
        }
        return out.toArray();
    }

    private static float meanDistToPolygon(float[] xy, int n, float[] c) {
        int v = c.length / 2;
        float sum = 0;
        for (int i = 0; i < n; i++) {
            float best = Float.MAX_VALUE;
            for (int k = 0; k < v; k++) {
                int j = (k + 1) % v;
                best = Math.min(best, Geometry.distToSegmentSq(xy[2 * i], xy[2 * i + 1],
                        c[2 * k], c[2 * k + 1], c[2 * j], c[2 * j + 1]));
            }
            sum += (float) Math.sqrt(best);
        }
        return sum / n;
    }

    /** A four-cornered shape whose sides are all near horizontal/vertical becomes a clean box. */
    private static float[] squareUp(float[] c, float minX, float minY, float maxX, float maxY) {
        boolean axisAligned = true;
        for (int k = 0; k < 4; k++) {
            int j = (k + 1) % 4;
            double a = Math.toDegrees(Math.atan2(c[2 * j + 1] - c[2 * k + 1], c[2 * j] - c[2 * k]));
            double off = Math.abs(((a % 90) + 90) % 90);
            if (Math.min(off, 90 - off) > 14) axisAligned = false;
        }
        if (!axisAligned) return c;
        return new float[]{minX, minY, maxX, minY, maxX, maxY, minX, maxY};
    }

    /** Lines within 4 degrees of horizontal, vertical or 45 degrees snap onto it. */
    static float[] snapAngle(float sx, float sy, float ex, float ey) {
        float dx = ex - sx, dy = ey - sy;
        double len = Math.sqrt(dx * dx + dy * dy);
        double a = Math.atan2(dy, dx);
        double step = Math.PI / 4;
        double snapped = Math.round(a / step) * step;
        if (Math.abs(a - snapped) < Math.toRadians(4)) {
            return new float[]{sx + (float) (Math.cos(snapped) * len), sy + (float) (Math.sin(snapped) * len)};
        }
        return new float[]{ex, ey};
    }
}
