package com.strobeglyph.app.output;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;

import com.strobeglyph.app.engine.BeatDetector;
import com.strobeglyph.app.engine.BeatSource;

/** Listens on the microphone and feeds a {@link BeatDetector}. Needs the RECORD_AUDIO permission. */
public final class AudioBeatSource implements BeatSource {
    public interface Listener {
        /** Called on the main thread. */
        void onAudioProblem(String message);
    }

    private static final int SAMPLE_RATE = 44100;
    private static final int BLOCK = 1024;

    private final BeatDetector detector = new BeatDetector();
    private final Handler main;
    private volatile boolean running;
    private Thread thread;

    public AudioBeatSource(Handler main) {
        this.main = main;
    }

    @Override
    public long lastBeatNanos() {
        return detector.lastBeatNanos();
    }

    /** Starts listening. Returns false (and says why through the listener) if it cannot. */
    public synchronized boolean start(final Listener listener) {
        if (running) {
            return true;
        }
        int min = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT);
        final AudioRecord record;
        try {
            record = new AudioRecord(MediaRecorder.AudioSource.MIC, SAMPLE_RATE,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
                    Math.max(min, BLOCK * 8));
        } catch (SecurityException | IllegalArgumentException e) {
            tell(listener, "Microphone permission is needed for Beat mode.");
            return false;
        }
        if (record.getState() != AudioRecord.STATE_INITIALIZED) {
            record.release();
            tell(listener, "The microphone is not available right now.");
            return false;
        }
        try {
            record.startRecording();
        } catch (IllegalStateException e) {
            record.release();
            tell(listener, "The microphone is busy (is a call or recording running?).");
            return false;
        }
        running = true;
        thread = new Thread(new Runnable() {
            @Override
            public void run() {
                short[] block = new short[BLOCK];
                while (running) {
                    int n = record.read(block, 0, block.length);
                    if (n > 0) {
                        detector.process(block, n, System.nanoTime());
                    } else if (n < 0) {
                        break;
                    }
                }
                try {
                    record.stop();
                } catch (IllegalStateException ignored) {
                    // Already stopped.
                }
                record.release();
            }
        }, "beat-mic");
        thread.start();
        return true;
    }

    public void stop() {
        Thread t;
        synchronized (this) {
            running = false;
            t = thread;
            thread = null;
        }
        if (t != null) {
            try {
                t.join(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void tell(final Listener listener, final String message) {
        if (listener != null) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    listener.onAudioProblem(message);
                }
            });
        }
    }
}
