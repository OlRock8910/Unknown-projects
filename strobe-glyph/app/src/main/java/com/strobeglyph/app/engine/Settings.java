package com.strobeglyph.app.engine;

import com.strobeglyph.app.glyph.GlyphEffect;

/**
 * Every knob the user can turn. The UI thread writes, the strobe threads read on every step,
 * so a change lands on the very next flash without restarting anything.
 */
public final class Settings {
    public static final float MIN_HZ = 0.5f;
    public static final float MAX_HZ = 60f;
    public static final float MIN_DUTY = 0.05f;
    public static final float MAX_DUTY = 0.95f;
    public static final int MAX_MORSE_CHARS = 40;

    /** Flashes per second. Each pattern remembers its own, see {@link #selectPattern}. */
    public volatile float hz;
    /** Fraction of each cycle the light is on, for patterns that use it. */
    public volatile float duty = 0.5f;
    public volatile PatternType pattern = PatternType.STROBE;
    public volatile String morseText = "HELLO";

    public volatile boolean torch = true;
    public volatile boolean screen = false;
    public volatile boolean glyph = true;
    public volatile int torchPercent = 100;
    public volatile ScreenColor screenColor = ScreenColor.WHITE;
    public volatile GlyphEffect glyphEffect = GlyphEffect.SYNC;
    public volatile int glyphPercent = 100;
    /** Speed of Glyph effects other than Sync, which follows the torch instead. */
    public volatile float glyphHz = 8f;
    /** Auto-stop after this many seconds; 0 means run until stopped. */
    public volatile int timerSeconds = 0;

    private final float[] hzByPattern = new float[PatternType.values().length];

    public Settings() {
        for (PatternType p : PatternType.values()) {
            hzByPattern[p.ordinal()] = p.defaultHz;
        }
        hz = hzByPattern[pattern.ordinal()];
    }

    public static float clampHz(float v) {
        return Math.max(MIN_HZ, Math.min(MAX_HZ, v));
    }

    public static float clampDuty(float v) {
        return Math.max(MIN_DUTY, Math.min(MAX_DUTY, v));
    }

    /** Sets the speed for the current pattern. */
    public void setHz(float v) {
        float c = clampHz(v);
        hzByPattern[pattern.ordinal()] = c;
        hz = c;
    }

    /** Switches pattern and restores the speed that pattern was last used at. */
    public void selectPattern(PatternType p) {
        pattern = p;
        hz = hzByPattern[p.ordinal()];
    }

    public float hzFor(PatternType p) {
        return hzByPattern[p.ordinal()];
    }

    public void restoreHzFor(PatternType p, float v) {
        hzByPattern[p.ordinal()] = clampHz(v);
        if (p == pattern) {
            hz = hzByPattern[p.ordinal()];
        }
    }
}
