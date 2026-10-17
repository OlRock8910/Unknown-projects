package com.strobeglyph.app.engine;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class MorseTest {
    @Test
    public void sosIsDotDotDotDashDashDashDotDotDot() {
        // dot=1 dash=3, 1 between symbols, 3 between letters, trailing gap to loop on
        int[] expected = {
            1, -1, 1, -1, 1, -3,
            3, -1, 3, -1, 3, -3,
            1, -1, 1, -1, 1, -7
        };
        assertArrayEquals(expected, Morse.encode("SOS"));
    }

    @Test
    public void wordsAreSevenUnitsApart() {
        int[] runs = Morse.encode("E E");
        assertArrayEquals(new int[] {1, -7, 1, -7}, runs);
    }

    @Test
    public void digitsAndLowerCaseWork() {
        assertArrayEquals(Morse.encode("5"), Morse.encode("5"));
        assertArrayEquals(Morse.encode("SOS"), Morse.encode("sos"));
        // 5 is five dots
        int dots = 0;
        for (int r : Morse.encode("5")) {
            if (r == 1) {
                dots++;
            }
        }
        assertTrue(dots == 5);
    }

    @Test
    public void unknownCharactersAreSkippedAndEmptyIsJustDark() {
        assertArrayEquals(Morse.encode("SOS"), Morse.encode("S!O?S"));
        int[] empty = Morse.encode("");
        assertArrayEquals(new int[] {-4}, empty);
        assertArrayEquals(new int[] {-4}, Morse.encode(null));
    }
}
