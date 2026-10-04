package com.strobeglyph.app.engine;

import java.util.ArrayList;

/** Text to International Morse, as a list of timed on/off runs. */
public final class Morse {
    private static final String[] LETTERS = {
        ".-", "-...", "-.-.", "-..", ".", "..-.", "--.", "....", "..", ".---", "-.-", ".-..", "--",
        "-.", "---", ".--.", "--.-", ".-.", "...", "-", "..-", "...-", ".--", "-..-", "-.--", "--.."
    };
    private static final String[] DIGITS = {
        "-----", ".----", "..---", "...--", "....-", ".....", "-....", "--...", "---..", "----."
    };

    private Morse() {
    }

    /**
     * Encodes {@code text} as signed unit counts: positive runs are light, negative runs are
     * dark. A dot is 1 unit, a dash 3, symbols in a letter are 1 apart, letters 3, words 7.
     * The result always ends with enough darkness to loop cleanly. Characters Morse has no code
     * for are skipped.
     */
    public static int[] encode(String text) {
        ArrayList<Integer> runs = new ArrayList<Integer>();
        String upper = text == null ? "" : text.toUpperCase();
        for (int i = 0; i < upper.length(); i++) {
            char c = upper.charAt(i);
            if (c == ' ') {
                addDark(runs, 4); // the previous letter already left 3
                continue;
            }
            String code = codeFor(c);
            if (code == null) {
                continue;
            }
            for (int k = 0; k < code.length(); k++) {
                if (k > 0) {
                    addDark(runs, 1);
                }
                runs.add(code.charAt(k) == '.' ? 1 : 3);
            }
            addDark(runs, 3);
        }
        addDark(runs, 4);
        int[] out = new int[runs.size()];
        for (int i = 0; i < out.length; i++) {
            out[i] = runs.get(i);
        }
        return out;
    }

    private static String codeFor(char c) {
        if (c >= 'A' && c <= 'Z') {
            return LETTERS[c - 'A'];
        }
        if (c >= '0' && c <= '9') {
            return DIGITS[c - '0'];
        }
        return null;
    }

    private static void addDark(ArrayList<Integer> runs, int units) {
        int last = runs.size() - 1;
        if (last >= 0 && runs.get(last) < 0) {
            runs.set(last, runs.get(last) - units);
        } else {
            runs.add(-units);
        }
    }
}
