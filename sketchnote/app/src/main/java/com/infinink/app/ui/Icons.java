package com.infinink.app.ui;

import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;

/**
 * Line icons drawn in code on a 24x24 grid, so there are no image files to keep in sync and they
 * stay sharp at any size. The drawing tools are drawn as the instrument itself with its tip in
 * the tool's current colour.
 */
public final class Icons {
    public static final int PEN = 0, PENCIL = 1, BRUSH = 2, CALLIGRAPHY = 3, MARKER = 4, HIGHLIGHTER = 5,
            ERASER = 6, LASSO = 7, SHAPES = 8, TEXT = 9, NOTE = 10, IMAGE = 11,
            UNDO = 20, REDO = 21, BACK = 22, MORE = 23, TRASH = 24, DUPLICATE = 25, PLUS = 26, CHECK = 27,
            CLOSE = 28, SHARE = 29, EDIT = 30, FIT = 31, PALETTE = 32,
            S_LINE = 40, S_ARROW = 41, S_RECT = 42, S_ELLIPSE = 43, S_TRIANGLE = 44, S_DIAMOND = 45, FILL = 46,
            ROTATE = 50, FLIP = 51, EYEDROPPER = 52, CROP = 53, WAND = 54, CUTOUT = 55;

    private static final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final Path p = new Path();
    private static final RectF r = new RectF();

    static {
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeJoin(Paint.Join.ROUND);
        fill.setStyle(Paint.Style.FILL);
    }

    private Icons() {}

    /** Draws icon centred at (cx, cy), size px across, in ink with the accent for tool tips. */
    public static void draw(Canvas c, int icon, float cx, float cy, float size, int ink, int accent) {
        c.save();
        float k = size / 24f;
        c.translate(cx - size / 2, cy - size / 2);
        c.scale(k, k);
        line.setColor(ink);
        line.setStrokeWidth(1.7f);
        line.setPathEffect(null);
        fill.setColor(accent);
        p.rewind();
        switch (icon) {
            case PEN:
                tilt(c);
                r.set(9.6f, 1.5f, 14.4f, 13.5f);
                c.drawRoundRect(r, 1.6f, 1.6f, line);
                p.moveTo(9.6f, 13.5f);
                p.lineTo(14.4f, 13.5f);
                p.lineTo(12f, 21.5f);
                p.close();
                c.drawPath(p, fill);
                c.drawPath(p, tipLine(ink));
                c.drawLine(12f, 16.5f, 12f, 18.6f, stroke(0x66000000, 0.9f));
                break;
            case PENCIL:
                tilt(c);
                r.set(9.6f, 1.5f, 14.4f, 14.5f);
                c.drawRect(r, line);
                c.drawLine(9.6f, 4.3f, 14.4f, 4.3f, line);
                p.moveTo(9.6f, 14.5f);
                p.lineTo(14.4f, 14.5f);
                p.lineTo(12f, 21.5f);
                p.close();
                c.drawPath(p, line);
                p.rewind();
                p.moveTo(11.0f, 18.6f);
                p.lineTo(13.0f, 18.6f);
                p.lineTo(12f, 21.5f);
                p.close();
                c.drawPath(p, fill);
                break;
            case BRUSH:
                tilt(c);
                c.drawLine(12f, 1.5f, 12f, 10f, line);
                r.set(10.4f, 10f, 13.6f, 13f);
                c.drawRect(r, line);
                p.moveTo(10.2f, 13.4f);
                p.cubicTo(9.2f, 16.5f, 10.8f, 19.5f, 12f, 22f);
                p.cubicTo(13.2f, 19.5f, 14.8f, 16.5f, 13.8f, 13.4f);
                p.close();
                c.drawPath(p, fill);
                c.drawPath(p, tipLine(ink));
                break;
            case CALLIGRAPHY:
                tilt(c);
                r.set(9.8f, 1.5f, 14.2f, 12.5f);
                c.drawRoundRect(r, 1.2f, 1.2f, line);
                p.moveTo(9.4f, 12.8f);
                p.lineTo(14.6f, 12.8f);
                p.lineTo(14.2f, 19.5f);
                p.lineTo(9.8f, 21.5f);
                p.close();
                c.drawPath(p, fill);
                c.drawPath(p, tipLine(ink));
                break;
            case MARKER:
                tilt(c);
                r.set(8.8f, 1.5f, 15.2f, 13.5f);
                c.drawRoundRect(r, 2.2f, 2.2f, line);
                r.set(10.2f, 13.5f, 13.8f, 20.5f);
                c.drawRoundRect(r, 1.4f, 1.4f, fill);
                c.drawRoundRect(r, 1.4f, 1.4f, tipLine(ink));
                break;
            case HIGHLIGHTER:
                tilt(c);
                r.set(8.6f, 1.5f, 15.4f, 12.5f);
                c.drawRoundRect(r, 1.6f, 1.6f, line);
                p.moveTo(9.6f, 12.5f);
                p.lineTo(14.4f, 12.5f);
                p.lineTo(14.4f, 18.4f);
                p.lineTo(9.6f, 21f);
                p.close();
                c.drawPath(p, fill);
                c.drawPath(p, tipLine(ink));
                break;
            case ERASER:
                tilt(c);
                r.set(8.3f, 2.5f, 15.7f, 21.5f);
                c.drawRoundRect(r, 2.2f, 2.2f, line);
                r.set(8.3f, 14.5f, 15.7f, 21.5f);
                fill.setColor(0xFFF2A7BC);
                c.drawRoundRect(r, 2.2f, 2.2f, fill);
                c.drawRoundRect(r, 2.2f, 2.2f, line);
                break;
            case LASSO:
                line.setPathEffect(new DashPathEffect(new float[]{2.6f, 2.4f}, 0));
                r.set(3.5f, 3.5f, 20.5f, 15.5f);
                c.drawOval(r, line);
                line.setPathEffect(null);
                p.moveTo(7.5f, 14.4f);
                p.cubicTo(6.4f, 16.5f, 8.2f, 18.2f, 6.8f, 21f);
                c.drawPath(p, line);
                fill.setColor(ink);
                c.drawCircle(7.6f, 14.6f, 1.6f, fill);
                break;
            case SHAPES:
                r.set(3f, 3f, 13f, 13f);
                c.drawRoundRect(r, 1.5f, 1.5f, line);
                fill.setColor(accent);
                c.drawCircle(15.5f, 15.5f, 5.5f, fill);
                c.drawCircle(15.5f, 15.5f, 5.5f, line);
                break;
            case TEXT:
                c.drawLine(5f, 5f, 19f, 5f, line);
                c.drawLine(5f, 5f, 5f, 7f, line);
                c.drawLine(19f, 5f, 19f, 7f, line);
                c.drawLine(12f, 5f, 12f, 19.5f, line);
                c.drawLine(9f, 19.5f, 15f, 19.5f, line);
                break;
            case NOTE:
                p.moveTo(4f, 4f);
                p.lineTo(20f, 4f);
                p.lineTo(20f, 14.5f);
                p.lineTo(14.5f, 20f);
                p.lineTo(4f, 20f);
                p.close();
                c.drawPath(p, fill);
                c.drawPath(p, line);
                p.rewind();
                p.moveTo(14.5f, 20f);
                p.lineTo(14.5f, 14.5f);
                p.lineTo(20f, 14.5f);
                c.drawPath(p, line);
                break;
            case IMAGE:
                r.set(3f, 4.5f, 21f, 19.5f);
                c.drawRoundRect(r, 2.5f, 2.5f, line);
                p.moveTo(3.5f, 17f);
                p.lineTo(9f, 11.5f);
                p.lineTo(13f, 15.5f);
                p.lineTo(15.5f, 13f);
                p.lineTo(20.5f, 18f);
                c.drawPath(p, line);
                fill.setColor(ink);
                c.drawCircle(16f, 9f, 1.7f, fill);
                break;
            case UNDO:
            case REDO:
                if (icon == REDO) {
                    c.translate(24, 0);
                    c.scale(-1, 1);
                }
                p.moveTo(8.5f, 4.5f);
                p.lineTo(4f, 9f);
                p.lineTo(8.5f, 13.5f);
                c.drawPath(p, line);
                p.rewind();
                p.moveTo(4.5f, 9f);
                p.lineTo(14.5f, 9f);
                p.cubicTo(17.8f, 9f, 20f, 11.4f, 20f, 14.2f);
                p.cubicTo(20f, 17.2f, 17.6f, 19.5f, 14.5f, 19.5f);
                p.lineTo(10f, 19.5f);
                c.drawPath(p, line);
                break;
            case BACK:
                p.moveTo(15f, 5f);
                p.lineTo(8f, 12f);
                p.lineTo(15f, 19f);
                line.setStrokeWidth(2f);
                c.drawPath(p, line);
                break;
            case MORE:
                fill.setColor(ink);
                c.drawCircle(5.5f, 12f, 1.9f, fill);
                c.drawCircle(12f, 12f, 1.9f, fill);
                c.drawCircle(18.5f, 12f, 1.9f, fill);
                break;
            case TRASH:
                c.drawLine(4f, 6.5f, 20f, 6.5f, line);
                p.moveTo(9f, 6.5f);
                p.lineTo(9.5f, 3.8f);
                p.lineTo(14.5f, 3.8f);
                p.lineTo(15f, 6.5f);
                c.drawPath(p, line);
                p.rewind();
                p.moveTo(6f, 6.5f);
                p.lineTo(7f, 20f);
                p.lineTo(17f, 20f);
                p.lineTo(18f, 6.5f);
                c.drawPath(p, line);
                c.drawLine(10f, 10.5f, 10f, 16.5f, line);
                c.drawLine(14f, 10.5f, 14f, 16.5f, line);
                break;
            case DUPLICATE:
                r.set(8.5f, 8.5f, 20f, 20f);
                c.drawRoundRect(r, 2f, 2f, line);
                p.moveTo(15.5f, 8.5f);
                p.lineTo(15.5f, 5.5f);
                p.quadTo(15.5f, 4f, 14f, 4f);
                p.lineTo(5.5f, 4f);
                p.quadTo(4f, 4f, 4f, 5.5f);
                p.lineTo(4f, 14f);
                p.quadTo(4f, 15.5f, 5.5f, 15.5f);
                p.lineTo(8.5f, 15.5f);
                c.drawPath(p, line);
                break;
            case PLUS:
                line.setStrokeWidth(2f);
                c.drawLine(12f, 5f, 12f, 19f, line);
                c.drawLine(5f, 12f, 19f, 12f, line);
                break;
            case CHECK:
                line.setStrokeWidth(2f);
                p.moveTo(5f, 12.5f);
                p.lineTo(10f, 17.5f);
                p.lineTo(19f, 7f);
                c.drawPath(p, line);
                break;
            case CLOSE:
                line.setStrokeWidth(2f);
                c.drawLine(6f, 6f, 18f, 18f, line);
                c.drawLine(18f, 6f, 6f, 18f, line);
                break;
            case SHARE:
                c.drawLine(12f, 3.5f, 12f, 14.5f, line);
                p.moveTo(7.5f, 8f);
                p.lineTo(12f, 3.5f);
                p.lineTo(16.5f, 8f);
                c.drawPath(p, line);
                p.rewind();
                p.moveTo(5f, 11.5f);
                p.lineTo(5f, 19f);
                p.quadTo(5f, 20.5f, 6.5f, 20.5f);
                p.lineTo(17.5f, 20.5f);
                p.quadTo(19f, 20.5f, 19f, 19f);
                p.lineTo(19f, 11.5f);
                c.drawPath(p, line);
                break;
            case EDIT:
                p.moveTo(4f, 20f);
                p.lineTo(5f, 15.5f);
                p.lineTo(15.5f, 5f);
                p.lineTo(19f, 8.5f);
                p.lineTo(8.5f, 19f);
                p.close();
                c.drawPath(p, line);
                c.drawLine(13f, 7.5f, 16.5f, 11f, line);
                break;
            case FIT:
                p.moveTo(4f, 9f);
                p.lineTo(4f, 4f);
                p.lineTo(9f, 4f);
                p.moveTo(15f, 4f);
                p.lineTo(20f, 4f);
                p.lineTo(20f, 9f);
                p.moveTo(20f, 15f);
                p.lineTo(20f, 20f);
                p.lineTo(15f, 20f);
                p.moveTo(9f, 20f);
                p.lineTo(4f, 20f);
                p.lineTo(4f, 15f);
                c.drawPath(p, line);
                break;
            case PALETTE:
                fill.setColor(accent);
                c.drawCircle(12f, 12f, 8f, fill);
                c.drawCircle(12f, 12f, 8f, line);
                break;
            case S_LINE:
                c.drawLine(5f, 19f, 19f, 5f, line);
                break;
            case S_ARROW:
                c.drawLine(5f, 19f, 18.5f, 5.5f, line);
                p.moveTo(10.5f, 5.5f);
                p.lineTo(18.5f, 5.5f);
                p.lineTo(18.5f, 13.5f);
                c.drawPath(p, line);
                break;
            case S_RECT:
                r.set(4f, 6f, 20f, 18f);
                c.drawRoundRect(r, 1f, 1f, line);
                break;
            case S_ELLIPSE:
                r.set(3.5f, 5.5f, 20.5f, 18.5f);
                c.drawOval(r, line);
                break;
            case S_TRIANGLE:
                p.moveTo(12f, 4.5f);
                p.lineTo(20f, 19f);
                p.lineTo(4f, 19f);
                p.close();
                c.drawPath(p, line);
                break;
            case S_DIAMOND:
                p.moveTo(12f, 3.5f);
                p.lineTo(20.5f, 12f);
                p.lineTo(12f, 20.5f);
                p.lineTo(3.5f, 12f);
                p.close();
                c.drawPath(p, line);
                break;
            case ROTATE:
                // A quarter-circle arrow turning clockwise.
                r.set(5f, 5f, 19f, 19f);
                p.addArc(r, 200f, 250f);
                c.drawPath(p, line);
                p.rewind();
                p.moveTo(16.2f, 2.8f);
                p.lineTo(19.2f, 6.6f);
                p.lineTo(14.6f, 7.8f);
                c.drawPath(p, line);
                break;
            case FLIP:
                c.drawLine(12f, 3f, 12f, 21f, stroke(ink, 1.4f));
                p.moveTo(9.5f, 6f);
                p.lineTo(3.5f, 18f);
                p.lineTo(9.5f, 18f);
                p.close();
                c.drawPath(p, line);
                p.rewind();
                p.moveTo(14.5f, 6f);
                p.lineTo(20.5f, 18f);
                p.lineTo(14.5f, 18f);
                p.close();
                fill.setColor(ink);
                c.drawPath(p, fill);
                break;
            case EYEDROPPER:
                // A pipette with a drop of the picked colour at its tip.
                p.moveTo(14.2f, 6.2f);
                p.lineTo(5.6f, 14.8f);
                p.lineTo(4.6f, 18.4f);
                p.lineTo(5.6f, 19.4f);
                p.lineTo(9.2f, 18.4f);
                p.lineTo(17.8f, 9.8f);
                c.drawPath(p, line);
                r.set(14.5f, 2.6f, 21.4f, 9.5f);
                c.drawOval(r, line);
                c.drawLine(12.4f, 4.6f, 19.4f, 11.6f, line);
                fill.setColor(accent);
                c.drawCircle(4.6f, 20.6f, 1.9f, fill);
                break;
            case CROP:
                p.moveTo(6.5f, 2.5f);
                p.lineTo(6.5f, 17.5f);
                p.lineTo(21.5f, 17.5f);
                p.moveTo(2.5f, 6.5f);
                p.lineTo(17.5f, 6.5f);
                p.lineTo(17.5f, 21.5f);
                c.drawPath(p, line);
                break;
            case WAND:
                c.drawLine(4f, 20f, 15f, 9f, stroke(ink, 2.2f));
                fill.setColor(accent);
                star(c, 17.5f, 6.5f, 3.6f);
                fill.setColor(ink);
                c.drawCircle(9f, 5f, 1.1f, fill);
                c.drawCircle(20f, 14f, 1.1f, fill);
                break;
            case CUTOUT:
                // A figure lifted off a checkerboard.
                fill.setColor(0x55FFFFFF);
                for (int yy = 0; yy < 4; yy++) {
                    for (int xx = 0; xx < 4; xx++) {
                        if ((xx + yy) % 2 == 0) c.drawRect(3 + xx * 4.5f, 3 + yy * 4.5f, 7.5f + xx * 4.5f, 7.5f + yy * 4.5f, fill);
                    }
                }
                fill.setColor(accent);
                c.drawCircle(12f, 9f, 3.4f, fill);
                p.moveTo(5.5f, 21f);
                p.cubicTo(6.5f, 15f, 17.5f, 15f, 18.5f, 21f);
                p.close();
                c.drawPath(p, fill);
                break;
            case FILL:
                r.set(4f, 4f, 20f, 20f);
                fill.setColor(accent);
                c.drawRoundRect(r, 3f, 3f, fill);
                c.drawRoundRect(r, 3f, 3f, line);
                break;
        }
        c.restore();
    }

    private static void star(Canvas c, float cx, float cy, float rad) {
        Path s = new Path();
        for (int i = 0; i < 8; i++) {
            double a = Math.PI / 4 * i - Math.PI / 2;
            float rr = i % 2 == 0 ? rad : rad * 0.38f;
            float x = cx + rr * (float) Math.cos(a), y = cy + rr * (float) Math.sin(a);
            if (i == 0) s.moveTo(x, y);
            else s.lineTo(x, y);
        }
        s.close();
        c.drawPath(s, fill);
    }

    /** Drawing tools lean 45 degrees like a pen in a hand. */
    private static void tilt(Canvas c) {
        c.rotate(45f, 12f, 12f);
        c.translate(0, 0.6f);
    }

    private static final Paint extra = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final Paint tip = new Paint(Paint.ANTI_ALIAS_FLAG);

    /** A thin outline round a coloured tip, so black ink still shows on the dark toolbar. */
    private static Paint tipLine(int ink) {
        tip.setStyle(Paint.Style.STROKE);
        tip.setStrokeJoin(Paint.Join.ROUND);
        tip.setStrokeWidth(1.1f);
        tip.setColor((ink & 0x00FFFFFF) | 0xB3000000);
        return tip;
    }

    private static Paint stroke(int color, float w) {
        extra.setStyle(Paint.Style.STROKE);
        extra.setStrokeCap(Paint.Cap.ROUND);
        extra.setColor(color);
        extra.setStrokeWidth(w);
        return extra;
    }
}
