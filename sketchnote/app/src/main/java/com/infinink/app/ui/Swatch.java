package com.infinink.app.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.SweepGradient;
import android.view.View;

/** A round colour chip; the "custom" one shows a colour wheel with a plus. */
public final class Swatch extends View {
    public final int color;
    private final boolean custom;
    private boolean picked;
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

    public Swatch(Context c, int color, boolean custom) {
        super(c);
        this.color = color;
        this.custom = custom;
        int s = Ui.dp(c, 38);
        setMinimumWidth(s);
        setMinimumHeight(s);
        setClickable(true);
        setContentDescription(custom ? "More colours" : String.format("Colour #%06X", color & 0xFFFFFF));
    }

    public boolean isPicked() {
        return picked;
    }

    public void setPicked(boolean on) {
        picked = on;
        invalidate();
    }

    @Override
    protected void onMeasure(int w, int h) {
        setMeasuredDimension(getSuggestedMinimumWidth(), getSuggestedMinimumHeight());
    }

    @Override
    protected void onDraw(Canvas c) {
        float cx = getWidth() / 2f, cy = getHeight() / 2f;
        float r = Math.min(cx, cy) - Ui.dp(getContext(), 5);
        if (custom) {
            p.setShader(new SweepGradient(cx, cy,
                    new int[]{0xFFFF3B30, 0xFFFFCC00, 0xFF34C759, 0xFF00C7BE, 0xFF007AFF, 0xFFAF52DE, 0xFFFF3B30}, null));
            p.setStyle(Paint.Style.FILL);
            c.drawCircle(cx, cy, r, p);
            p.setShader(null);
            p.setColor(0xE6202128);
            c.drawCircle(cx, cy, r * 0.62f, p);
            p.setColor(0xFFFFFFFF);
            p.setStrokeWidth(Ui.dp(getContext(), 1.8f));
            float a = r * 0.3f;
            c.drawLine(cx - a, cy, cx + a, cy, p);
            c.drawLine(cx, cy - a, cx, cy + a, p);
            return;
        }
        p.setStyle(Paint.Style.FILL);
        p.setColor(color | 0xFF000000);
        c.drawCircle(cx, cy, picked ? r - Ui.dp(getContext(), 2.5f) : r, p);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Ui.dp(getContext(), 1));
        p.setColor(0x33FFFFFF);
        c.drawCircle(cx, cy, picked ? r - Ui.dp(getContext(), 2.5f) : r, p);
        if (picked) {
            p.setStrokeWidth(Ui.dp(getContext(), 2.2f));
            p.setColor(0xFFFFFFFF);
            c.drawCircle(cx, cy, r + Ui.dp(getContext(), 1.5f), p);
        }
    }
}
