package com.infinink.app.model;

/** An image placed on the board, stored as a file next to the board. */
public final class Picture extends Item {
    public final String file;
    public final float x, y, w, h;

    public Picture(String file, float x, float y, float w, float h) {
        this.file = file;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    @Override
    public Box bounds() {
        return new Box(x, y, x + w, y + h);
    }

    @Override
    public Picture transformed(float scale, float dx, float dy) {
        return new Picture(file, x * scale + dx, y * scale + dy, w * scale, h * scale);
    }

    @Override
    public Picture recolored(int argb) {
        return this;
    }

    @Override
    public boolean hits(float px, float py, float r) {
        return px >= x - r && px <= x + w + r && py >= y - r && py <= y + h + r;
    }
}
