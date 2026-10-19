package com.infinink.app.model;

/**
 * An image placed on the board, stored as a file next to the board. x, y, w, h are its box
 * before turning; angle (radians, clockwise on screen) turns it about the box's centre.
 */
public final class Picture extends Item {
    public final String file;
    public final float x, y, w, h;
    public final float angle;

    public Picture(String file, float x, float y, float w, float h) {
        this(file, x, y, w, h, 0f);
    }

    public Picture(String file, float x, float y, float w, float h, float angle) {
        this.file = file;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.angle = normalize(angle);
    }

    /** The angle in (-pi, pi]. */
    static float normalize(float a) {
        double t = Math.IEEEremainder(a, 2 * Math.PI);
        if (t <= -Math.PI) t += 2 * Math.PI;
        return (float) t;
    }

    public float centerX() {
        return x + w / 2;
    }

    public float centerY() {
        return y + h / 2;
    }

    @Override
    public Box bounds() {
        if (angle == 0f) return new Box(x, y, x + w, y + h);
        float c = Math.abs((float) Math.cos(angle)), s = Math.abs((float) Math.sin(angle));
        float hw = (w * c + h * s) / 2, hh = (w * s + h * c) / 2;
        float cx = centerX(), cy = centerY();
        return new Box(cx - hw, cy - hh, cx + hw, cy + hh);
    }

    @Override
    public Picture transformed(float scale, float dx, float dy) {
        return transformed(scale, scale, dx, dy);
    }

    @Override
    public Picture transformed(float sx, float sy, float dx, float dy) {
        float nw, nh;
        if (angle == 0f || sx == sy) {
            nw = w * sx;
            nh = h * sy;
        } else {
            // Stretching a turned picture: a quarter turn swaps which side follows which axis;
            // at other angles there is no clean stretch, so it scales evenly instead.
            double q = Math.abs(Math.IEEEremainder(angle, Math.PI)); // 0 = upright, pi/2 = sideways
            if (q < Math.toRadians(10)) {
                nw = w * sx;
                nh = h * sy;
            } else if (Math.abs(q - Math.PI / 2) < Math.toRadians(10)) {
                nw = w * sy;
                nh = h * sx;
            } else {
                float k = (float) Math.sqrt(Math.abs(sx * sy));
                nw = w * k;
                nh = h * k;
            }
        }
        float cx = centerX() * sx + dx, cy = centerY() * sy + dy;
        return new Picture(file, cx - nw / 2, cy - nh / 2, nw, nh, angle);
    }

    @Override
    public Picture rotated(float by, float px, float py) {
        float c = (float) Math.cos(by), s = (float) Math.sin(by);
        float dx = centerX() - px, dy = centerY() - py;
        float cx = px + dx * c - dy * s, cy = py + dx * s + dy * c;
        return new Picture(file, cx - w / 2, cy - h / 2, w, h, angle + by);
    }

    @Override
    public Picture recolored(int argb) {
        return this;
    }

    @Override
    public boolean hits(float px, float py, float r) {
        if (angle != 0f) {
            // Into the picture's own, unturned frame.
            float c = (float) Math.cos(-angle), s = (float) Math.sin(-angle);
            float dx = px - centerX(), dy = py - centerY();
            px = centerX() + dx * c - dy * s;
            py = centerY() + dx * s + dy * c;
        }
        return px >= x - r && px <= x + w + r && py >= y - r && py <= y + h + r;
    }
}
