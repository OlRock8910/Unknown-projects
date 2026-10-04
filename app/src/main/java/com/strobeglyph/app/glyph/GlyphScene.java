package com.strobeglyph.app.glyph;

import java.util.Arrays;
import java.util.Random;

/**
 * Turns a {@link GlyphEffect} into raw brightness frames: one value per LED segment on a strip
 * phone (0..4095), or one per pixel of the square grid on a matrix phone (0..255). Pure maths, so
 * it can be tested without a Nothing phone.
 */
public final class GlyphScene {
    public static final int STRIP_MAX = 4095;
    public static final int MATRIX_MAX = 255;
    private static final long MIN_FAST_STEP = 8_000_000L;
    private static final long MIN_SMOOTH_STEP = 16_000_000L;
    private static final int MATRIX_RING_STEPS = 48;

    private final boolean matrix;
    private final int n;

    private GlyphScene(boolean matrix, int n) {
        this.matrix = matrix;
        this.n = n;
    }

    public static GlyphScene strip(int channels) {
        return new GlyphScene(false, channels);
    }

    public static GlyphScene matrix(int side) {
        return new GlyphScene(true, side);
    }

    public boolean isMatrix() {
        return matrix;
    }

    /** Length of the frame arrays this scene reads and writes. */
    public int size() {
        return matrix ? n * n : n;
    }

    public int maxLevel() {
        return matrix ? MATRIX_MAX : STRIP_MAX;
    }

    /** Every LED at the same brightness. */
    public void fill(int level, int[] out) {
        Arrays.fill(out, level);
    }

    private int stepsPerCycle(GlyphEffect e) {
        switch (e) {
            case CHASE:
                return matrix ? MATRIX_RING_STEPS : n;
            case BOUNCE:
                return Math.max(2, 2 * (n - 1));
            case FILL:
                return 2 * n;
            case BREATHE:
                return matrix ? 30 : 40;
            default:
                return 1;
        }
    }

    /**
     * How long each frame of {@code e} lasts at speed {@code hz}. Sweeps take 4/hz seconds and a
     * breath 6/hz, and frames never get shorter than a few milliseconds, which is about the most
     * the Glyph service can be asked for.
     */
    public long stepNanos(GlyphEffect e, float hz) {
        double h = Math.max(0.5f, Math.min(60f, hz));
        double nanos;
        long floor = MIN_FAST_STEP;
        switch (e) {
            case CHASE:
            case BOUNCE:
            case FILL:
                nanos = 1e9 / ((h / 4.0) * stepsPerCycle(e));
                break;
            case BREATHE:
                nanos = 1e9 / ((h / 6.0) * stepsPerCycle(e));
                floor = MIN_SMOOTH_STEP;
                break;
            case ALTERNATE:
                nanos = 0.5e9 / h;
                break;
            case SPARKLE:
            case SYNC:
            default:
                nanos = 1e9 / h;
                floor = MIN_SMOOTH_STEP;
                break;
        }
        return Math.max(floor, (long) nanos);
    }

    /** Renders frame number {@code step} of {@code e}, with {@code level} as its brightest value. */
    public void render(GlyphEffect e, long step, int level, Random rng, int[] out) {
        Arrays.fill(out, 0);
        if (e == GlyphEffect.SYNC) {
            fill(level, out);
        } else if (matrix) {
            renderMatrix(e, step, level, rng, out);
        } else {
            renderStrip(e, step, level, rng, out);
        }
    }

    // ---- LED strip phones -------------------------------------------------------------

    private void renderStrip(GlyphEffect e, long step, int level, Random rng, int[] out) {
        switch (e) {
            case CHASE: {
                int head = (int) (step % n);
                int tail = Math.max(3, n / 6);
                for (int k = 0; k < tail; k++) {
                    put(out, (head - k + n) % n, fade(level, k, tail));
                }
                break;
            }
            case BOUNCE: {
                int period = stepsPerCycle(e);
                int p = (int) (step % period);
                int head = p < n ? p : period - p;
                int dir = p < n ? 1 : -1;
                int tail = Math.max(3, n / 6);
                for (int k = 0; k < tail; k++) {
                    int idx = head - dir * k;
                    if (idx >= 0 && idx < n) {
                        put(out, idx, fade(level, k, tail));
                    }
                }
                break;
            }
            case FILL: {
                int period = 2 * n;
                int p = (int) (step % period);
                int lit = p <= n ? p : period - p;
                for (int i = 0; i < lit; i++) {
                    out[i] = level;
                }
                break;
            }
            case SPARKLE:
                for (int i = 0; i < n; i++) {
                    if (rng.nextFloat() < 0.3f) {
                        out[i] = (int) (level * (0.4f + 0.6f * rng.nextFloat()));
                    }
                }
                break;
            case ALTERNATE: {
                int parity = (int) (step & 1);
                for (int i = 0; i < n; i++) {
                    if ((i & 1) == parity) {
                        out[i] = level;
                    }
                }
                break;
            }
            case BREATHE:
                Arrays.fill(out, breath(step, stepsPerCycle(e), level));
                break;
            case SYNC:
            default:
                break;
        }
    }

    // ---- Glyph Matrix phones ----------------------------------------------------------

    private void renderMatrix(GlyphEffect e, long step, int level, Random rng, int[] out) {
        int m = n;
        double c = (m - 1) / 2.0;
        switch (e) {
            case CHASE: {
                double head = 2 * Math.PI * (step % MATRIX_RING_STEPS) / MATRIX_RING_STEPS;
                double ring = c - 1.5;
                int tail = 10;
                for (int k = 0; k < tail; k++) {
                    double a = head - k * (2 * Math.PI / MATRIX_RING_STEPS);
                    blob(out, m, c + ring * Math.cos(a), c + ring * Math.sin(a), 1.15, fade(level, k, tail));
                }
                break;
            }
            case BOUNCE: {
                int period = stepsPerCycle(e);
                int p = (int) (step % period);
                int pos = p < m ? p : period - p;
                int dir = p < m ? 1 : -1;
                for (int k = 0; k < 4; k++) {
                    int col = pos - dir * k;
                    if (col < 0 || col >= m) {
                        continue;
                    }
                    int v = fade(level, k, 4);
                    for (int y = 0; y < m; y++) {
                        put(out, y * m + col, v);
                    }
                }
                break;
            }
            case FILL: {
                int period = 2 * m;
                int p = (int) (step % period);
                int rows = p <= m ? p : period - p;
                for (int y = m - rows; y < m; y++) {
                    for (int x = 0; x < m; x++) {
                        out[y * m + x] = level;
                    }
                }
                break;
            }
            case SPARKLE:
                for (int i = 0; i < out.length; i++) {
                    if (rng.nextFloat() < 0.18f) {
                        out[i] = (int) (level * (0.4f + 0.6f * rng.nextFloat()));
                    }
                }
                break;
            case ALTERNATE: {
                int parity = (int) (step & 1);
                for (int y = 0; y < m; y++) {
                    for (int x = 0; x < m; x++) {
                        if (((x + y) & 1) == parity) {
                            out[y * m + x] = level;
                        }
                    }
                }
                break;
            }
            case BREATHE: {
                int cycle = stepsPerCycle(e);
                double reach = m / 2.0 + 2;
                double r = (step % cycle) / (double) cycle * reach;
                double fadeOut = 1 - 0.6 * (r / reach);
                for (int y = 0; y < m; y++) {
                    for (int x = 0; x < m; x++) {
                        double band = 1 - Math.abs(Math.hypot(x - c, y - c) - r) / 2.2;
                        if (band > 0) {
                            out[y * m + x] = (int) (level * band * band * fadeOut);
                        }
                    }
                }
                break;
            }
            case SYNC:
            default:
                break;
        }
    }

    // ---- helpers ----------------------------------------------------------------------

    private static void put(int[] out, int idx, int value) {
        if (value > out[idx]) {
            out[idx] = value;
        }
    }

    /** Brightness of the k-th of {@code len} trail segments: bright at the head, squared falloff. */
    private static int fade(int level, int k, int len) {
        float f = 1f - k / (float) len;
        return (int) (level * f * f);
    }

    private static int breath(long step, int cycle, int level) {
        double phase = (step % cycle) / (double) cycle;
        double b = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
        return (int) (level * b * b);
    }

    /** Soft round dot centred on (px, py). */
    private static void blob(int[] out, int m, double px, double py, double sigma, int peak) {
        int reach = (int) Math.ceil(sigma * 3);
        int x0 = Math.max(0, (int) Math.floor(px) - reach);
        int x1 = Math.min(m - 1, (int) Math.ceil(px) + reach);
        int y0 = Math.max(0, (int) Math.floor(py) - reach);
        int y1 = Math.min(m - 1, (int) Math.ceil(py) + reach);
        for (int y = y0; y <= y1; y++) {
            for (int x = x0; x <= x1; x++) {
                double d2 = (x - px) * (x - px) + (y - py) * (y - py);
                put(out, y * m + x, (int) (peak * Math.exp(-d2 / (2 * sigma * sigma))));
            }
        }
    }
}
