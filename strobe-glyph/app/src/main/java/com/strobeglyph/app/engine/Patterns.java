package com.strobeglyph.app.engine;

import java.util.Random;

/** The pattern implementations behind {@link PatternType}. */
final class Patterns {
    private Patterns() {
    }

    static long periodNanos(float hz) {
        return (long) (1_000_000_000d / Settings.clampHz(hz));
    }

    /** Plain square wave. */
    static final class Strobe implements Pattern {
        private boolean on;

        @Override
        public Step next(Settings s) {
            on = !on; // starts lit, so a flash is the first thing you see
            long period = periodNanos(s.hz);
            long lit = (long) (period * Settings.clampDuty(s.duty));
            return new Step(on, on ? lit : period - lit);
        }
    }

    /**
     * Toggles with no waiting at all. The torch call itself paces the loop, so the rate is
     * whatever the hardware can take. With no torch to pace it, falls back to 250 Hz so it
     * does not spin a CPU core.
     */
    static final class Turbo implements Pattern {
        private boolean on;

        @Override
        public Step next(Settings s) {
            on = !on;
            return new Step(on, s.torch ? 0L : 4_000_000L);
        }
    }

    /** A run of flashes, then a gap about three flashes long. */
    static final class Burst implements Pattern {
        static final int FLASHES = 5;
        static final int PAUSE_PERIODS = 3;
        private int i;

        @Override
        public Step next(Settings s) {
            long period = periodNanos(s.hz);
            long lit = (long) (period * Settings.clampDuty(s.duty));
            boolean on = (i & 1) == 0;
            long nanos = on ? lit : period - lit;
            if (i == 2 * FLASHES - 1) {
                nanos += PAUSE_PERIODS * period;
            }
            i = (i + 1) % (2 * FLASHES);
            return new Step(on, nanos);
        }
    }

    /** Lub-dub. {@code hz} is beats per second. */
    static final class Heartbeat implements Pattern {
        private static final float[] SHAPE = {0.12f, 0.10f, 0.12f, 0.66f};
        private int i;

        @Override
        public Step next(Settings s) {
            long period = periodNanos(s.hz);
            Step step = new Step((i & 1) == 0, (long) (period * SHAPE[i]));
            i = (i + 1) % SHAPE.length;
            return step;
        }
    }

    /** Morse code. One dot lasts {@code 0.5 / hz} seconds, so 4 Hz is a comfortable 125 ms. */
    static final class MorsePattern implements Pattern {
        private final boolean fixedSos;
        private String encodedFor;
        private int[] runs = new int[0];
        private int i;

        MorsePattern(boolean fixedSos) {
            this.fixedSos = fixedSos;
        }

        @Override
        public Step next(Settings s) {
            String text = fixedSos ? "SOS" : s.morseText;
            if (!text.equals(encodedFor)) {
                runs = Morse.encode(text);
                encodedFor = text;
                i = 0;
            }
            if (i >= runs.length) {
                i = 0;
            }
            int run = runs[i++];
            long unit = periodNanos(s.hz) / 2;
            return new Step(run > 0, Math.abs(run) * unit);
        }
    }

    /** Flash rate that glides between {@code max/8} and {@code max} in a log-smooth loop. */
    static final class Siren implements Pattern {
        static final long SWEEP_NANOS = 6_000_000_000L;
        private long elapsed;
        private boolean on;

        static float rateAt(float maxHz, long elapsedNanos) {
            float hi = Settings.clampHz(maxHz);
            float lo = Math.max(Settings.MIN_HZ, hi / 8f);
            float phase = (elapsedNanos % SWEEP_NANOS) / (float) SWEEP_NANOS;
            float tri = phase < 0.5f ? phase * 2f : (1f - phase) * 2f;
            return (float) (lo * Math.pow(hi / lo, tri));
        }

        @Override
        public Step next(Settings s) {
            on = !on;
            long period = periodNanos(rateAt(s.hz, elapsed));
            long lit = (long) (period * Settings.clampDuty(s.duty));
            long nanos = on ? lit : period - lit;
            elapsed += nanos;
            return new Step(on, nanos);
        }
    }

    /** Random timing around the chosen speed, with the odd long dark pause. */
    static final class Chaos implements Pattern {
        private final Random rng;
        private boolean on;

        Chaos(Random rng) {
            this.rng = rng;
        }

        @Override
        public Step next(Settings s) {
            on = !on;
            long period = periodNanos(s.hz);
            float duty = Settings.clampDuty(s.duty);
            float jitter = 0.3f + 1.4f * rng.nextFloat();
            long nanos = (long) ((on ? period * duty : period * (1f - duty)) * jitter);
            if (!on && rng.nextFloat() < 0.1f) {
                nanos += (long) (period * (2f + 4f * rng.nextFloat()));
            }
            return new Step(on, nanos);
        }
    }

    /**
     * Flashes when {@link BeatSource} reports a fresh beat. {@code hz} caps how often it can
     * fire; the flash length comes from the duty setting. While waiting it polls every 4 ms.
     */
    static final class Beat implements Pattern {
        static final long POLL_NANOS = 4_000_000L;
        static final long FRESH_NANOS = 80_000_000L;
        private final BeatSource source;
        private boolean flashing;
        private long handled;
        private long gapAfterFlash;

        Beat(BeatSource source) {
            this.source = source;
        }

        @Override
        public Step next(Settings s) {
            if (flashing) {
                flashing = false;
                return new Step(false, Math.max(POLL_NANOS, gapAfterFlash));
            }
            long beat = source == null ? 0L : source.lastBeatNanos();
            if (beat != handled) {
                handled = beat;
                if (System.nanoTime() - beat < FRESH_NANOS) {
                    long period = periodNanos(s.hz);
                    long lit = Math.max(15_000_000L, (long) (period * Settings.clampDuty(s.duty)));
                    flashing = true;
                    gapAfterFlash = period - lit;
                    return new Step(true, lit);
                }
            }
            return new Step(false, POLL_NANOS);
        }
    }
}
