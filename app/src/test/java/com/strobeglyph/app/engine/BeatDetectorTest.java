package com.strobeglyph.app.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Random;
import org.junit.Test;

public class BeatDetectorTest {
    private static final int RATE = 44100;
    private static final int BLOCK = 1024;

    /** Feeds {@code seconds} of a kick-drum-like loop and returns how many beats were heard. */
    private static int hear(double seconds, double bpm, double amplitude, double noise) {
        BeatDetector d = new BeatDetector();
        Random rng = new Random(3);
        short[] block = new short[BLOCK];
        double beatPeriod = 60.0 / bpm;
        int blocks = (int) (seconds * RATE / BLOCK);
        long last = 0;
        int heard = 0;
        for (int b = 0; b < blocks; b++) {
            for (int i = 0; i < BLOCK; i++) {
                double t = (b * BLOCK + i) / (double) RATE;
                double sinceKick = t % beatPeriod;
                double env = sinceKick < 0.12 ? Math.exp(-sinceKick * 30) : 0;
                double v = amplitude * env * Math.sin(2 * Math.PI * 60 * t) + noise * (rng.nextDouble() - 0.5);
                block[i] = (short) v;
            }
            long now = 1_000_000_000L + (long) ((b + 1) * BLOCK * 1e9 / RATE);
            d.process(block, BLOCK, now);
            if (d.lastBeatNanos() != last) {
                last = d.lastBeatNanos();
                heard++;
            }
        }
        return heard;
    }

    @Test
    public void findsTheKicksInASteadyBeat() {
        int kicks = (int) (8 * 120 / 60.0); // 8 s at 120 bpm
        int heard = hear(8, 120, 14000, 200);
        assertTrue("heard " + heard + " of " + kicks, heard >= kicks * 0.8 && heard <= kicks + 1);
    }

    @Test
    public void silenceAndHissAreNotBeats() {
        assertEquals(0, hear(5, 120, 0, 300));
    }

    @Test
    public void aSteadyToneIsNotABeatEither() {
        BeatDetector d = new BeatDetector();
        short[] block = new short[BLOCK];
        int heardAfterWarmUp = 0;
        long last = 0;
        for (int b = 0; b < 400; b++) {
            for (int i = 0; i < BLOCK; i++) {
                block[i] = (short) (9000 * Math.sin(2 * Math.PI * 80 * (b * BLOCK + i) / (double) RATE));
            }
            d.process(block, BLOCK, 1_000_000_000L + b * 23_000_000L);
            if (b > 20 && d.lastBeatNanos() != last) {
                heardAfterWarmUp++;
            }
            last = d.lastBeatNanos();
        }
        assertEquals(0, heardAfterWarmUp);
    }
}
