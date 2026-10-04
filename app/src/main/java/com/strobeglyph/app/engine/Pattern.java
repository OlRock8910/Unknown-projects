package com.strobeglyph.app.engine;

/** An endless on/off sequence. Called from the strobe thread, once per step. */
public interface Pattern {
    /**
     * The next state to hold. Speed and flash length are read from
     * {@code settings} on every call, so slider moves apply to the very next
     * flash instead of waiting for a restart.
     */
    Step next(Settings settings);
}
