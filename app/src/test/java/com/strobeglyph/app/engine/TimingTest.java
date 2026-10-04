package com.strobeglyph.app.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

/** Real-clock tests, so the tolerances are generous enough for a busy CI machine. */
public class TimingTest {
    @Test
    public void trackRunnerKeepsTimeWithoutDrifting() throws Exception {
        final AtomicInteger steps = new AtomicInteger();
        TrackRunner runner = new TrackRunner("t", new TrackRunner.Stepper() {
            @Override
            public long step() {
                steps.incrementAndGet();
                return 20_000_000L; // 50 Hz
            }
        }, null, null);
        runner.start();
        Thread.sleep(1000);
        runner.stop();
        int n = steps.get();
        assertTrue("expected about 50 steps, got " + n, n >= 40 && n <= 56);
    }

    @Test
    public void stopReallyStopsTheThread() throws Exception {
        final AtomicInteger steps = new AtomicInteger();
        TrackRunner runner = new TrackRunner("t", new TrackRunner.Stepper() {
            @Override
            public long step() {
                steps.incrementAndGet();
                return 1_000_000L;
            }
        }, null, null);
        runner.start();
        Thread.sleep(100);
        runner.stop();
        int atStop = steps.get();
        Thread.sleep(100);
        assertEquals(atStop, steps.get());
    }

    @Test
    public void aSlowStepResynchronisesInsteadOfBursting() throws Exception {
        final AtomicInteger steps = new AtomicInteger();
        TrackRunner runner = new TrackRunner("t", new TrackRunner.Stepper() {
            @Override
            public long step() {
                int n = steps.incrementAndGet();
                if (n == 2) {
                    sleepQuietly(300); // the hardware stalls for 300 ms
                }
                return 10_000_000L; // 100 Hz
            }
        }, null, null);
        runner.start();
        Thread.sleep(600);
        runner.stop();
        // Without resync the loop would fire ~30 catch-up steps back to back and finish with
        // ~60+; with it, the stalled time is simply lost: roughly (600 - 300) / 10 + a couple.
        int n = steps.get();
        assertTrue("got " + n, n >= 20 && n <= 45);
    }

    @Test
    public void errorsStopTheRunnerAndAreReported() throws Exception {
        final AtomicInteger errors = new AtomicInteger();
        final AtomicInteger steps = new AtomicInteger();
        TrackRunner runner = new TrackRunner("t", new TrackRunner.Stepper() {
            @Override
            public long step() {
                steps.incrementAndGet();
                throw new IllegalStateException("boom");
            }
        }, null, new TrackRunner.ErrorHandler() {
            @Override
            public void onError(Throwable t) {
                errors.incrementAndGet();
            }
        });
        runner.start();
        Thread.sleep(100);
        runner.stop();
        assertEquals(1, steps.get());
        assertEquals(1, errors.get());
    }

    @Test
    public void rateMeterCountsTheLastSecondOnly() {
        RateMeter m = new RateMeter();
        long t = 5_000_000_000L;
        for (int i = 0; i < 30; i++) {
            m.edge(t + i * 33_000_000L); // 30 flashes over ~1 s
        }
        assertEquals(30f, m.hz(t + 990_000_000L), 0.5f);
        assertEquals(0f, m.hz(t + 5_000_000_000L), 0.5f); // all long past
        m.reset();
        assertEquals(0f, m.hz(t + 990_000_000L), 0.01f);
    }

    @Test
    public void tapTempoAveragesAndResets() {
        TapTempo tap = new TapTempo();
        long t = 10_000_000_000L;
        assertEquals(0f, tap.tap(t), 0f);
        assertEquals(2f, tap.tap(t + 500_000_000L), 0.01f);
        assertEquals(2f, tap.tap(t + 1_000_000_000L), 0.01f);
        // a long pause starts a fresh tempo
        assertEquals(0f, tap.tap(t + 10_000_000_000L), 0f);
        assertEquals(4f, tap.tap(t + 10_250_000_000L), 0.01f);
        assertFalse(tap.tap(t + 10_500_000_000L) > 4.5f);
    }

    private static void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
