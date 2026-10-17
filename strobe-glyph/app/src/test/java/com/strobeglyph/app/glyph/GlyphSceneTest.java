package com.strobeglyph.app.glyph;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Random;
import org.junit.Test;

public class GlyphSceneTest {
    private static final int LEVEL = 3000;

    private static int[] frame(GlyphScene s, GlyphEffect e, long step) {
        int[] out = new int[s.size()];
        s.render(e, step, LEVEL, new Random(1), out);
        return out;
    }

    private static int lit(int[] f) {
        int n = 0;
        for (int v : f) {
            if (v > 0) {
                n++;
            }
        }
        return n;
    }

    private static int peak(int[] f) {
        int m = 0;
        for (int v : f) {
            m = Math.max(m, v);
        }
        return m;
    }

    @Test
    public void everyEffectOnEveryModelStaysInRangeAndNeverCrashes() {
        for (GlyphModel model : GlyphModel.values()) {
            GlyphScene s = model.scene();
            int level = s.maxLevel() / 2;
            for (GlyphEffect e : GlyphEffect.values()) {
                for (long step = 0; step < 500; step += 7) {
                    int[] out = new int[s.size()];
                    s.render(e, step, level, new Random(step), out);
                    for (int v : out) {
                        assertTrue(model + " " + e + " step " + step + " value " + v, v >= 0 && v <= level);
                    }
                }
            }
        }
    }

    @Test
    public void syncLightsEverything() {
        GlyphScene s = GlyphScene.strip(15);
        int[] f = frame(s, GlyphEffect.SYNC, 0);
        assertEquals(15, lit(f));
        assertEquals(LEVEL, peak(f));
    }

    @Test
    public void chaseHeadMovesOneLedPerStepAndWraps() {
        GlyphScene s = GlyphScene.strip(15);
        for (int step = 0; step < 40; step++) {
            int[] f = frame(s, GlyphEffect.CHASE, step);
            assertEquals("head at " + step, LEVEL, f[step % 15]);
            assertEquals(peak(f), f[step % 15]);
        }
        // the tail trails behind and fades
        int[] f = frame(s, GlyphEffect.CHASE, 7);
        assertTrue(f[6] < f[7] && f[6] > 0);
        assertTrue(f[5] < f[6]);
    }

    @Test
    public void scannerBouncesOffBothEnds() {
        GlyphScene s = GlyphScene.strip(15);
        int period = 2 * (15 - 1);
        assertEquals(LEVEL, frame(s, GlyphEffect.BOUNCE, 0)[0]);
        assertEquals(LEVEL, frame(s, GlyphEffect.BOUNCE, 14)[14]);
        assertEquals(LEVEL, frame(s, GlyphEffect.BOUNCE, 20)[8]); // on the way back
        assertEquals(LEVEL, frame(s, GlyphEffect.BOUNCE, period)[0]);
    }

    @Test
    public void fillGrowsThenDrains() {
        GlyphScene s = GlyphScene.strip(10);
        assertEquals(0, lit(frame(s, GlyphEffect.FILL, 0)));
        assertEquals(4, lit(frame(s, GlyphEffect.FILL, 4)));
        assertEquals(10, lit(frame(s, GlyphEffect.FILL, 10)));
        assertEquals(6, lit(frame(s, GlyphEffect.FILL, 14)));
        assertEquals(0, lit(frame(s, GlyphEffect.FILL, 20)));
    }

    @Test
    public void alternateSwapsEvenAndOddLeds() {
        GlyphScene s = GlyphScene.strip(8);
        int[] a = frame(s, GlyphEffect.ALTERNATE, 0);
        int[] b = frame(s, GlyphEffect.ALTERNATE, 1);
        for (int i = 0; i < 8; i++) {
            assertEquals(i % 2 == 0 ? LEVEL : 0, a[i]);
            assertEquals(i % 2 == 0 ? 0 : LEVEL, b[i]);
        }
    }

    @Test
    public void sparkleLightsAboutAThirdAtRandom() {
        GlyphScene s = GlyphScene.strip(36);
        int total = 0;
        for (int step = 0; step < 200; step++) {
            total += lit(frame(s, GlyphEffect.SPARKLE, step));
        }
        double average = total / 200.0;
        assertTrue("average lit " + average, average > 6 && average < 16);
    }

    @Test
    public void breatheFadesInAndOutTogether() {
        GlyphScene s = GlyphScene.strip(15);
        int[] dark = frame(s, GlyphEffect.BREATHE, 0);
        int[] bright = frame(s, GlyphEffect.BREATHE, 20); // halfway through the 40-step breath
        assertEquals(0, peak(dark));
        assertEquals(LEVEL, peak(bright));
        for (int v : bright) {
            assertEquals(bright[0], v); // every LED the same
        }
    }

    @Test
    public void matrixChaseOrbitsTheRingAndRippleExpands() {
        GlyphScene s = GlyphScene.matrix(25);
        int[] f0 = frame(s, GlyphEffect.CHASE, 0);
        int[] f12 = frame(s, GlyphEffect.CHASE, 12); // a quarter turn later
        assertTrue(lit(f0) > 5);
        assertTrue(peak(f0) > LEVEL / 2);
        assertTrue("head moved", !java.util.Arrays.equals(f0, f12));
        // the centre stays dark while a comet orbits the rim
        assertEquals(0, f0[12 * 25 + 12]);

        // ripple: early on the lit pixels hug the centre, later they are further out
        double early = meanRadius(frame(s, GlyphEffect.BREATHE, 5), 25);
        double late = meanRadius(frame(s, GlyphEffect.BREATHE, 25), 25);
        assertTrue(early + " < " + late, early < late);
    }

    @Test
    public void matrixFillRisesFromTheBottom() {
        GlyphScene s = GlyphScene.matrix(13);
        int[] f = frame(s, GlyphEffect.FILL, 3);
        for (int x = 0; x < 13; x++) {
            assertEquals(LEVEL, f[12 * 13 + x]); // bottom row
            assertEquals(LEVEL, f[10 * 13 + x]); // third row up
            assertEquals(0, f[9 * 13 + x]);
            assertEquals(0, f[0 * 13 + x]);
        }
    }

    @Test
    public void stepTimingScalesWithSpeedAndHasAFloor() {
        GlyphScene s = GlyphScene.strip(15);
        long slow = s.stepNanos(GlyphEffect.CHASE, 2f);
        long fast = s.stepNanos(GlyphEffect.CHASE, 20f);
        assertTrue(slow > fast);
        assertEquals(10.0, slow / (double) fast, 0.5);
        assertTrue(s.stepNanos(GlyphEffect.CHASE, 60f) >= 8_000_000L);
        assertTrue(s.stepNanos(GlyphEffect.BREATHE, 60f) >= 16_000_000L);
        assertEquals(125_000_000L, s.stepNanos(GlyphEffect.ALTERNATE, 4f)); // half a period
    }

    private static double meanRadius(int[] f, int m) {
        double sum = 0;
        double weight = 0;
        double c = (m - 1) / 2.0;
        for (int y = 0; y < m; y++) {
            for (int x = 0; x < m; x++) {
                int v = f[y * m + x];
                if (v > 0) {
                    sum += v * Math.hypot(x - c, y - c);
                    weight += v;
                }
            }
        }
        return weight == 0 ? 0 : sum / weight;
    }
}
