package com.infinink.app.model;

import com.infinink.app.ink.FloatList;
import com.infinink.app.ink.Geometry;

import java.util.ArrayList;
import java.util.List;

/** A line of ink: freehand, or a clean shape (line, arrow, box, ellipse...). */
public final class Stroke extends Item {
    /** Drawn as straight segments of even width, not as a pressure-shaped freehand ribbon. */
    public static final int GEOMETRY = 1;
    /** The last point joins back to the first. */
    public static final int CLOSED = 2;
    /** An arrow head at the last point. */
    public static final int ARROW = 4;
    /** A closed shape filled with a see-through tint of its colour. */
    public static final int FILL = 8;
    /** Pressures came from a real stylus rather than being simulated from speed. */
    public static final int REAL_PRESSURE = 16;

    public final int brush;
    public final int color;
    /** Nominal width in board units. */
    public final float size;
    public final int flags;
    /** (x, y, pressure) triples. */
    public final float[] pts;

    private Box bounds;

    public Stroke(int brush, int color, float size, int flags, float[] pts) {
        this.brush = brush;
        this.color = color;
        this.size = size;
        this.flags = flags;
        this.pts = pts;
    }

    public int count() {
        return pts.length / 3;
    }

    public boolean has(int flag) {
        return (flags & flag) != 0;
    }

    @Override
    public Box bounds() {
        if (bounds == null) {
            Box b = Box.empty();
            for (int i = 0; i < pts.length; i += 3) b.add(pts[i], pts[i + 1]);
            // Wide enough for the thickest pressure, a highlighter's square end and an arrow head.
            float pad = size * (has(ARROW) ? 3f : 1f) + 1e-3f;
            bounds = new Box(b.minX - pad, b.minY - pad, b.maxX + pad, b.maxY + pad);
        }
        return bounds;
    }

    @Override
    public Stroke transformed(float scale, float dx, float dy) {
        return transformed(scale, scale, dx, dy);
    }

    @Override
    public Stroke transformed(float sx, float sy, float dx, float dy) {
        float[] p = new float[pts.length];
        for (int i = 0; i < pts.length; i += 3) {
            p[i] = pts[i] * sx + dx;
            p[i + 1] = pts[i + 1] * sy + dy;
            p[i + 2] = pts[i + 2];
        }
        return new Stroke(brush, color, size * (float) Math.sqrt(Math.abs(sx * sy)), flags, p);
    }

    @Override
    public Stroke rotated(float angle, float px, float py) {
        float c = (float) Math.cos(angle), s = (float) Math.sin(angle);
        float[] p = new float[pts.length];
        for (int i = 0; i < pts.length; i += 3) {
            float dx = pts[i] - px, dy = pts[i + 1] - py;
            p[i] = px + dx * c - dy * s;
            p[i + 1] = py + dx * s + dy * c;
            p[i + 2] = pts[i + 2];
        }
        return new Stroke(brush, color, size, flags, p);
    }

    @Override
    public Stroke recolored(int argb) {
        return new Stroke(brush, withAlphaOf(argb, color), size, flags, pts);
    }

    @Override
    public boolean hits(float x, float y, float r) {
        Box b = bounds();
        if (x < b.minX - r || x > b.maxX + r || y < b.minY - r || y > b.maxY + r) return false;
        float reach = r + size / 2f;
        float reach2 = reach * reach;
        int n = count();
        if (n == 1) return Geometry.dist(x, y, pts[0], pts[1]) <= reach;
        for (int i = 1; i < n; i++) {
            if (Geometry.distToSegmentSq(x, y, pts[3 * i - 3], pts[3 * i - 2], pts[3 * i], pts[3 * i + 1]) <= reach2) {
                return true;
            }
        }
        if (has(CLOSED)) {
            if (Geometry.distToSegmentSq(x, y, pts[3 * n - 3], pts[3 * n - 2], pts[0], pts[1]) <= reach2) return true;
            if (has(FILL)) {
                float[] xy = new float[2 * n];
                for (int i = 0; i < n; i++) {
                    xy[2 * i] = pts[3 * i];
                    xy[2 * i + 1] = pts[3 * i + 1];
                }
                return Geometry.pointInPolygon(xy, n, x, y);
            }
        }
        return false;
    }

    /** Whether the swept eraser segment a-b with radius r touches this stroke. */
    public boolean hitsSegment(float ax, float ay, float bx, float by, float r) {
        Box b = bounds();
        if (Math.max(ax, bx) < b.minX - r || Math.min(ax, bx) > b.maxX + r
                || Math.max(ay, by) < b.minY - r || Math.min(ay, by) > b.maxY + r) {
            return false;
        }
        if (hits(bx, by, r)) return true;
        float reach = r + size / 2f;
        float reach2 = reach * reach;
        int n = count();
        int segs = has(CLOSED) ? n : n - 1;
        for (int i = 0; i < segs; i++) {
            int j = (i + 1) % n;
            if (Geometry.segmentDistSq(ax, ay, bx, by, pts[3 * i], pts[3 * i + 1], pts[3 * j], pts[3 * j + 1]) <= reach2) {
                return true;
            }
        }
        return false;
    }

    /**
     * Rubs out the part of this stroke under a circle. Returns null when nothing changed, an empty
     * list when the whole stroke went, or the pieces that are left.
     */
    public List<Stroke> erase(float cx, float cy, float r) {
        Box b = bounds();
        if (cx < b.minX - r || cx > b.maxX + r || cy < b.minY - r || cy > b.maxY + r) return null;

        float[] p = pts;
        int n = count();
        boolean closed = has(CLOSED);
        // Clean shapes have only their corners; fill in points so the eraser can cut between them.
        if (has(GEOMETRY)) {
            p = densify(p, n, closed, Math.max(r * 0.5f, size * 0.25f));
            n = p.length / 3;
            closed = false; // densify repeats the first point at the end of a closed shape
        }
        float reach = r + size * 0.35f;
        float reach2 = reach * reach;
        boolean[] gone = new boolean[n];
        boolean any = false;
        for (int i = 0; i < n; i++) {
            float dx = p[3 * i] - cx, dy = p[3 * i + 1] - cy;
            if (dx * dx + dy * dy <= reach2) {
                gone[i] = true;
                any = true;
            }
        }
        if (!any) return null;

        List<float[]> runs = new ArrayList<>();
        int start = -1;
        for (int i = 0; i <= n; i++) {
            boolean keep = i < n && !gone[i];
            if (keep && start < 0) start = i;
            if (!keep && start >= 0) {
                runs.add(slice(p, start, i));
                start = -1;
            }
        }
        // A closed shape cut once is one open piece that goes around through the old seam.
        boolean wasClosed = has(CLOSED);
        if (wasClosed && runs.size() >= 2 && !gone[0] && !gone[n - 1]) {
            float[] first = runs.remove(0);
            float[] last = runs.remove(runs.size() - 1);
            float[] joined = new float[last.length + first.length];
            System.arraycopy(last, 0, joined, 0, last.length);
            System.arraycopy(first, 0, joined, last.length, first.length);
            runs.add(joined);
        }

        int keptFlags = flags & ~(CLOSED | FILL | ARROW);
        List<Stroke> out = new ArrayList<>();
        for (int k = 0; k < runs.size(); k++) {
            float[] run = runs.get(k);
            if (run.length < 6) continue; // a single stray point is not worth keeping
            int f = keptFlags;
            // The piece that still ends where the arrow did keeps its head.
            if (has(ARROW) && !wasClosed && !gone[n - 1] && endsAt(run, p, n - 1)) f |= ARROW;
            out.add(new Stroke(brush, color, size, f, run));
        }
        return out;
    }

    private static boolean endsAt(float[] run, float[] p, int i) {
        return run[run.length - 3] == p[3 * i] && run[run.length - 2] == p[3 * i + 1];
    }

    private static float[] slice(float[] p, int from, int to) {
        float[] out = new float[(to - from) * 3];
        System.arraycopy(p, from * 3, out, 0, out.length);
        return out;
    }

    /** Points no further apart than step along the polyline (closing it if asked). */
    static float[] densify(float[] p, int n, boolean closed, float step) {
        FloatList out = new FloatList(n * 6);
        int segs = closed ? n : n - 1;
        if (n == 1) return p.clone();
        for (int i = 0; i < segs; i++) {
            int j = (i + 1) % n;
            float ax = p[3 * i], ay = p[3 * i + 1], bx = p[3 * j], by = p[3 * j + 1];
            int pieces = Math.max(1, (int) Math.ceil(Geometry.dist(ax, ay, bx, by) / step));
            for (int s = 0; s < pieces; s++) {
                float t = (float) s / pieces;
                out.add(ax + (bx - ax) * t, ay + (by - ay) * t, p[3 * i + 2]);
            }
        }
        int last = closed ? 0 : n - 1;
        out.add(p[3 * last], p[3 * last + 1], p[3 * last + 2]);
        return out.toArray();
    }
}
