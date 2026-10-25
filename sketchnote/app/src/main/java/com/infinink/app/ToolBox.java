package com.infinink.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.infinink.app.ink.Shapes;
import com.infinink.app.model.Brush;

/** The tools, and the colour/size/opacity chosen for each, remembered between launches. */
public final class ToolBox {
    public static final int PEN = 0;
    public static final int PENCIL = 1;
    public static final int BRUSH = 2;
    public static final int CALLIGRAPHY = 3;
    public static final int MARKER = 4;
    public static final int HIGHLIGHTER = 5;
    public static final int ERASER = 6;
    public static final int LASSO = 7;
    public static final int SHAPE = 8;
    public static final int TEXT = 9;
    public static final int NOTE = 10;
    public static final int COUNT = 11;

    public static final String[] NAMES = {
            "Pen", "Pencil", "Brush", "Calligraphy", "Marker", "Highlighter",
            "Eraser", "Lasso", "Shapes", "Text", "Sticky note"
    };

    /** Size limits per tool, in dp on screen. */
    static final float[] MIN_SIZE = {0.5f, 0.5f, 2f, 2f, 2f, 8f, 6f, 0, 0.5f, 10f, 10f};
    static final float[] MAX_SIZE = {24f, 20f, 80f, 60f, 48f, 64f, 120f, 0, 24f, 96f, 40f};
    private static final float[] DEFAULT_SIZE = {2.6f, 2.2f, 14f, 10f, 8f, 22f, 26f, 0, 2.6f, 22f, 18f};
    private static final int[] DEFAULT_COLOR = {
            0xFF1C1C1E, 0xFF3A3A3C, 0xFF1C1C1E, 0xFF1C1C1E, 0xFF0090FF, 0x66FFD60A,
            0, 0, 0xFF8E4EC6, 0xFF1C1C1E, 0xFFFFE58F
    };

    public static final int ERASE_PRECISE = 0;
    public static final int ERASE_WHOLE = 1;

    private final SharedPreferences prefs;
    private final int[] color = new int[COUNT];
    private final float[] size = new float[COUNT];
    public int tool;
    public int eraseMode;
    public int shape;
    public boolean shapeFill;
    /** null until the user picks; then whether a finger draws (true) or only pans (false). */
    public Boolean fingerDraws;
    /** Pointer pen: fingers hold a long pen and draw from its tip. */
    public boolean pointerPen;
    /** Left-handed pointer pen: the tip sits up and to the right of the finger instead of the left. */
    public boolean pointerLeft;
    /** Font and bold/italic/underline/alignment for new text and notes. */
    public String textFont = "";
    public int textFmt;
    private final int[] recent = new int[10];
    private int recentCount;

    public ToolBox(Context ctx) {
        prefs = ctx.getSharedPreferences("tools", Context.MODE_PRIVATE);
        for (int t = 0; t < COUNT; t++) {
            color[t] = prefs.getInt("color" + t, DEFAULT_COLOR[t]);
            size[t] = prefs.getFloat("size" + t, DEFAULT_SIZE[t]);
        }
        tool = prefs.getInt("tool", PEN);
        eraseMode = prefs.getInt("eraseMode", ERASE_PRECISE);
        shape = prefs.getInt("shape", Shapes.RECT);
        shapeFill = prefs.getBoolean("shapeFill", false);
        if (prefs.contains("fingerDraws")) fingerDraws = prefs.getBoolean("fingerDraws", true);
        textFont = prefs.getString("textFont", "");
        pointerPen = prefs.getBoolean("pointerPen", false);
        pointerLeft = prefs.getBoolean("pointerLeft", false);
        textFmt = prefs.getInt("textFmt", 0);
        recentCount = Math.min(recent.length, prefs.getInt("recentCount", 0));
        for (int i = 0; i < recentCount; i++) recent[i] = prefs.getInt("recent" + i, 0);
    }

    public static boolean isInk(int tool) {
        return tool <= HIGHLIGHTER;
    }

    public static boolean hasColor(int tool) {
        return tool != ERASER && tool != LASSO;
    }

    public static boolean hasOpacity(int tool) {
        return isInk(tool) || tool == SHAPE;
    }

    public static int brushOf(int tool) {
        switch (tool) {
            case PENCIL: return Brush.PENCIL;
            case BRUSH: return Brush.BRUSH;
            case CALLIGRAPHY: return Brush.CALLIGRAPHY;
            case MARKER: return Brush.MARKER;
            case HIGHLIGHTER: return Brush.HIGHLIGHTER;
            default: return Brush.PEN;
        }
    }

    public int color(int t) {
        return color[t];
    }

    public float size(int t) {
        return size[t];
    }

    public float minSize(int t) {
        return MIN_SIZE[t];
    }

    public float maxSize(int t) {
        return MAX_SIZE[t];
    }

    public void setColor(int t, int argb) {
        color[t] = argb;
        save();
    }

    /** Changes the colour but keeps the tool's opacity. */
    public void setHue(int t, int rgb) {
        color[t] = (color[t] & 0xFF000000) | (rgb & 0x00FFFFFF);
        if (!hasOpacity(t)) color[t] |= 0xFF000000;
        save();
    }

    public void setSize(int t, float s) {
        size[t] = Math.max(MIN_SIZE[t], Math.min(MAX_SIZE[t], s));
        save();
    }

    /** Opacity 0..1 of the tool's colour. */
    public float opacity(int t) {
        return ((color[t] >>> 24) & 0xFF) / 255f;
    }

    public void setOpacity(int t, float o) {
        int a = Math.round(Math.max(0.05f, Math.min(1f, o)) * 255);
        color[t] = (a << 24) | (color[t] & 0x00FFFFFF);
        save();
    }

    /** Colours picked from the full picker, newest first. */
    public int[] recentColors() {
        int[] out = new int[recentCount];
        System.arraycopy(recent, 0, out, 0, recentCount);
        return out;
    }

    public void addRecent(int rgb) {
        rgb |= 0xFF000000;
        int at = -1;
        for (int i = 0; i < recentCount; i++) if (recent[i] == rgb) at = i;
        if (at < 0) {
            if (recentCount < recent.length) recentCount++;
            at = recentCount - 1;
        }
        System.arraycopy(recent, 0, recent, 1, at);
        recent[0] = rgb;
        save();
    }

    /** Dark paper wants light ink: flip the default near-black colours to near-white and back. */
    public void adaptToPaper(boolean darkPaper) {
        for (int t = 0; t < COUNT; t++) {
            if (!isInk(t) && t != SHAPE && t != TEXT) continue;
            int rgb = color[t] & 0x00FFFFFF;
            int lum = ((rgb >> 16) & 0xFF) + ((rgb >> 8) & 0xFF) + (rgb & 0xFF);
            boolean nearBlack = lum < 3 * 70, nearWhite = lum > 3 * 225;
            if (darkPaper && nearBlack) color[t] = (color[t] & 0xFF000000) | 0xF2F2F5;
            else if (!darkPaper && nearWhite) color[t] = (color[t] & 0xFF000000) | 0x1C1C1E;
        }
        save();
    }

    public void save() {
        SharedPreferences.Editor e = prefs.edit();
        for (int t = 0; t < COUNT; t++) {
            e.putInt("color" + t, color[t]);
            e.putFloat("size" + t, size[t]);
        }
        e.putInt("tool", tool);
        e.putInt("eraseMode", eraseMode);
        e.putInt("shape", shape);
        e.putBoolean("shapeFill", shapeFill);
        if (fingerDraws != null) e.putBoolean("fingerDraws", fingerDraws);
        e.putString("textFont", textFont);
        e.putBoolean("pointerPen", pointerPen);
        e.putBoolean("pointerLeft", pointerLeft);
        e.putInt("textFmt", textFmt);
        e.putInt("recentCount", recentCount);
        for (int i = 0; i < recentCount; i++) e.putInt("recent" + i, recent[i]);
        e.apply();
    }
}
