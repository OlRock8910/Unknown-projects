package com.strobeglyph.app.engine;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class SettingsTest {
    @Test
    public void eachPatternRemembersItsOwnSpeed() {
        Settings s = new Settings();
        s.selectPattern(PatternType.STROBE);
        s.setHz(20f);
        s.selectPattern(PatternType.HEARTBEAT);
        assertEquals(PatternType.HEARTBEAT.defaultHz, s.hz, 0f);
        s.setHz(2f);
        s.selectPattern(PatternType.STROBE);
        assertEquals(20f, s.hz, 0f);
        s.selectPattern(PatternType.HEARTBEAT);
        assertEquals(2f, s.hz, 0f);
    }

    @Test
    public void speedIsClamped() {
        Settings s = new Settings();
        s.setHz(1000f);
        assertEquals(Settings.MAX_HZ, s.hz, 0f);
        s.setHz(-5f);
        assertEquals(Settings.MIN_HZ, s.hz, 0f);
        assertEquals(Settings.MAX_DUTY, Settings.clampDuty(2f), 0f);
        assertEquals(Settings.MIN_DUTY, Settings.clampDuty(0f), 0f);
    }

    @Test
    public void restoringASavedSpeedUpdatesTheLiveOneForTheCurrentPattern() {
        Settings s = new Settings();
        s.selectPattern(PatternType.BURST);
        s.restoreHzFor(PatternType.BURST, 12f);
        assertEquals(12f, s.hz, 0f);
        s.restoreHzFor(PatternType.CHAOS, 33f);
        assertEquals(12f, s.hz, 0f);
        assertEquals(33f, s.hzFor(PatternType.CHAOS), 0f);
    }

    @Test
    public void screenColoursCycleAndAreOpaque() {
        for (ScreenColor c : ScreenColor.values()) {
            for (int flash = 0; flash < 50; flash++) {
                assertEquals(0xFF, c.colorFor(flash) >>> 24);
            }
        }
        // rainbow actually changes from flash to flash, police alternates
        org.junit.Assert.assertNotEquals(ScreenColor.RAINBOW.colorFor(0), ScreenColor.RAINBOW.colorFor(1));
        org.junit.Assert.assertNotEquals(ScreenColor.POLICE.colorFor(0), ScreenColor.POLICE.colorFor(1));
        assertEquals(ScreenColor.POLICE.colorFor(0), ScreenColor.POLICE.colorFor(2));
    }
}
