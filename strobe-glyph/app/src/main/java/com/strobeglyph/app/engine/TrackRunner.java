package com.strobeglyph.app.engine;

import java.util.concurrent.locks.LockSupport;

/**
 * A thread that calls {@link Stepper#step()} on a drift-free schedule: each call applies one
 * state and says how long to hold it, and the next call is made exactly that long after the
 * previous one was <em>due</em>, not after it finished. A step of 0 means "straight away", which
 * is how the Max pattern runs flat out.
 */
public final class TrackRunner {
    public interface Stepper {
        /** Apply the next state. Returns how long to hold it, in nanoseconds. */
        long step();
    }

    public interface ErrorHandler {
        void onError(Throwable t);
    }

    /**
     * If the hardware cannot keep up and we fall this far behind, resynchronise instead of
     * firing a burst of catch-up steps.
     */
    static final long MAX_LAG_NANOS = 50_000_000L;

    private final String name;
    private final Stepper stepper;
    private final Runnable onThreadStart;
    private final ErrorHandler errors;
    private volatile boolean running;
    private Thread thread;

    public TrackRunner(String name, Stepper stepper, Runnable onThreadStart, ErrorHandler errors) {
        this.name = name;
        this.stepper = stepper;
        this.onThreadStart = onThreadStart;
        this.errors = errors;
    }

    public synchronized void start() {
        if (running) {
            return;
        }
        running = true;
        thread = new Thread(new Loop(), name);
        thread.start();
    }

    /** Stops the thread and waits briefly for it to finish its current step. */
    public void stop() {
        Thread t;
        synchronized (this) {
            running = false;
            t = thread;
            thread = null;
        }
        if (t == null) {
            return;
        }
        LockSupport.unpark(t);
        if (t != Thread.currentThread()) {
            try {
                t.join(400);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private final class Loop implements Runnable {
        @Override
        public void run() {
            if (onThreadStart != null) {
                onThreadStart.run();
            }
            long due = System.nanoTime();
            while (running) {
                long hold;
                try {
                    hold = stepper.step();
                } catch (RuntimeException e) {
                    running = false;
                    if (errors != null) {
                        errors.onError(e);
                    }
                    return;
                }
                due += hold;
                long now = System.nanoTime();
                if (due < now - MAX_LAG_NANOS) {
                    due = now;
                } else {
                    sleepUntil(due);
                }
            }
        }

        private void sleepUntil(long deadline) {
            while (running) {
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0) {
                    return;
                }
                LockSupport.parkNanos(remaining);
            }
        }
    }
}
