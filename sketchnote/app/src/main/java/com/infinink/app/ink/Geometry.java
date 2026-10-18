package com.infinink.app.ink;

/** Small geometry helpers on flat float arrays. Points are (x, y) pairs unless a stride is given. */
public final class Geometry {
    private Geometry() {}

    public static float dist(float ax, float ay, float bx, float by) {
        float dx = bx - ax, dy = by - ay;
        return (float) Math.sqrt(dx * dx + dy * dy);
    }

    /** Squared distance from point p to the segment a-b. */
    public static float distToSegmentSq(float px, float py, float ax, float ay, float bx, float by) {
        float vx = bx - ax, vy = by - ay;
        float wx = px - ax, wy = py - ay;
        float len2 = vx * vx + vy * vy;
        float t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        float cx = ax + t * vx - px, cy = ay + t * vy - py;
        return cx * cx + cy * cy;
    }

    /** Squared distance between segments a-b and c-d (zero when they cross). */
    public static float segmentDistSq(float ax, float ay, float bx, float by,
                                      float cx, float cy, float dx, float dy) {
        if (segmentsCross(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
        float d = distToSegmentSq(ax, ay, cx, cy, dx, dy);
        d = Math.min(d, distToSegmentSq(bx, by, cx, cy, dx, dy));
        d = Math.min(d, distToSegmentSq(cx, cy, ax, ay, bx, by));
        d = Math.min(d, distToSegmentSq(dx, dy, ax, ay, bx, by));
        return d;
    }

    private static boolean segmentsCross(float ax, float ay, float bx, float by,
                                         float cx, float cy, float dx, float dy) {
        float d1 = cross(cx, cy, dx, dy, ax, ay);
        float d2 = cross(cx, cy, dx, dy, bx, by);
        float d3 = cross(ax, ay, bx, by, cx, cy);
        float d4 = cross(ax, ay, bx, by, dx, dy);
        return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    }

    private static float cross(float ax, float ay, float bx, float by, float px, float py) {
        return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    }

    /** Even-odd test of whether (x, y) is inside the polygon given as n (x, y) pairs. */
    public static boolean pointInPolygon(float[] poly, int n, float x, float y) {
        boolean inside = false;
        for (int i = 0, j = n - 1; i < n; j = i++) {
            float xi = poly[2 * i], yi = poly[2 * i + 1];
            float xj = poly[2 * j], yj = poly[2 * j + 1];
            if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    /** Length of the polyline through n points stored with the given stride. */
    public static float length(float[] pts, int n, int stride) {
        float len = 0;
        for (int i = 1; i < n; i++) {
            len += dist(pts[(i - 1) * stride], pts[(i - 1) * stride + 1], pts[i * stride], pts[i * stride + 1]);
        }
        return len;
    }

    /**
     * Douglas-Peucker simplification. Returns the indices of the points to keep (always the first
     * and last) of the n points stored with the given stride.
     */
    public static int[] simplify(float[] pts, int n, int stride, float epsilon) {
        if (n <= 2) {
            int[] all = new int[n];
            for (int i = 0; i < n; i++) all[i] = i;
            return all;
        }
        boolean[] keep = new boolean[n];
        keep[0] = keep[n - 1] = true;
        int[] stack = new int[2 * n];
        int sp = 0;
        stack[sp++] = 0;
        stack[sp++] = n - 1;
        float eps2 = epsilon * epsilon;
        while (sp > 0) {
            int last = stack[--sp], first = stack[--sp];
            float ax = pts[first * stride], ay = pts[first * stride + 1];
            float bx = pts[last * stride], by = pts[last * stride + 1];
            float best = -1;
            int bestI = -1;
            for (int i = first + 1; i < last; i++) {
                float d = distToSegmentSq(pts[i * stride], pts[i * stride + 1], ax, ay, bx, by);
                if (d > best) {
                    best = d;
                    bestI = i;
                }
            }
            if (bestI >= 0 && best > eps2) {
                keep[bestI] = true;
                stack[sp++] = first;
                stack[sp++] = bestI;
                stack[sp++] = bestI;
                stack[sp++] = last;
            }
        }
        int count = 0;
        for (boolean k : keep) if (k) count++;
        int[] out = new int[count];
        for (int i = 0, j = 0; i < n; i++) if (keep[i]) out[j++] = i;
        return out;
    }
}
