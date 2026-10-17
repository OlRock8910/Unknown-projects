package com.strobeglyph.app.output;

/** Something that shows the on/off state: the full-screen flash view. Safe to call from any thread. */
public interface FlashSink {
    /** The show is starting; get ready to be seen. */
    void begin();

    /** The show is over; go away. */
    void end();

    /** {@code flash} counts lit flashes since the show began, for colour cycling. */
    void setFlash(boolean on, int flash);
}
