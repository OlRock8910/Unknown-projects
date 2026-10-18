package com.infinink.app.model;

import java.util.ArrayList;
import java.util.List;

/** One infinite sheet: its look, where you were looking, and everything on it (bottom first). */
public final class Board {
    public static final int PATTERN_BLANK = 0;
    public static final int PATTERN_DOTS = 1;
    public static final int PATTERN_GRID = 2;
    public static final int PATTERN_LINES = 3;

    public final String id;
    public String name;
    public long created;
    public long modified;
    public int paper = 0xFFFFFFFF;
    public int pattern = PATTERN_DOTS;
    /** The board point at the middle of the screen, and the zoom (screen pixels per board unit). */
    public float viewX, viewY, viewScale = 1f;
    public final ArrayList<Item> items = new ArrayList<>();

    public Board(String id, String name) {
        this.id = id;
        this.name = name;
        created = modified = System.currentTimeMillis();
    }

    public boolean isDarkPaper() {
        return isDark(paper);
    }

    public static boolean isDark(int argb) {
        int r = (argb >> 16) & 0xFF, g = (argb >> 8) & 0xFF, b = argb & 0xFF;
        return 0.299 * r + 0.587 * g + 0.114 * b < 128;
    }

    /** Bounds of everything on the board, or an empty box for an empty board. */
    public Box contentBounds() {
        return boundsOf(items);
    }

    public static Box boundsOf(List<? extends Item> list) {
        Box b = Box.empty();
        for (Item it : list) b.add(it.bounds());
        return b;
    }
}
