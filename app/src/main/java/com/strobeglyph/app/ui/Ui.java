package com.strobeglyph.app.ui;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ClipDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Colours and small view builders shared by the whole UI. */
public final class Ui {
    public static final int BG = 0xFF07090D;
    public static final int SURFACE = 0xFF10141B;
    public static final int SURFACE_HI = 0xFF181E29;
    public static final int STROKE = 0xFF252D3E;
    public static final int TRACK = 0xFF262E40;
    public static final int TEXT = 0xFFF1F4FA;
    public static final int DIM = 0xFF8D96A9;
    public static final int FAINT = 0xFF5A6479;
    public static final int ACCENT = 0xFF21E6FF;
    public static final int MAGENTA = 0xFFFF3D9A;
    public static final int OK = 0xFF3DDC84;
    public static final int WARN = 0xFFFFB020;
    public static final int DANGER = 0xFFFF4D5E;
    public static final int ON_ACCENT = 0xFF03171C;

    private Ui() {
    }

    public static int dp(Context c, float v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    public static Typeface medium() {
        return Typeface.create("sans-serif-medium", Typeface.NORMAL);
    }

    public static Typeface light() {
        return Typeface.create("sans-serif-light", Typeface.NORMAL);
    }

    public static GradientDrawable rect(Context c, int fill, float radiusDp, int stroke, float strokeDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(c, radiusDp));
        if (strokeDp > 0) {
            d.setStroke(Math.max(1, dp(c, strokeDp)), stroke);
        }
        return d;
    }

    /** Wraps a background so touches get a soft ripple. */
    public static Drawable rippled(Drawable bg) {
        return new RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), bg, null);
    }

    public static TextView text(Context c, String s, float sp, int color) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setIncludeFontPadding(false);
        return t;
    }

    /** Small, wide-spaced, upper-case heading for a card. */
    public static TextView sectionTitle(Context c, String s) {
        TextView t = text(c, s.toUpperCase(), 11.5f, DIM);
        t.setTypeface(medium());
        t.setLetterSpacing(0.16f);
        return t;
    }

    public static LinearLayout.LayoutParams linear(int w, int h) {
        return new LinearLayout.LayoutParams(w, h);
    }

    public static LinearLayout.LayoutParams linear(int w, int h, int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(w, h);
        p.setMargins(l, t, r, b);
        return p;
    }

    /** Vertical rounded card. Add children and then place the card in a parent yourself. */
    public static LinearLayout card(Context c) {
        LinearLayout card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(rect(c, SURFACE, 22, STROKE, 1));
        card.setClipToPadding(false); // slider thumbs reach into the padding at the ends
        int pad = dp(c, 18);
        card.setPadding(pad, dp(c, 16), pad, dp(c, 18));
        return card;
    }

    /** A horizontal row that vertically centres its children. */
    public static LinearLayout row(Context c) {
        LinearLayout r = new LinearLayout(c);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        return r;
    }

    public static void show(View v, boolean visible) {
        v.setVisibility(visible ? View.VISIBLE : View.GONE);
    }

    /** Styled seek-bar track: a thin rounded groove with a filled portion, centred in {@code heightDp}. */
    static LayerDrawable sliderTrack(Context c, int accent, float heightDp) {
        int groove = dp(c, 6);
        GradientDrawable back = rect(c, TRACK, 3, 0, 0);
        back.setSize(-1, groove);
        GradientDrawable fill = rect(c, accent, 3, 0, 0);
        fill.setSize(-1, groove);
        LayerDrawable layers = new LayerDrawable(new Drawable[] {
                back, new ClipDrawable(fill, Gravity.START, ClipDrawable.HORIZONTAL)});
        layers.setId(0, android.R.id.background);
        layers.setId(1, android.R.id.progress);
        int inset = (dp(c, heightDp) - groove) / 2;
        layers.setLayerInset(0, 0, inset, 0, inset);
        layers.setLayerInset(1, 0, inset, 0, inset);
        return layers;
    }

    static Drawable sliderThumb(Context c, int accent) {
        GradientDrawable thumb = new GradientDrawable();
        thumb.setShape(GradientDrawable.OVAL);
        thumb.setColor(0xFFFFFFFF);
        thumb.setStroke(dp(c, 4), accent);
        thumb.setSize(dp(c, 26), dp(c, 26));
        return thumb;
    }

    public static void fillWidth(View v) {
        ViewGroup.LayoutParams p = v.getLayoutParams();
        if (p != null) {
            p.width = ViewGroup.LayoutParams.MATCH_PARENT;
        }
    }

    public static int withAlpha(int color, int alpha) {
        return Color.argb(alpha, Color.red(color), Color.green(color), Color.blue(color));
    }
}
