package com.infinink.app.img;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Random;

public class ImageOpsTest {
    private static final int W = 120, H = 90;
    private static final int RED = 0xFFE5484D, WHITE = 0xFFF8F8F6, BLUE = 0xFF2060E0;

    /** A red disc on an off-white, slightly noisy background, with a blue square inside it. */
    private static int[] picture() {
        Random rnd = new Random(1);
        int[] px = new int[W * H];
        for (int y = 0; y < H; y++) {
            for (int x = 0; x < W; x++) {
                int c = WHITE;
                if (Math.hypot(x - 60, y - 45) < 30) c = RED;
                if (Math.abs(x - 60) < 6 && Math.abs(y - 45) < 6) c = BLUE;
                int n = rnd.nextInt(9) - 4;
                int r = clamp(((c >> 16) & 255) + n), g = clamp(((c >> 8) & 255) + n), b = clamp((c & 255) + n);
                px[y * W + x] = 0xFF000000 | r << 16 | g << 8 | b;
            }
        }
        return px;
    }

    private static int clamp(int v) {
        return Math.max(0, Math.min(255, v));
    }

    private static int a(byte[] m, int x, int y) {
        return m[y * W + x] & 255;
    }

    @Test
    public void autoRemovesTheBackgroundAndKeepsTheSubject() {
        int[] px = picture();
        byte[] m = ImageOps.fullMask(W * H);
        int removed = ImageOps.removeBackground(px, W, H, 0.3f, m);
        assertTrue(removed > W * H / 2);
        assertEquals(0, a(m, 0, 0));
        assertEquals(0, a(m, 110, 80));
        assertEquals(255, a(m, 60, 45)); // blue middle stays
        assertEquals(255, a(m, 60, 25)); // red disc stays
        // The edge of the disc is soft, not jagged.
        boolean partial = false;
        for (int x = 25; x < 35; x++) if (a(m, x, 45) > 0 && a(m, x, 45) < 255) partial = true;
        assertTrue(partial);
    }

    @Test
    public void magicWandTakesOnlyTheTappedArea() {
        int[] px = picture();
        byte[] m = ImageOps.fullMask(W * H);
        ImageOps.magicWand(px, W, H, 60, 45, 0.3f, m);
        assertEquals(0, a(m, 60, 45)); // blue gone
        assertEquals(255, a(m, 60, 25)); // red kept
        assertEquals(255, a(m, 2, 2)); // background kept
    }

    @Test
    public void brushErasesAndRestores() {
        byte[] m = ImageOps.fullMask(W * H);
        int[] box = ImageOps.brush(m, W, H, 50, 50, 10, false);
        assertNotNull(box);
        assertEquals(0, a(m, 50, 50));
        assertEquals(255, a(m, 70, 50));
        ImageOps.brush(m, W, H, 50, 50, 10, true);
        assertEquals(255, a(m, 50, 50));
    }

    @Test
    public void dominantColoursFindTheBigAreas() {
        int[] cols = ImageOps.dominantColors(picture(), W, H, null, 4);
        assertTrue(cols.length >= 2);
        assertTrue("white first", ImageOps.dist(cols[0], WHITE) < 30);
        boolean red = false;
        for (int c : cols) if (ImageOps.dist(c, RED) < 40) red = true;
        assertTrue(red);
    }

    @Test
    public void averagePicksTheColourUnderTheFinger() {
        int c = ImageOps.average(picture(), W, H, 60, 25, 3, null);
        assertTrue(ImageOps.dist(c, RED) < 20);
    }

    @Test
    public void rotateFourTimesIsTheSame() {
        int[] px = picture();
        int[] r = ImageOps.rotate(ImageOps.rotate(ImageOps.rotate(ImageOps.rotate(px, W, H), H, W), W, H), H, W);
        assertArrayEquals(px, r);
        int[] once = ImageOps.rotate(px, W, H);
        // Top-left pixel moves to the top-right of the H-wide result.
        assertEquals(px[0], once[H - 1]);
    }

    @Test
    public void trimHugsTheSubjectAndIgnoresSpecks() {
        int[] px = picture();
        byte[] m = ImageOps.fullMask(W * H);
        ImageOps.removeBackground(px, W, H, 0.3f, m);
        m[1 * W + 1] = (byte) 255; // a leftover speck in the corner
        int[] cut = ImageOps.cutOut(px, W, m, 0, 0, W, H);
        int[] t = ImageOps.trimBounds(cut, W, H);
        assertNotNull(t);
        // The disc spans 30..90 across and 15..75 down.
        assertEquals(31, t[0], 2);
        assertEquals(16, t[1], 2);
        assertEquals(90, t[2], 2);
        assertEquals(75, t[3], 2);
        int[] c = ImageOps.crop(cut, W, t[0], t[1], t[2] - t[0], t[3] - t[1]);
        assertEquals((t[2] - t[0]) * (t[3] - t[1]), c.length);
        // Trimming the trimmed picture again changes nothing.
        int[] again = ImageOps.trimBounds(c, t[2] - t[0], t[3] - t[1]);
        assertArrayEquals(new int[]{0, 0, t[2] - t[0], t[3] - t[1]}, again);
    }

    @Test
    public void cutOutAppliesCropAndMask() {
        int[] px = picture();
        byte[] m = ImageOps.fullMask(W * H);
        m[10 * W + 10] = 0;
        int[] out = ImageOps.cutOut(px, W, m, 10, 10, 20, 15);
        assertEquals(300, out.length);
        assertEquals(0, out[0] >>> 24);
        assertEquals(255, out[1] >>> 24);
        assertTrue(ImageOps.anyTransparent(out));
    }
}
