package com.strobeglyph.app.engine;

/** One held state of the light show: lit or dark, for a number of nanoseconds. */
public final class Step {
    public final boolean on;
    public final long nanos;

    public Step(boolean on, long nanos) {
        this.on = on;
        this.nanos = Math.max(0L, nanos);
    }
}
