package com.infinink.app.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.MotionEvent;
import android.view.View;

/** Saturation/brightness square with a hue bar under it. */
public final class ColorPickerView extends View {
    public interface Listener {
        void onColor(int rgb);
    }

    private final float[] hsv = {270f, 0.6f, 0.95f};
    private Listener listener;
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF sq = new RectF(), hue = new RectF();
    private final int[] hues = new int[13];
    private int dragging; // 1 = square, 2 = hue bar

    public ColorPickerView(Context c) {
        super(c);
        for (int i = 0; i < hues.length; i++) hues[i] = Color.HSVToColor(new float[]{i * 30f, 1f, 1f});
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(Ui.dp(c, 3));
        ring.setColor(0xFFFFFFFF);
    }

    public void setListener(Listener l) {
        listener = l;
    }

    public void setColor(int rgb) {
        Color.colorToHSV(rgb | 0xFF000000, hsv);
        invalidate();
    }

    public int color() {
        return Color.HSVToColor(hsv);
    }

    @Override
    protected void onMeasure(int w, int h) {
        int width = MeasureSpec.getSize(w);
        setMeasuredDimension(width, (int) (width * 0.72f) + Ui.dp(getContext(), 46));
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        float bar = Ui.dp(getContext(), 26);
        sq.set(0, 0, w, h - bar - Ui.dp(getContext(), 18));
        hue.set(0, h - bar, w, h);
    }

    @Override
    protected void onDraw(Canvas c) {
        float rad = Ui.dp(getContext(), 14);
        int pure = Color.HSVToColor(new float[]{hsv[0], 1f, 1f});
        p.setShader(new LinearGradient(sq.left, 0, sq.right, 0, 0xFFFFFFFF, pure, Shader.TileMode.CLAMP));
        c.drawRoundRect(sq, rad, rad, p);
        p.setShader(new LinearGradient(0, sq.top, 0, sq.bottom, 0x00000000, 0xFF000000, Shader.TileMode.CLAMP));
        c.drawRoundRect(sq, rad, rad, p);
        p.setShader(new LinearGradient(hue.left, 0, hue.right, 0, hues, null, Shader.TileMode.CLAMP));
        c.drawRoundRect(hue, hue.height() / 2, hue.height() / 2, p);
        p.setShader(null);

        float sx = sq.left + hsv[1] * sq.width(), sy = sq.top + (1 - hsv[2]) * sq.height();
        p.setColor(color());
        c.drawCircle(sx, sy, Ui.dp(getContext(), 11), p);
        c.drawCircle(sx, sy, Ui.dp(getContext(), 11), ring);
        float hx = hue.left + hsv[0] / 360f * hue.width();
        p.setColor(pure);
        c.drawCircle(hx, hue.centerY(), hue.height() / 2 + Ui.dp(getContext(), 2), p);
        c.drawCircle(hx, hue.centerY(), hue.height() / 2 + Ui.dp(getContext(), 2), ring);
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        float x = e.getX(), y = e.getY();
        if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
            getParent().requestDisallowInterceptTouchEvent(true);
            dragging = y > sq.bottom + Ui.dp(getContext(), 6) ? 2 : 1;
        }
        if (dragging == 1) {
            hsv[1] = clamp((x - sq.left) / sq.width());
            hsv[2] = 1 - clamp((y - sq.top) / sq.height());
        } else if (dragging == 2) {
            hsv[0] = clamp((x - hue.left) / hue.width()) * 359.9f;
        }
        if (e.getActionMasked() == MotionEvent.ACTION_UP || e.getActionMasked() == MotionEvent.ACTION_CANCEL) dragging = 0;
        invalidate();
        if (listener != null) listener.onColor(color());
        return true;
    }

    private static float clamp(float v) {
        return Math.max(0, Math.min(1, v));
    }
}
