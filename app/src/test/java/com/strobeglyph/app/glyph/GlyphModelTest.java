package com.strobeglyph.app.glyph;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class GlyphModelTest {
    @Test
    public void recognisesEveryNothingModelCode() {
        assertEquals(GlyphModel.PHONE_1, GlyphModel.detect("Nothing", "A063"));
        assertEquals(GlyphModel.PHONE_2, GlyphModel.detect("Nothing", "A065"));
        assertEquals(GlyphModel.PHONE_2, GlyphModel.detect("Nothing", "AIN065"));
        assertEquals(GlyphModel.PHONE_2A, GlyphModel.detect("Nothing", "A142"));
        assertEquals(GlyphModel.PHONE_2A_PLUS, GlyphModel.detect("Nothing", "A142P"));
        assertEquals(GlyphModel.PHONE_3A, GlyphModel.detect("Nothing", "A059"));
        assertEquals(GlyphModel.PHONE_3A, GlyphModel.detect("Nothing", "A059P"));
        assertEquals(GlyphModel.PHONE_3, GlyphModel.detect("Nothing", "A024"));
        assertEquals(GlyphModel.PHONE_4A, GlyphModel.detect("Nothing", "A069"));
        assertEquals(GlyphModel.PHONE_4A_PRO, GlyphModel.detect("Nothing", "A069P"));
        assertEquals(GlyphModel.PHONE_4B, GlyphModel.detect("Nothing", "A009P"));
    }

    @Test
    public void similarCodesAreNotConfused() {
        // "A142" must not swallow the Plus, nor "A069" the Pro
        assertEquals(GlyphModel.PHONE_2A_PLUS, GlyphModel.detect("Nothing", "a142p"));
        assertEquals(GlyphModel.PHONE_4A_PRO, GlyphModel.detect("Nothing", " A069P "));
    }

    @Test
    public void ignoresPhonesWithoutGlyph() {
        assertNull(GlyphModel.detect("Google", "Pixel 9"));
        assertNull(GlyphModel.detect("Google", "A063")); // right code, wrong maker
        assertNull(GlyphModel.detect("Nothing", "A001")); // CMF phones have no Glyph
        assertNull(GlyphModel.detect(null, "A063"));
        assertNull(GlyphModel.detect("Nothing", null));
    }

    @Test
    public void sceneSizesMatchTheHardware() {
        assertEquals(15, GlyphModel.PHONE_1.scene().size());
        assertEquals(33, GlyphModel.PHONE_2.scene().size());
        assertEquals(26, GlyphModel.PHONE_2A.scene().size());
        assertEquals(36, GlyphModel.PHONE_3A.scene().size());
        assertEquals(25 * 25, GlyphModel.PHONE_3.scene().size());
        assertEquals(13 * 13, GlyphModel.PHONE_4A_PRO.scene().size());
        assertTrue(GlyphModel.PHONE_3.scene().isMatrix());
        assertEquals(4095, GlyphModel.PHONE_1.scene().maxLevel());
        assertEquals(255, GlyphModel.PHONE_3.scene().maxLevel());
    }
}
