package com.infinink.app.model;

/** Maps board coordinates to screen pixels: screen = board * scale + offset. */
public final class Viewport {
    public static final float MIN_SCALE = 0.02f;
    public static final float MAX_SCALE = 40f;

    public float scale = 1f;
    public float tx, ty;

    public float toScreenX(float x) {
        return x * scale + tx;
    }

    public float toScreenY(float y) {
        return y * scale + ty;
    }

    public float toBoardX(float sx) {
        return (sx - tx) / scale;
    }

    public float toBoardY(float sy) {
        return (sy - ty) / scale;
    }

    public void panBy(float dx, float dy) {
        tx += dx;
        ty += dy;
    }

    /** Zooms by factor keeping the board point under (fx, fy) on screen where it is. */
    public void zoomAt(float fx, float fy, float factor) {
        float next = clamp(scale * factor);
        float bx = toBoardX(fx), by = toBoardY(fy);
        scale = next;
        tx = fx - bx * scale;
        ty = fy - by * scale;
    }

    /** Puts board point (bx, by) at screen point (sx, sy) at the given zoom. */
    public void center(float bx, float by, float sx, float sy, float newScale) {
        scale = clamp(newScale);
        tx = sx - bx * scale;
        ty = sy - by * scale;
    }

    /** The board area visible on a screen of the given size. */
    public Box visible(float width, float height) {
        return new Box(toBoardX(0), toBoardY(0), toBoardX(width), toBoardY(height));
    }

    /** The zoom at which box b fits the screen with some margin around it. */
    public static float fitScale(Box b, float width, float height, float margin) {
        float w = Math.max(1e-3f, b.width()), h = Math.max(1e-3f, b.height());
        return clamp(Math.min((width - 2 * margin) / w, (height - 2 * margin) / h));
    }

    public static float clamp(float s) {
        return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    }
}
