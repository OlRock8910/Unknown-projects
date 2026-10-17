package com.strobeglyph.app.engine;

/** Counts flashes over the last second so the UI can show what the phone really managed. */
public final class RateMeter {
    private static final long WINDOW_NANOS = 1_000_000_000L;
    private final long[] stamps = new long[2048];
    private int head;
    private int size;

    public synchronized void edge(long nowNanos) {
        stamps[head] = nowNanos;
        head = (head + 1) % stamps.length;
        if (size < stamps.length) {
            size++;
        }
    }

    /** Flashes in the last second, i.e. Hz. */
    public synchronized float hz(long nowNanos) {
        int count = 0;
        for (int k = 1; k <= size; k++) {
            long t = stamps[(head - k + stamps.length) % stamps.length];
            if (nowNanos - t > WINDOW_NANOS) {
                break;
            }
            count++;
        }
        return count;
    }

    public synchronized void reset() {
        head = 0;
        size = 0;
    }
}
