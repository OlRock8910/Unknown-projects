package com.strobeglyph.app.engine;

/**
 * Finds kick-drum style beats in raw microphone samples: low-passes the signal so bass dominates,
 * then fires when a block's loudness jumps well above the recent average.
 */
public final class BeatDetector implements BeatSource {
    /** Beats closer together than this are treated as one. */
    static final long REFRACTORY_NANOS = 110_000_000L;
    /** How far above the running average a block has to be. */
    static final float RISE = 1.45f;
    /** Quieter than this is silence, whatever the average says (16-bit sample units). */
    static final float FLOOR = 450f;
    private static final float LOW_PASS = 0.07f;
    private static final float AVERAGE_DECAY = 0.94f;

    private float lowPassed;
    private float average;
    private float previous;
    private volatile long lastBeat;

    /** Feeds one block of 16-bit samples. {@code nowNanos} is when the block ended. */
    public void process(short[] samples, int count, long nowNanos) {
        if (count <= 0) {
            return;
        }
        double energy = 0;
        for (int i = 0; i < count; i++) {
            lowPassed += LOW_PASS * (samples[i] - lowPassed);
            energy += lowPassed * lowPassed;
        }
        float level = (float) Math.sqrt(energy / count);
        boolean loud = level > FLOOR && level > average * RISE;
        boolean rising = level > previous;
        boolean ready = nowNanos - lastBeat > REFRACTORY_NANOS;
        if (loud && rising && ready) {
            lastBeat = nowNanos;
        }
        average = average * AVERAGE_DECAY + level * (1f - AVERAGE_DECAY);
        previous = level;
    }

    @Override
    public long lastBeatNanos() {
        return lastBeat;
    }
}
