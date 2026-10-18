package com.infinink.app.model;

/** The ink a stroke is drawn with. The numbers are stored in board files: never renumber. */
public final class Brush {
    public static final int PEN = 0;
    public static final int PENCIL = 1;
    public static final int BRUSH = 2;
    public static final int CALLIGRAPHY = 3;
    public static final int MARKER = 4;
    public static final int HIGHLIGHTER = 5;

    private Brush() {}

    /** Marker and highlighter have an even width; the others are shaped by pressure and speed. */
    public static boolean isUniform(int brush) {
        return brush == MARKER || brush == HIGHLIGHTER;
    }
}
