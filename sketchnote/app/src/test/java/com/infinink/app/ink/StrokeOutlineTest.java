package com.infinink.app.ink;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.infinink.app.model.Brush;

import org.junit.Test;

public class StrokeOutlineTest {

    private static float[] line(int n, float pressure) {
        float[] p = new float[3 * n];
        for (int i = 0; i < n; i++) {
            p[3 * i] = i * 4;
            p[3 * i + 1] = 0;
            p[3 * i + 2] = pressure;
        }
        return p;
    }

    private static float maxHalfWidth(StrokeOutline.Outline o, float fromX, float toX) {
        float best = 0;
        float[] a = o.poly.raw();
        for (int i = 0; i < o.poly.size(); i += 2) {
            if (a[i] >= fromX && a[i] <= toX) best = Math.max(best, Math.abs(a[i + 1]));
        }
        return best;
    }

    @Test
    public void markerHasEvenWidth() {
        StrokeOutline.Outline o = new StrokeOutline.Outline();
        StrokeOutline.build(line(50, 0.5f), 50, StrokeOutline.forBrush(Brush.MARKER, 10, false), o);
        assertFalse(o.isEmpty());
        assertEquals(5f, maxHalfWidth(o, 20, 170), 0.01f);
    }

    @Test
    public void morePressureIsWider() {
        StrokeOutline.Params prm = StrokeOutline.forBrush(Brush.PEN, 10, true);
        StrokeOutline.Outline light = new StrokeOutline.Outline(), hard = new StrokeOutline.Outline();
        StrokeOutline.build(line(50, 0.2f), 50, prm, light);
        StrokeOutline.build(line(50, 0.9f), 50, prm, hard);
        assertTrue(maxHalfWidth(hard, 40, 150) > maxHalfWidth(light, 40, 150) * 1.5f);
    }

    @Test
    public void brushTapersToAPoint() {
        StrokeOutline.Outline o = new StrokeOutline.Outline();
        StrokeOutline.build(line(80, 0.5f), 80, StrokeOutline.forBrush(Brush.BRUSH, 12, false), o);
        float middle = maxHalfWidth(o, 140, 180);
        float end = maxHalfWidth(o, 314, 320);
        assertTrue("end " + end + " vs middle " + middle, end < middle * 0.35f);
    }

    @Test
    public void singleTapIsADot() {
        StrokeOutline.Outline o = new StrokeOutline.Outline();
        StrokeOutline.build(new float[]{5, 5, 0.5f}, 1, StrokeOutline.forBrush(Brush.PEN, 8, false), o);
        assertEquals(32, o.poly.size()); // 16 points around
    }

    @Test
    public void sharpCornerGetsACircle() {
        float[] p = new float[3 * 41];
        for (int i = 0; i <= 40; i++) {
            p[3 * i] = i <= 20 ? i * 5 : 100 - (i - 20) * 5;
            p[3 * i + 1] = i <= 20 ? 0 : (i - 20) * 2;
            p[3 * i + 2] = 0.5f;
        }
        StrokeOutline.Params prm = StrokeOutline.forBrush(Brush.PEN, 6, true);
        prm.streamline = 0;
        StrokeOutline.Outline o = new StrokeOutline.Outline();
        StrokeOutline.build(p, 41, prm, o);
        assertTrue(o.circles.size() >= 3);
    }

    @Test
    public void calligraphyIsThinAlongTheNib() {
        StrokeOutline.Params prm = StrokeOutline.forBrush(Brush.CALLIGRAPHY, 20, false);
        prm.nibAngle = 0; // nib lies horizontally
        StrokeOutline.Outline across = new StrokeOutline.Outline(), along = new StrokeOutline.Outline();
        float[] vertical = new float[3 * 30];
        for (int i = 0; i < 30; i++) {
            vertical[3 * i + 1] = i * 4;
            vertical[3 * i + 2] = 0.5f;
        }
        StrokeOutline.build(vertical, 30, prm, across);
        StrokeOutline.build(line(30, 0.5f), 30, prm, along);
        assertTrue(across.quads.size() > 0);
        // Moving vertically sweeps the horizontal nib: wide. Moving horizontally: a hairline.
        float wideX = 0, thinY = 0;
        for (int i = 0; i < across.quads.size(); i += 2) wideX = Math.max(wideX, Math.abs(across.quads.get(i)));
        for (int i = 1; i < along.quads.size(); i += 2) thinY = Math.max(thinY, Math.abs(along.quads.get(i)));
        assertTrue(wideX > 8);
        assertTrue(thinY < 2);
    }
}
