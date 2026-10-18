package com.infinink.app.ui;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.TextView;

/** Colours, sizes and small view factories shared by the screens. */
public final class Ui {
    public static final int BG = 0xFF0C0D11;
    public static final int SURFACE = 0xFF15161C;
    public static final int SURFACE_2 = 0xFF1D1F27;
    public static final int GLASS = 0xF417181F;
    public static final int HAIRLINE = 0x1FFFFFFF;
    public static final int TEXT = 0xFFF3F4F7;
    public static final int TEXT_2 = 0xFF9EA2AD;
    public static final int ACCENT = 0xFF8B5CF6;
    public static final int ACCENT_2 = 0xFFEC4899;
    public static final int DANGER = 0xFFFF5A5F;

    /** The ink palette offered for every tool. */
    public static final int[] PALETTE = {
            0xFF1C1C1E, 0xFF636366, 0xFFF2F2F5, 0xFFE5484D, 0xFFF76B15, 0xFFFFC53D, 0xFF46A758,
            0xFF12A594, 0xFF0090FF, 0xFF3E63DD, 0xFF8E4EC6, 0xFFD6409F, 0xFFA07553,
    };

    /** Sticky-note card colours. */
    public static final int[] NOTE_COLORS = {
            0xFFFFE58F, 0xFFFFC2D4, 0xFFB5DEFF, 0xFFC4EDB0, 0xFFDCCBFF, 0xFFFFCFA3, 0xFFFFFFFF, 0xFF2C2D35,
    };

    /** Paper colours: white, cream, grey, slate, black, blueprint. */
    public static final int[] PAPERS = {0xFFFFFFFF, 0xFFFBF5E6, 0xFFEDEEF1, 0xFF23252D, 0xFF0F1013, 0xFF1A2B4C};
    public static final String[] PAPER_NAMES = {"White", "Cream", "Soft grey", "Slate", "Black", "Blueprint"};

    private Ui() {}

    public static int dp(Context c, float v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    public static GradientDrawable round(int color, float radiusPx) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(radiusPx);
        return d;
    }

    public static GradientDrawable round(int color, float radiusPx, int strokeColor, int strokePx) {
        GradientDrawable d = round(color, radiusPx);
        d.setStroke(strokePx, strokeColor);
        return d;
    }

    public static GradientDrawable gradient(int from, int to, float radiusPx) {
        GradientDrawable d = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{from, to});
        d.setCornerRadius(radiusPx);
        return d;
    }

    /** A touch ripple over the given background, clipped to its shape. */
    public static Drawable ripple(Drawable content, Drawable mask) {
        return new RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), content, mask);
    }

    public static Drawable glass(Context c, float radiusDp) {
        return round(GLASS, dp(c, radiusDp), HAIRLINE, Math.max(1, dp(c, 1)));
    }

    public static TextView text(Context c, String s, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(Typeface.create("sans-serif" + (bold ? "-medium" : ""), Typeface.NORMAL));
        t.setIncludeFontPadding(false);
        return t;
    }

    /** A rounded, tappable pill of text. */
    public static TextView chip(Context c, String s, boolean on) {
        TextView t = text(c, s, 13.5f, on ? 0xFFFFFFFF : TEXT, true);
        t.setGravity(Gravity.CENTER);
        int h = dp(c, 9), w = dp(c, 14);
        t.setPadding(w, h, w, h);
        styleChip(t, on);
        return t;
    }

    public static void styleChip(TextView t, boolean on) {
        Context c = t.getContext();
        GradientDrawable bg = on ? gradient(ACCENT, 0xFFB14CF0, dp(c, 18)) : round(SURFACE_2, dp(c, 18), HAIRLINE, dp(c, 1));
        t.setBackground(ripple(bg, round(0xFFFFFFFF, dp(c, 18))));
        t.setTextColor(on ? 0xFFFFFFFF : TEXT);
    }

    public static void press(View v) {
        v.animate().cancel();
        v.setScaleX(0.9f);
        v.setScaleY(0.9f);
        v.animate().scaleX(1f).scaleY(1f).setDuration(160).start();
    }
}
