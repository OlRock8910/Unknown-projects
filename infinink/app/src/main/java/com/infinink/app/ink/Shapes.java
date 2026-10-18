package com.infinink.app.ink;

/** The clean shapes of the shape tool, dragged out from one corner to the other. */
public final class Shapes {
    public static final int LINE = 0;
    public static final int ARROW = 1;
    public static final int RECT = 2;
    public static final int ELLIPSE = 3;
    public static final int TRIANGLE = 4;
    public static final int DIAMOND = 5;
    public static final int COUNT = 6;

    private Shapes() {}

    public static boolean isClosed(int kind) {
        return kind != LINE && kind != ARROW;
    }

    /** Corner points as (x, y, pressure) triples for a shape dragged from (x0, y0) to (x1, y1). */
    public static float[] build(int kind, float x0, float y0, float x1, float y1) {
        float l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
        float cx = (l + r) / 2, cy = (t + b) / 2;
        switch (kind) {
            case LINE:
            case ARROW: {
                float[] end = ShapeRecognizer.snapAngle(x0, y0, x1, y1);
                return new float[]{x0, y0, .5f, end[0], end[1], .5f};
            }
            case RECT:
                return new float[]{l, t, .5f, r, t, .5f, r, b, .5f, l, b, .5f};
            case TRIANGLE:
                return new float[]{cx, t, .5f, r, b, .5f, l, b, .5f};
            case DIAMOND:
                return new float[]{cx, t, .5f, r, cy, .5f, cx, b, .5f, l, cy, .5f};
            case ELLIPSE:
            default: {
                int steps = 72;
                float rx = (r - l) / 2, ry = (b - t) / 2;
                float[] p = new float[steps * 3];
                for (int i = 0; i < steps; i++) {
                    double th = 2 * Math.PI * i / steps;
                    p[3 * i] = cx + rx * (float) Math.cos(th);
                    p[3 * i + 1] = cy + ry * (float) Math.sin(th);
                    p[3 * i + 2] = .5f;
                }
                return p;
            }
        }
    }
}
