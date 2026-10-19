package com.infinink.app.model;

/** Text on the board: a sticky note (with a coloured card) or plain text. */
public final class Note extends Item {
    public static final int STICKY = 0;
    public static final int TEXT = 1;

    /** Formatting bits in {@link #fmt}. Stored in board files: never renumber. */
    public static final int BOLD = 1, ITALIC = 2, UNDERLINE = 4, CENTER = 8, RIGHT = 16;

    public final int style;
    /** Top-left corner, width and height in board units. The height is measured by the UI. */
    public final float x, y, w, h;
    public final float fontSize;
    /** Card colour for sticky notes. */
    public final int paper;
    public final int ink;
    public final String text;
    /** Font id (see render.Fonts); "" is the default font. */
    public final String font;
    public final int fmt;

    public Note(int style, float x, float y, float w, float h, float fontSize, int paper, int ink, String text) {
        this(style, x, y, w, h, fontSize, paper, ink, text, "", 0);
    }

    public Note(int style, float x, float y, float w, float h, float fontSize, int paper, int ink, String text,
                String font, int fmt) {
        this.style = style;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.fontSize = fontSize;
        this.paper = paper;
        this.ink = ink;
        this.text = text == null ? "" : text;
        this.font = font == null ? "" : font;
        this.fmt = fmt;
    }

    public boolean has(int bit) {
        return (fmt & bit) != 0;
    }

    public Note withText(String text, float h) {
        return new Note(style, x, y, w, h, fontSize, paper, ink, text, font, fmt);
    }

    public Note withSize(float w, float h) {
        return new Note(style, x, y, w, h, fontSize, paper, ink, text, font, fmt);
    }

    public Note withLook(int paper, int ink, float fontSize, float h) {
        return new Note(style, x, y, w, h, fontSize, paper, ink, text, font, fmt);
    }

    public Note withFont(String font, int fmt) {
        return new Note(style, x, y, w, h, fontSize, paper, ink, text, font, fmt);
    }

    @Override
    public Box bounds() {
        return new Box(x, y, x + w, y + h);
    }

    @Override
    public Note transformed(float scale, float dx, float dy) {
        return transformed(scale, scale, dx, dy);
    }

    @Override
    public Note transformed(float sx, float sy, float dx, float dy) {
        float fs = sx == sy ? fontSize * sx : fontSize;
        return new Note(style, x * sx + dx, y * sy + dy, w * sx, h * sy, fs, paper, ink, text, font, fmt);
    }

    @Override
    public Note rotated(float angle, float px, float py) {
        float c = (float) Math.cos(angle), s = (float) Math.sin(angle);
        float dx = x + w / 2 - px, dy = y + h / 2 - py;
        float cx = px + dx * c - dy * s, cy = py + dx * s + dy * c;
        return new Note(style, cx - w / 2, cy - h / 2, w, h, fontSize, paper, ink, text, font, fmt);
    }

    @Override
    public Note recolored(int argb) {
        if (style == STICKY) return new Note(style, x, y, w, h, fontSize, argb | 0xFF000000, ink, text, font, fmt);
        return new Note(style, x, y, w, h, fontSize, paper, argb | 0xFF000000, text, font, fmt);
    }

    @Override
    public boolean hits(float px, float py, float r) {
        return px >= x - r && px <= x + w + r && py >= y - r && py <= y + h + r;
    }
}
