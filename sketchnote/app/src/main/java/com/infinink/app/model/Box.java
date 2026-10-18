package com.infinink.app.model;

/** An axis-aligned rectangle in board coordinates. Pure Java so the model can be unit-tested. */
public final class Box {
    public float minX, minY, maxX, maxY;

    public Box(float minX, float minY, float maxX, float maxY) {
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
    }

    /** An empty box that any {@link #add} turns into a real one. */
    public static Box empty() {
        return new Box(Float.MAX_VALUE, Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE);
    }

    public boolean isEmpty() {
        return minX > maxX || minY > maxY;
    }

    public float width() {
        return maxX - minX;
    }

    public float height() {
        return maxY - minY;
    }

    public float centerX() {
        return (minX + maxX) / 2f;
    }

    public float centerY() {
        return (minY + maxY) / 2f;
    }

    public void add(float x, float y) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    public void add(Box b) {
        if (b.isEmpty()) return;
        add(b.minX, b.minY);
        add(b.maxX, b.maxY);
    }

    public Box inset(float d) {
        return new Box(minX + d, minY + d, maxX - d, maxY - d);
    }

    public boolean intersects(Box b) {
        return !isEmpty() && !b.isEmpty()
                && minX <= b.maxX && b.minX <= maxX && minY <= b.maxY && b.minY <= maxY;
    }

    public boolean contains(float x, float y) {
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }

    public Box copy() {
        return new Box(minX, minY, maxX, maxY);
    }

    @Override
    public String toString() {
        return "Box[" + minX + "," + minY + " - " + maxX + "," + maxY + "]";
    }
}
