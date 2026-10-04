package com.strobeglyph.app.glyph;

import java.util.Locale;

/**
 * The Nothing phones that have Glyph lights, keyed by the model codes Android reports in
 * {@code Build.MODEL}. Strip phones expose one brightness value per LED segment; matrix phones
 * expose a square grid of pixels.
 */
public enum GlyphModel {
    PHONE_1("Phone (1)", false, 15, "A063"),
    PHONE_2("Phone (2)", false, 33, "A065", "AIN065"),
    PHONE_2A("Phone (2a)", false, 26, "A142"),
    PHONE_2A_PLUS("Phone (2a) Plus", false, 26, "A142P"),
    PHONE_3A("Phone (3a)", false, 36, "A059", "A059P"),
    PHONE_3("Phone (3)", true, 25, "A024"),
    PHONE_4A("Phone (4a)", false, 6, "A069"),
    PHONE_4A_PRO("Phone (4a) Pro", true, 13, "A069P"),
    PHONE_4B("Phone (4b)", false, 4, "A009P");

    public final String label;
    /** True for a pixel grid (Phone 3, 4a Pro); false for individual LED segments. */
    public final boolean matrix;
    /** LED segments on a strip phone, or the side length of the square grid on a matrix phone. */
    public final int size;
    private final String[] codes;

    GlyphModel(String label, boolean matrix, int size, String... codes) {
        this.label = label;
        this.matrix = matrix;
        this.size = size;
        this.codes = codes;
    }

    /** The model for this device, or null if it is not a Nothing phone we know has Glyph lights. */
    public static GlyphModel detect(String manufacturer, String model) {
        if (manufacturer == null || model == null || !manufacturer.trim().equalsIgnoreCase("nothing")) {
            return null;
        }
        String wanted = model.trim().toUpperCase(Locale.ROOT);
        for (GlyphModel g : values()) {
            for (String code : g.codes) {
                if (code.equals(wanted)) {
                    return g;
                }
            }
        }
        return null;
    }

    public GlyphScene scene() {
        return matrix ? GlyphScene.matrix(size) : GlyphScene.strip(size);
    }
}
