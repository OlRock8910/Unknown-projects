package com.infinink.app.model;

/**
 * Something on a board: a stroke, a note or a picture.
 *
 * Items are treated as immutable once they are on a board. Editing one (moving, recolouring,
 * erasing part of it) replaces it with a new item through a {@link Change}, which is what makes
 * undo simple and lets the saver write a snapshot of the list from another thread.
 */
public abstract class Item {
    /** Whatever the renderer wants to keep for this item (a Path, a text layout). UI thread only. */
    public transient Object cache;

    public abstract Box bounds();

    /** A copy with every coordinate mapped through x' = x * scale + dx (and the same for y). */
    public Item transformed(float scale, float dx, float dy) {
        return transformed(scale, scale, dx, dy);
    }

    /**
     * A copy stretched by sx across and sy down: x' = x * sx + dx, y' = y * sy + dy. Text keeps
     * its size when only one side is pulled, and rewraps to the new width instead.
     */
    public abstract Item transformed(float sx, float sy, float dx, float dy);

    /** A copy in another colour (the opacity of the original is kept where it has one). */
    public abstract Item recolored(int argb);

    /** Whether a circle at (x, y) with radius r touches this item. */
    public abstract boolean hits(float x, float y, float r);

    static int withAlphaOf(int rgbSource, int alphaSource) {
        return (alphaSource & 0xFF000000) | (rgbSource & 0x00FFFFFF);
    }
}
