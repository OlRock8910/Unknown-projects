package com.strobeglyph.app.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.View;

import com.strobeglyph.app.engine.Settings;
import com.strobeglyph.app.output.FlashSink;

/**
 * Covers the whole screen and flashes it. Touch it to stop. Drawing is driven from the strobe
 * thread through {@link #postInvalidate()}, so it is only as fast as the display refresh.
 */
public final class FlashView extends View implements FlashSink {
    private final Settings settings;
    private final Paint hint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private volatile boolean on;
    private volatile int color = Color.WHITE;
    private int lastFlash = -1;

    public FlashView(Context c, Settings settings) {
        super(c);
        this.settings = settings;
        hint.setColor(0x99808080);
        hint.setTextAlign(Paint.Align.CENTER);
        hint.setTextSize(13 * c.getResources().getDisplayMetrics().scaledDensity);
        setVisibility(GONE);
        setClickable(true);
        setContentDescription("Screen strobe. Tap to stop.");
    }

    @Override
    public void begin() {
        on = false;
        lastFlash = -1;
        setVisibility(VISIBLE);
    }

    @Override
    public void end() {
        on = false;
        setVisibility(GONE);
    }

    @Override
    public void setFlash(boolean lit, int flash) {
        if (lit == on && (!lit || flash == lastFlash)) {
            return;
        }
        if (lit) {
            lastFlash = flash;
            color = settings.screenColor.colorFor(flash);
        }
        on = lit;
        postInvalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        canvas.drawColor(on ? color : Color.BLACK);
        canvas.drawText("Tap to stop  ·  volume keys change speed",
                getWidth() / 2f, getHeight() - Ui.dp(getContext(), 56), hint);
    }
}
