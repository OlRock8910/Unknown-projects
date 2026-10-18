package com.infinink.app.render;

import android.graphics.Canvas;
import android.graphics.Paint;

import com.infinink.app.ink.FloatList;
import com.infinink.app.model.Board;
import com.infinink.app.model.Viewport;

/**
 * Draws the paper: its colour and its dots, grid or lines. Drawn in screen pixels so it stays
 * crisp; the spacing steps up or down by 4x as you zoom so it never turns to mush or vanishes.
 */
public final class PaperRenderer {
    private static final float BASE = 40f; // board units between lines at 100%

    private final Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint minor = new Paint();
    private final Paint major = new Paint();
    private final FloatList buf = new FloatList(4096);
    private final float density;

    public PaperRenderer(float density) {
        this.density = density;
        dot.setStrokeCap(Paint.Cap.ROUND);
        minor.setStyle(Paint.Style.STROKE);
        major.setStyle(Paint.Style.STROKE);
    }

    public void draw(Canvas c, int paper, int pattern, Viewport vp, float w, float h) {
        c.drawColor(paper);
        if (pattern == Board.PATTERN_BLANK) return;
        boolean dark = Board.isDark(paper);
        float unit = BASE;
        while (unit * vp.scale < 14 * density) unit *= 4;
        while (unit * vp.scale > 56 * density) unit /= 4;
        float step = unit * vp.scale;
        // Fade the pattern in as it gets denser, so the switch between spacings is not a jump.
        float fade = Math.min(1f, (step / density - 14f) / 20f + 0.45f);

        float x0 = vp.toBoardX(0), y0 = vp.toBoardY(0);
        long i0 = (long) Math.floor(x0 / unit), j0 = (long) Math.floor(y0 / unit);
        float sx0 = vp.toScreenX(i0 * unit), sy0 = vp.toScreenY(j0 * unit);
        int base = dark ? 0xFFFFFF : 0x1A1F36;

        if (pattern == Board.PATTERN_DOTS) {
            dot.setColor(((int) ((dark ? 46 : 52) * fade) << 24) | base);
            dot.setStrokeWidth(Math.max(1.6f * density, Math.min(3f * density, step * 0.09f)));
            buf.clear();
            for (float y = sy0; y <= h + step; y += step) {
                for (float x = sx0; x <= w + step; x += step) buf.add(x, y);
            }
            c.drawPoints(buf.raw(), 0, buf.size(), dot);
            return;
        }

        minor.setStrokeWidth(Math.max(1f, density * 0.75f));
        major.setStrokeWidth(Math.max(1f, density * 1.1f));
        minor.setColor(((int) ((dark ? 22 : 26) * fade) << 24) | base);
        major.setColor(((dark ? 40 : 44)) << 24 | base);

        if (pattern == Board.PATTERN_GRID) {
            lines(c, true, sx0, i0, step, w, h);
            lines(c, false, sy0, j0, step, w, h);
        } else {
            lines(c, false, sy0, j0, step, w, h);
        }
    }

    /** Vertical (or horizontal) lines; every 5th is a little stronger. */
    private void lines(Canvas c, boolean vertical, float s0, long k0, float step, float w, float h) {
        float end = vertical ? w : h;
        buf.clear();
        FloatList strong = new FloatList(64);
        long k = k0;
        for (float s = s0; s <= end + step; s += step, k++) {
            FloatList target = (k % 5 == 0) ? strong : buf;
            if (vertical) target.add(s, 0, s);
            else target.add(0, s, w);
            target.add(vertical ? h : s);
        }
        c.drawLines(buf.raw(), 0, buf.size(), minor);
        c.drawLines(strong.raw(), 0, strong.size(), major);
    }
}
