package com.strobeglyph.app.engine;

/** Anything that can tell the strobe when the music just hit. */
public interface BeatSource {
    /** {@link System#nanoTime()} of the most recent beat, or 0 if there has been none. */
    long lastBeatNanos();
}
