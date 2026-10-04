package com.strobeglyph.app.engine;

/** Tap a rhythm, get a flash rate. Averages the last few taps; a long pause starts over. */
public final class TapTempo {
    private static final long RESET_NANOS = 2_000_000_000L;
    private static final int KEEP = 5;
    private final long[] taps = new long[KEEP];
    private int count;

    /** Registers a tap. Returns the tapped rate in Hz, or 0 if this was the first tap. */
    public float tap(long nowNanos) {
        if (count > 0 && nowNanos - taps[count - 1] > RESET_NANOS) {
            count = 0;
        }
        if (count == KEEP) {
            System.arraycopy(taps, 1, taps, 0, KEEP - 1);
            count = KEEP - 1;
        }
        taps[count++] = nowNanos;
        if (count < 2) {
            return 0f;
        }
        double avgInterval = (taps[count - 1] - taps[0]) / (double) (count - 1);
        return Settings.clampHz((float) (1_000_000_000d / avgInterval));
    }
}
