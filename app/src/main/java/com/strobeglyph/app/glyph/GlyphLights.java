package com.strobeglyph.app.glyph;

import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.os.Handler;

import com.nothing.ketchum.Glyph;
import com.nothing.ketchum.GlyphException;
import com.nothing.ketchum.GlyphManager;
import com.nothing.ketchum.GlyphMatrixManager;

import java.util.Arrays;

/**
 * The only class that touches Nothing's Glyph SDK. It never throws at the caller: whatever the
 * Glyph service does, the worst outcome is a status message and dark LEDs.
 *
 * <p>Frames are handed to a worker thread that always sends the <em>newest</em> one and drops any
 * it was too slow for, so a slow Glyph service can never hold up the torch timing.
 */
public final class GlyphLights {
    public enum Status {
        /** Not connected yet (or disconnected because the app is in the background). */
        IDLE,
        CONNECTING,
        READY,
        /** The service is there but refused us: Glyph access has to be switched on. */
        NEEDS_SETUP,
        /** No Glyph service answered. */
        UNAVAILABLE,
        ERROR
    }

    public interface Listener {
        /** Called on the main thread. */
        void onGlyphStatus(Status status);
    }

    private static final long CONNECT_TIMEOUT_MS = 4000;
    private static final int MAX_CONSECUTIVE_FAILURES = 8;

    private final Context app;
    private final Handler main;
    private final GlyphModel model;
    private final GlyphScene scene;
    private final Listener listener;
    private GlyphManager strip;
    private GlyphMatrixManager grid;
    private volatile Status status = Status.IDLE;
    private Worker worker;
    private boolean bound;

    private final Runnable connectTimeout = new Runnable() {
        @Override
        public void run() {
            if (status == Status.CONNECTING) {
                setStatus(Status.UNAVAILABLE);
            }
        }
    };

    public GlyphLights(Context context, Handler main, GlyphModel model, Listener listener) {
        this.app = context.getApplicationContext();
        this.main = main;
        this.model = model;
        this.scene = model.scene();
        this.listener = listener;
    }

    /** True when this phone is one the SDK can drive, i.e. worth even trying. */
    public static boolean supportedHere() {
        return Build.VERSION.SDK_INT >= 33;
    }

    public GlyphModel model() {
        return model;
    }

    public GlyphScene scene() {
        return scene;
    }

    public Status status() {
        return status;
    }

    public boolean isReady() {
        return status == Status.READY;
    }

    /** Binds the Glyph service. The result arrives through the listener. */
    public void connect() {
        if (bound) {
            return;
        }
        bound = true;
        setStatus(Status.CONNECTING);
        main.postDelayed(connectTimeout, CONNECT_TIMEOUT_MS);
        try {
            if (model.matrix) {
                grid = GlyphMatrixManager.getInstance(app);
                grid.init(new GlyphMatrixManager.Callback() {
                    @Override
                    public void onServiceConnected(ComponentName name) {
                        registered(registerMatrix());
                    }

                    @Override
                    public void onServiceDisconnected(ComponentName name) {
                        lost();
                    }
                });
            } else {
                strip = GlyphManager.getInstance(app);
                strip.init(new GlyphManager.Callback() {
                    @Override
                    public void onServiceConnected(ComponentName name) {
                        registered(registerStrip());
                    }

                    @Override
                    public void onServiceDisconnected(ComponentName name) {
                        lost();
                    }
                });
            }
        } catch (RuntimeException e) {
            main.removeCallbacks(connectTimeout);
            setStatus(Status.ERROR);
        }
    }

    /** Releases the Glyph service. The Glyph SDK only works while the app is on screen. */
    public void disconnect() {
        if (!bound) {
            return;
        }
        endShow();
        main.removeCallbacks(connectTimeout);
        bound = false;
        try {
            if (strip != null) {
                strip.unInit();
            }
            if (grid != null) {
                grid.unInit();
            }
        } catch (RuntimeException ignored) {
            // Already unbound.
        }
        strip = null;
        grid = null;
        setStatus(Status.IDLE);
    }

    /** Takes over the lights. Returns false if they are not available. */
    public synchronized boolean beginShow() {
        if (status != Status.READY || worker != null) {
            return status == Status.READY;
        }
        try {
            if (strip != null) {
                strip.openSession();
            }
        } catch (GlyphException | RuntimeException e) {
            setStatus(Status.ERROR);
            return false;
        }
        worker = new Worker();
        worker.start();
        return true;
    }

    /** Switches the LEDs off and hands them back to the system. */
    public void endShow() {
        Worker w;
        synchronized (this) {
            w = worker;
            worker = null;
        }
        if (w == null) {
            return;
        }
        w.quit();
        int[] dark = new int[scene.size()];
        try {
            if (strip != null) {
                strip.setFrameColors(dark);
                strip.closeSession();
            } else if (grid != null) {
                grid.setAppMatrixFrame(dark);
                grid.closeAppMatrix();
            }
        } catch (GlyphException | RuntimeException ignored) {
            // The service closes the session itself when we unbind.
        }
    }

    /** Queues a frame of {@link GlyphScene#size()} brightness values. Identical frames are skipped. */
    public void post(int[] frame) {
        Worker w = worker;
        if (w != null) {
            w.offer(frame);
        }
    }

    // ---- registration -----------------------------------------------------------------

    private boolean registerStrip() {
        try {
            return strip.register(deviceCode());
        } catch (RuntimeException e) {
            return false;
        }
    }

    private boolean registerMatrix() {
        try {
            return grid.register(deviceCode());
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** The SDK's own identifier for this phone. */
    private String deviceCode() {
        switch (model) {
            case PHONE_1:
                return Glyph.DEVICE_20111;
            case PHONE_2:
                return "AIN065".equalsIgnoreCase(Build.MODEL) ? Glyph.DEVICE_22111I : Glyph.DEVICE_22111;
            case PHONE_2A:
                return Glyph.DEVICE_23111;
            case PHONE_2A_PLUS:
                return Glyph.DEVICE_23113;
            case PHONE_3A:
                return Glyph.DEVICE_24111;
            case PHONE_3:
                return Glyph.DEVICE_23112;
            case PHONE_4A:
                return Glyph.DEVICE_25111;
            case PHONE_4A_PRO:
                return Glyph.DEVICE_25111p;
            case PHONE_4B:
            default:
                return Glyph.DEVICE_25131;
        }
    }

    private void registered(boolean ok) {
        main.removeCallbacks(connectTimeout);
        setStatus(ok ? Status.READY : Status.NEEDS_SETUP);
    }

    private void lost() {
        endShow();
        main.removeCallbacks(connectTimeout);
        if (bound) {
            setStatus(Status.UNAVAILABLE);
        }
    }

    private void setStatus(Status s) {
        if (status == s) {
            return;
        }
        status = s;
        if (listener != null) {
            listener.onGlyphStatus(s);
        }
    }

    // ---- frame delivery ---------------------------------------------------------------

    private final class Worker extends Thread {
        private final Object lock = new Object();
        private int[] pending;
        private int[] lastOffered;
        private boolean quit;
        private int failures;

        Worker() {
            super("glyph-out");
        }

        void offer(int[] frame) {
            synchronized (lock) {
                if (quit || Arrays.equals(frame, lastOffered)) {
                    return;
                }
                lastOffered = frame.clone();
                pending = lastOffered;
                lock.notifyAll();
            }
        }

        void quit() {
            synchronized (lock) {
                quit = true;
                lock.notifyAll();
            }
            if (Thread.currentThread() != this) {
                try {
                    join(500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }

        @Override
        public void run() {
            while (true) {
                int[] frame;
                synchronized (lock) {
                    while (pending == null && !quit) {
                        try {
                            lock.wait();
                        } catch (InterruptedException e) {
                            return;
                        }
                    }
                    if (quit) {
                        return;
                    }
                    frame = pending;
                    pending = null;
                }
                send(frame);
            }
        }

        private void send(int[] frame) {
            try {
                if (strip != null) {
                    strip.setFrameColors(frame);
                } else if (grid != null) {
                    grid.setAppMatrixFrame(frame);
                }
                failures = 0;
            } catch (GlyphException | RuntimeException e) {
                if (++failures == MAX_CONSECUTIVE_FAILURES) {
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            setStatus(Status.ERROR);
                        }
                    });
                }
            }
        }
    }
}
