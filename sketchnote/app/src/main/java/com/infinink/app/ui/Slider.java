package com.infinink.app.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.MotionEvent;
import android.view.View;

/** A smooth 0..1 slider with a gradient fill. */
public final class Slider extends View {
    public interface Listener {
        void onChange(float value, boolean done);
    }

    private float value;
    private Listener listener;
    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fillP = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint thumb = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF r = new RectF();
    private final float thumbR, trackH;

    public Slider(Context c) {
        super(c);
        thumbR = Ui.dp(c, 11);
        trackH = Ui.dp(c, 6);
        track.setColor(0x2EFFFFFF);
        thumb.setColor(0xFFFFFFFF);
        thumb.setShadowLayer(Ui.dp(c, 3), 0, Ui.dp(c, 1), 0x66000000);
        setLayerType(LAYER_TYPE_SOFTWARE, null); // for the thumb shadow
        setMinimumHeight(Ui.dp(c, 36));
    }

    public void setListener(Listener l) {
        listener = l;
    }

    public void setValue(float v) {
        value = Math.max(0, Math.min(1, v));
        invalidate();
    }

    public float value() {
        return value;
    }

    @Override
    protected void onMeasure(int w, int h) {
        setMeasuredDimension(MeasureSpec.getSize(w), resolveSize(getSuggestedMinimumHeight(), h));
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        fillP.setShader(new LinearGradient(thumbR, 0, w - thumbR, 0, Ui.ACCENT, Ui.ACCENT_2, Shader.TileMode.CLAMP));
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), cy = getHeight() / 2f;
        float x0 = thumbR, x1 = w - thumbR;
        float x = x0 + (x1 - x0) * value;
        r.set(x0, cy - trackH / 2, x1, cy + trackH / 2);
        c.drawRoundRect(r, trackH / 2, trackH / 2, track);
        r.set(x0, cy - trackH / 2, Math.max(x0 + trackH, x), cy + trackH / 2);
        c.drawRoundRect(r, trackH / 2, trackH / 2, fillP);
        c.drawCircle(x, cy, thumbR, thumb);
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        float x0 = thumbR, x1 = getWidth() - thumbR;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                getParent().requestDisallowInterceptTouchEvent(true);
                // fall through
            case MotionEvent.ACTION_MOVE:
            case MotionEvent.ACTION_UP:
                setValue((e.getX() - x0) / Math.max(1, x1 - x0));
                if (listener != null) listener.onChange(value, e.getActionMasked() == MotionEvent.ACTION_UP);
                return true;
            case MotionEvent.ACTION_CANCEL:
                if (listener != null) listener.onChange(value, true);
                return true;
        }
        return super.onTouchEvent(e);
    }
}
