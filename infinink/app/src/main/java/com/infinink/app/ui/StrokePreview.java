package com.infinink.app.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.View;

import com.infinink.app.ink.FloatList;
import com.infinink.app.ink.Shapes;
import com.infinink.app.model.Brush;
import com.infinink.app.model.Stroke;
import com.infinink.app.render.InkRenderer;

/** A sample squiggle drawn with the real brush, so size and opacity changes show as you slide. */
public final class StrokePreview extends View {
    private final InkRenderer ink;
    private final Path scratch = new Path();
    private final Path clip = new Path();
    private final Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private final FloatList squiggle = new FloatList(300);
    private int brush = Brush.PEN, color = 0xFF000000, paper = 0xFFFFFFFF;
    private float sizePx = 6f;
    private int flags;
    private int shape = -1;

    public StrokePreview(Context c, InkRenderer ink) {
        super(c);
        this.ink = ink;
        setMinimumHeight(Ui.dp(c, 64));
    }

    public void set(int brush, int color, float sizePx, int paper) {
        this.brush = brush;
        this.color = color;
        this.sizePx = sizePx;
        this.paper = paper;
        this.shape = -1;
        invalidate();
    }

    public void setShape(int shape, int color, float sizePx, boolean fill, int paper) {
        this.shape = shape;
        this.color = color;
        this.sizePx = sizePx;
        this.paper = paper;
        flags = Stroke.GEOMETRY | (Shapes.isClosed(shape) ? Stroke.CLOSED : 0)
                | (fill && Shapes.isClosed(shape) ? Stroke.FILL : 0) | (shape == Shapes.ARROW ? Stroke.ARROW : 0);
        invalidate();
    }

    @Override
    protected void onMeasure(int w, int h) {
        setMeasuredDimension(MeasureSpec.getSize(w), resolveSize(getSuggestedMinimumHeight(), h));
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        float r = Ui.dp(getContext(), 14);
        box.set(0, 0, w, h);
        clip.rewind();
        clip.addRoundRect(box, r, r, Path.Direction.CW);
        squiggle.clear();
        int n = 90;
        float x0 = w * 0.1f, x1 = w * 0.9f;
        for (int i = 0; i < n; i++) {
            float t = i / (float) (n - 1);
            float y = h / 2f + (float) Math.sin(t * Math.PI * 2) * h * 0.2f;
            // Press harder in the middle, like a real stroke.
            squiggle.add(x0 + (x1 - x0) * t, y, 0.25f + 0.6f * (float) Math.sin(t * Math.PI));
        }
    }

    @Override
    protected void onDraw(Canvas c) {
        float w = getWidth(), h = getHeight();
        c.save();
        c.clipPath(clip);
        bg.setColor(paper);
        c.drawRect(box, bg);
        ink.setViewScale(1f);
        if (shape >= 0) {
            float m = h * 0.22f;
            float[] pts = Shapes.build(shape, w / 2 - h * 0.9f, m, w / 2 + h * 0.9f, h - m);
            ink.drawLive(c, Brush.PEN, color, sizePx, flags, pts, pts.length / 3, scratch);
        } else if (squiggle.size() > 0) {
            ink.drawLive(c, brush, color, sizePx, Stroke.REAL_PRESSURE, squiggle.raw(), squiggle.size() / 3, scratch);
        }
        c.restore();
    }
}
