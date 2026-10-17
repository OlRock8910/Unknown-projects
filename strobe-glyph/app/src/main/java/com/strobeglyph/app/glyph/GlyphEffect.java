package com.strobeglyph.app.glyph;

/** Light shows for the Glyph LEDs. Everything but {@link #SYNC} runs on its own clock. */
public enum GlyphEffect {
    SYNC("Sync", "Flashes together with the torch"),
    CHASE("Chase", "A comet runs around the lights"),
    BOUNCE("Scanner", "A bar sweeps back and forth"),
    FILL("Fill", "Fills up, then drains"),
    SPARKLE("Sparkle", "Random twinkling"),
    ALTERNATE("Alternate", "Two halves trade places"),
    BREATHE("Breathe", "Smooth pulse (ripples on a matrix)");

    public final String label;
    public final String blurb;

    GlyphEffect(String label, String blurb) {
        this.label = label;
        this.blurb = blurb;
    }
}
