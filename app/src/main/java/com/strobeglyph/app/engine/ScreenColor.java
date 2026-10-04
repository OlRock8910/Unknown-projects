package com.strobeglyph.app.engine;

/** What colour the screen flashes. */
public enum ScreenColor {
    WHITE("White"),
    RED("Red"),
    GREEN("Green"),
    BLUE("Blue"),
    RAINBOW("Rainbow"),
    POLICE("Police");

    public final String label;

    ScreenColor(String label) {
        this.label = label;
    }

    /** ARGB colour for the {@code flash}-th flash of this show. */
    public int colorFor(int flash) {
        switch (this) {
            case RED:
                return 0xFFFF1E1E;
            case GREEN:
                return 0xFF19FF5C;
            case BLUE:
                return 0xFF2D4BFF;
            case RAINBOW:
                return hsv(((flash * 47) % 360 + 360) % 360);
            case POLICE:
                return (flash & 1) == 0 ? 0xFFFF1E1E : 0xFF2D4BFF;
            case WHITE:
            default:
                return 0xFFFFFFFF;
        }
    }

    /** Full-saturation, full-value hue to ARGB, without needing android.graphics. */
    private static int hsv(int hueDegrees) {
        float h = hueDegrees / 60f;
        int sector = (int) h;
        float f = h - sector;
        int up = Math.round(255 * f);
        int down = 255 - up;
        int r;
        int g;
        int b;
        switch (sector) {
            case 0: r = 255; g = up; b = 0; break;
            case 1: r = down; g = 255; b = 0; break;
            case 2: r = 0; g = 255; b = up; break;
            case 3: r = 0; g = down; b = 255; break;
            case 4: r = up; g = 0; b = 255; break;
            default: r = 255; g = 0; b = down; break;
        }
        return 0xFF000000 | (r << 16) | (g << 8) | b;
    }
}
