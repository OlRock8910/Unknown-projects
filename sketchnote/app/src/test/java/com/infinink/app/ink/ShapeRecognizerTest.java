package com.infinink.app.ink;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Random;

public class ShapeRecognizerTest {
    private final Random rnd = new Random(7);

    /** A hand-drawn-ish path through the corners, with jitter, as (x, y, p) triples. */
    private float[] wobbly(float[] corners, boolean close, float jitter, int perSide) {
        FloatList out = new FloatList();
        int n = corners.length / 2;
        int sides = close ? n : n - 1;
        for (int i = 0; i < sides; i++) {
            int j = (i + 1) % n;
            for (int s = 0; s < perSide; s++) {
                float t = (float) s / perSide;
                float x = corners[2 * i] + (corners[2 * j] - corners[2 * i]) * t;
                float y = corners[2 * i + 1] + (corners[2 * j + 1] - corners[2 * i + 1]) * t;
                out.add(x + (rnd.nextFloat() - 0.5f) * jitter, y + (rnd.nextFloat() - 0.5f) * jitter, 0.5f);
            }
        }
        int last = close ? 0 : n - 1;
        out.add(corners[2 * last] + 3, corners[2 * last + 1] + 2, 0.5f); // a little overshoot / gap
        return out.toArray();
    }

    private ShapeRecognizer.Shape recognize(float[] pts) {
        return ShapeRecognizer.recognize(pts, pts.length / 3);
    }

    @Test
    public void wobblyLineBecomesStraight() {
        ShapeRecognizer.Shape s = recognize(wobbly(new float[]{0, 0, 300, 120}, false, 6, 40));
        assertNotNull(s);
        assertEquals(ShapeRecognizer.LINE, s.kind);
        assertEquals(2, s.pointCount());
    }

    @Test
    public void nearlyHorizontalLineSnapsLevel() {
        ShapeRecognizer.Shape s = recognize(wobbly(new float[]{0, 100, 400, 112}, false, 4, 40));
        assertNotNull(s);
        assertEquals(ShapeRecognizer.LINE, s.kind);
        assertEquals(s.xy[1], s.xy[3], 0.01f);
    }

    @Test
    public void rectangle() {
        ShapeRecognizer.Shape s = recognize(wobbly(new float[]{0, 0, 300, 0, 300, 200, 0, 200}, true, 8, 30));
        assertNotNull(s);
        assertEquals(ShapeRecognizer.RECTANGLE, s.kind);
        assertTrue(s.closed);
        assertEquals(4, s.pointCount());
    }

    @Test
    public void triangle() {
        ShapeRecognizer.Shape s = recognize(wobbly(new float[]{150, 0, 300, 260, 0, 260}, true, 8, 30));
        assertNotNull(s);
        assertEquals(ShapeRecognizer.TRIANGLE, s.kind);
        assertEquals(3, s.pointCount());
    }

    @Test
    public void circle() {
        FloatList pts = new FloatList();
        for (int i = 0; i <= 80; i++) {
            double th = 2 * Math.PI * i / 76; // goes a little past the start, like a real hand
            float r = 150 + (rnd.nextFloat() - 0.5f) * 10;
            pts.add(200 + r * (float) Math.cos(th), 200 + r * (float) Math.sin(th), 0.5f);
        }
        ShapeRecognizer.Shape s = recognize(pts.toArray());
        assertNotNull(s);
        assertEquals(ShapeRecognizer.ELLIPSE, s.kind);
        // Made perfectly round.
        float w = 0, h = 0;
        for (int i = 0; i < s.pointCount(); i++) {
            w = Math.max(w, s.xy[2 * i] - 200);
            h = Math.max(h, s.xy[2 * i + 1] - 200);
        }
        assertEquals(w, h, 0.5f);
    }

    @Test
    public void scribbleIsNotAShape() {
        FloatList pts = new FloatList();
        for (int i = 0; i < 200; i++) pts.add(rnd.nextFloat() * 300, rnd.nextFloat() * 300, 0.5f);
        assertNull(recognize(pts.toArray()));
    }

    @Test
    public void handwritingIsNotAShape() {
        // A cursive "e"-like loop with a tail.
        FloatList pts = new FloatList();
        for (int i = 0; i < 120; i++) {
            double t = i / 20.0;
            pts.add((float) (t * 30 + 40 * Math.cos(t * 2)), (float) (40 * Math.sin(t * 2)), 0.5f);
        }
        assertNull(recognize(pts.toArray()));
    }

    @Test
    public void lShapeBecomesTwoSegments() {
        ShapeRecognizer.Shape s = recognize(wobbly(new float[]{0, 0, 0, 300, 220, 300}, false, 4, 40));
        assertNotNull(s);
        assertEquals(ShapeRecognizer.POLYLINE, s.kind);
        assertEquals(3, s.pointCount());
    }
}
