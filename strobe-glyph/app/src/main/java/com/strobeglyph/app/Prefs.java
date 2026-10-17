package com.strobeglyph.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.strobeglyph.app.engine.PatternType;
import com.strobeglyph.app.engine.ScreenColor;
import com.strobeglyph.app.engine.Settings;
import com.strobeglyph.app.glyph.GlyphEffect;

/** Remembers the user's settings between launches. */
final class Prefs {
    private static final String FILE = "strobe";
    private static final String WARNING_ACCEPTED = "warning_accepted_v1";

    private final SharedPreferences sp;

    Prefs(Context context) {
        sp = context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    boolean warningAccepted() {
        return sp.getBoolean(WARNING_ACCEPTED, false);
    }

    void acceptWarning() {
        sp.edit().putBoolean(WARNING_ACCEPTED, true).apply();
    }

    void load(Settings s) {
        for (PatternType p : PatternType.values()) {
            s.restoreHzFor(p, sp.getFloat("hz_" + p.name(), p.defaultHz));
        }
        s.selectPattern(pick(PatternType.values(), sp.getString("pattern", null), PatternType.STROBE));
        s.duty = Settings.clampDuty(sp.getFloat("duty", s.duty));
        s.morseText = sp.getString("morse", s.morseText);
        s.torch = sp.getBoolean("torch", s.torch);
        s.screen = sp.getBoolean("screen", s.screen);
        s.glyph = sp.getBoolean("glyph", s.glyph);
        s.torchPercent = clamp(sp.getInt("torch_pct", s.torchPercent), 5, 100);
        s.glyphPercent = clamp(sp.getInt("glyph_pct", s.glyphPercent), 5, 100);
        s.glyphHz = Settings.clampHz(sp.getFloat("glyph_hz", s.glyphHz));
        s.screenColor = pick(ScreenColor.values(), sp.getString("screen_color", null), s.screenColor);
        s.glyphEffect = pick(GlyphEffect.values(), sp.getString("glyph_effect", null), s.glyphEffect);
        s.timerSeconds = Math.max(0, sp.getInt("timer", s.timerSeconds));
    }

    void save(Settings s) {
        SharedPreferences.Editor e = sp.edit();
        for (PatternType p : PatternType.values()) {
            e.putFloat("hz_" + p.name(), s.hzFor(p));
        }
        e.putString("pattern", s.pattern.name())
                .putFloat("duty", s.duty)
                .putString("morse", s.morseText)
                .putBoolean("torch", s.torch)
                .putBoolean("screen", s.screen)
                .putBoolean("glyph", s.glyph)
                .putInt("torch_pct", s.torchPercent)
                .putInt("glyph_pct", s.glyphPercent)
                .putFloat("glyph_hz", s.glyphHz)
                .putString("screen_color", s.screenColor.name())
                .putString("glyph_effect", s.glyphEffect.name())
                .putInt("timer", s.timerSeconds)
                .apply();
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private static <T extends Enum<T>> T pick(T[] values, String name, T fallback) {
        if (name != null) {
            for (T v : values) {
                if (v.name().equals(name)) {
                    return v;
                }
            }
        }
        return fallback;
    }
}
