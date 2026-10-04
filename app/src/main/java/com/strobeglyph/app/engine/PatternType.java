package com.strobeglyph.app.engine;

import java.util.Random;

/** The torch / screen patterns the user can pick. */
public enum PatternType {
    STROBE("Strobe", 8f, true, "Steady on/off flashing"),
    TURBO("Max", 30f, false, "As fast as the hardware allows"),
    BURST("Burst", 8f, true, "Five quick flashes, then a pause"),
    HEARTBEAT("Heartbeat", 1.3f, false, "Lub-dub"),
    SOS("SOS", 3f, false, "Morse distress signal"),
    MORSE("Morse", 3f, false, "Flash your own message"),
    SIREN("Siren", 24f, true, "Speed sweeps up and down"),
    CHAOS("Chaos", 10f, true, "Random timing"),
    BEAT("Beat", 6f, true, "Flashes to the music (microphone)");

    public final String label;
    public final float defaultHz;
    /** Whether the flash-length slider means anything for this pattern. */
    public final boolean usesDuty;
    public final String blurb;

    PatternType(String label, float defaultHz, boolean usesDuty, String blurb) {
        this.label = label;
        this.defaultHz = defaultHz;
        this.usesDuty = usesDuty;
        this.blurb = blurb;
    }

    public boolean usesSpeed() {
        return this != TURBO;
    }

    public Pattern create(BeatSource beat) {
        switch (this) {
            case TURBO:
                return new Patterns.Turbo();
            case BURST:
                return new Patterns.Burst();
            case HEARTBEAT:
                return new Patterns.Heartbeat();
            case SOS:
                return new Patterns.MorsePattern(true);
            case MORSE:
                return new Patterns.MorsePattern(false);
            case SIREN:
                return new Patterns.Siren();
            case CHAOS:
                return new Patterns.Chaos(new Random());
            case BEAT:
                return new Patterns.Beat(beat);
            case STROBE:
            default:
                return new Patterns.Strobe();
        }
    }
}
