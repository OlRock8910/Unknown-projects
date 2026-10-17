package com.strobeglyph.app.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Random;
import org.junit.Test;

public class PatternsTest {
    private static final long MS = 1_000_000L;

    private static Settings at(float hz, float duty) {
        Settings s = new Settings();
        s.hz = hz;
        s.duty = duty;
        return s;
    }

    @Test
    public void strobeStartsLitAndHonoursSpeedAndFlashLength() {
        Settings s = at(10f, 0.3f); // 100 ms period
        Pattern p = new Patterns.Strobe();
        Step on = p.next(s);
        Step off = p.next(s);
        assertTrue(on.on);
        assertFalse(off.on);
        assertEquals(30 * MS, on.nanos, MS / 100);
        assertEquals(70 * MS, off.nanos, MS / 100);
        assertEquals(100 * MS, on.nanos + off.nanos, MS / 100);
    }

    @Test
    public void strobePicksUpSpeedChangesOnTheNextFlash() {
        Settings s = at(10f, 0.5f);
        Pattern p = new Patterns.Strobe();
        p.next(s);
        p.next(s);
        s.hz = 20f;
        assertEquals(25 * MS, p.next(s).nanos, MS / 100);
    }

    @Test
    public void strobeNeverLeavesTheSliderRange() {
        Settings s = at(10_000f, 5f); // nonsense in
        Step st = new Patterns.Strobe().next(s);
        assertTrue(st.nanos > 0);
        assertTrue(st.nanos < 1_000 * MS);
    }

    @Test
    public void turboHasNoDelayWhenTheTorchPacesIt() {
        Settings s = new Settings();
        s.torch = true;
        Pattern p = new Patterns.Turbo();
        assertTrue(p.next(s).on);
        Step off = p.next(s);
        assertFalse(off.on);
        assertEquals(0L, off.nanos);
        s.torch = false;
        assertTrue(p.next(s).nanos > 0); // never spins a core with nothing to wait on
    }

    @Test
    public void burstFiresFiveFlashesThenPausesLongerThanOnePeriod() {
        Settings s = at(10f, 0.5f); // 100 ms period
        Pattern p = new Patterns.Burst();
        int flashes = 0;
        long longestGap = 0;
        for (int i = 0; i < 10; i++) {
            Step st = p.next(s);
            if (st.on) {
                flashes++;
            } else {
                longestGap = Math.max(longestGap, st.nanos);
            }
        }
        assertEquals(5, flashes);
        assertTrue("pause should be long", longestGap > 300 * MS);
        assertTrue("next burst starts lit", p.next(s).on);
    }

    @Test
    public void heartbeatIsLubDub() {
        Settings s = at(1f, 0.5f); // 1 s per beat
        Pattern p = new Patterns.Heartbeat();
        Step lub = p.next(s);
        Step gap = p.next(s);
        Step dub = p.next(s);
        Step rest = p.next(s);
        assertTrue(lub.on);
        assertFalse(gap.on);
        assertTrue(dub.on);
        assertFalse(rest.on);
        assertEquals(1000 * MS, lub.nanos + gap.nanos + dub.nanos + rest.nanos, 2 * MS);
        assertTrue(rest.nanos > 3 * lub.nanos);
    }

    @Test
    public void sosSpellsThreeShortThreeLongThreeShort() {
        Settings s = at(4f, 0.5f); // unit = 125 ms
        Pattern p = new Patterns.MorsePattern(true);
        StringBuilder lit = new StringBuilder();
        for (int i = 0; i < 18; i++) { // 9 flashes plus the gaps between them
            Step st = p.next(s);
            if (st.on) {
                lit.append(st.nanos < 200 * MS ? '.' : '-');
            }
        }
        assertEquals("...---...", lit.toString());
    }

    @Test
    public void morseFollowsTheTextAndRestartsWhenItChanges() {
        Settings s = at(4f, 0.5f);
        s.morseText = "E"; // one dot
        Pattern p = new Patterns.MorsePattern(false);
        Step dot = p.next(s);
        assertTrue(dot.on);
        assertEquals(125 * MS, dot.nanos, MS / 10);
        s.morseText = "T"; // one dash
        Step dash = p.next(s);
        assertTrue(dash.on);
        assertEquals(375 * MS, dash.nanos, MS / 10);
    }

    @Test
    public void sirenSweepsBetweenAnEighthOfTheSpeedAndTheFullSpeed() {
        float max = 24f;
        assertEquals(3f, Patterns.Siren.rateAt(max, 0), 0.01f);
        assertEquals(24f, Patterns.Siren.rateAt(max, Patterns.Siren.SWEEP_NANOS / 2), 0.01f);
        assertEquals(3f, Patterns.Siren.rateAt(max, Patterns.Siren.SWEEP_NANOS), 0.05f);
        float quarter = Patterns.Siren.rateAt(max, Patterns.Siren.SWEEP_NANOS / 4);
        assertTrue(quarter > 3f && quarter < 24f);
        assertEquals(Math.sqrt(3f * 24f), quarter, 0.05f); // log-smooth: geometric midpoint
    }

    @Test
    public void chaosStaysWithinSaneBoundsAndAlternates() {
        Settings s = at(10f, 0.5f);
        Pattern p = new Patterns.Chaos(new Random(7));
        boolean expectOn = true;
        for (int i = 0; i < 500; i++) {
            Step st = p.next(s);
            assertEquals(expectOn, st.on);
            assertTrue(st.nanos > 0);
            assertTrue(st.nanos < 1_000 * MS);
            expectOn = !expectOn;
        }
    }

    @Test
    public void beatFlashesOnAFreshBeatAndIgnoresAStaleOne() {
        final long[] beat = {0L};
        BeatSource src = new BeatSource() {
            @Override
            public long lastBeatNanos() {
                return beat[0];
            }
        };
        Settings s = at(8f, 0.4f);
        Patterns.Beat p = new Patterns.Beat(src);

        Step idle = p.next(s);
        assertFalse(idle.on);
        assertEquals(Patterns.Beat.POLL_NANOS, idle.nanos);

        beat[0] = System.nanoTime();
        Step flash = p.next(s);
        assertTrue(flash.on);
        assertFalse("then dark again", p.next(s).on);

        beat[0] = System.nanoTime() - 500 * MS; // happened half a second ago: too late to be worth a flash
        assertFalse(p.next(s).on);
    }

    @Test
    public void everyPatternTypeBuildsAndRuns() {
        Settings s = new Settings();
        for (PatternType type : PatternType.values()) {
            Pattern p = type.create(null);
            for (int i = 0; i < 40; i++) {
                assertTrue(type + " produced a negative step", p.next(s).nanos >= 0);
            }
        }
    }
}
