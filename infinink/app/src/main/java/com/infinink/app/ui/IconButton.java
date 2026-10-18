package com.infinink.app.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

/** A round icon button. "Selected" gets the accent glow; the accent colour tints tool tips. */
public final class IconButton extends View {
    private final int icon;
    private final float iconSize;
    private int ink = Ui.TEXT;
    private int accent = Ui.ACCENT;
    private boolean on;
    private boolean dim;
    private final Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rect = new RectF();

    public IconButton(Context c, int icon, float sizeDp, float iconDp, String description) {
        super(c);
        this.icon = icon;
        this.iconSize = Ui.dp(c, iconDp);
        int s = Ui.dp(c, sizeDp);
        setMinimumWidth(s);
        setMinimumHeight(s);
        setContentDescription(description);
        setClickable(true);
        setFocusable(true);
        setBackground(Ui.ripple(null, Ui.round(0xFFFFFFFF, s / 2f)));
    }

    public void setOn(boolean on) {
        if (this.on != on) {
            this.on = on;
            invalidate();
        }
    }

    public boolean isOn() {
        return on;
    }

    public void setAccent(int color) {
        accent = color | 0xFF000000;
        invalidate();
    }

    public void setInk(int color) {
        ink = color;
        invalidate();
    }

    /** Greyed out, e.g. undo with nothing to undo. */
    public void setDim(boolean dim) {
        if (this.dim != dim) {
            this.dim = dim;
            setAlpha(dim ? 0.35f : 1f);
        }
    }

    @Override
    protected void onMeasure(int wSpec, int hSpec) {
        setMeasuredDimension(resolveSize(getSuggestedMinimumWidth(), wSpec), resolveSize(getSuggestedMinimumHeight(), hSpec));
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight();
        if (on) {
            float inset = Ui.dp(getContext(), 3);
            rect.set(inset, inset, w - inset, h - inset);
            bg.setColor(0x338B5CF6);
            c.drawRoundRect(rect, rect.height() / 2, rect.height() / 2, bg);
            bg.setStyle(Paint.Style.STROKE);
            bg.setStrokeWidth(Ui.dp(getContext(), 1.2f));
            bg.setColor(0x998B5CF6);
            c.drawRoundRect(rect, rect.height() / 2, rect.height() / 2, bg);
            bg.setStyle(Paint.Style.FILL);
        }
        Icons.draw(c, icon, w / 2, h / 2, iconSize, ink, accent);
    }
}
