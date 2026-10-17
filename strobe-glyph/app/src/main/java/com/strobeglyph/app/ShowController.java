package com.strobeglyph.app;

import android.os.Handler;
import android.os.Process;
import android.os.SystemClock;

import com.strobeglyph.app.engine.Pattern;
import com.strobeglyph.app.engine.PatternType;
import com.strobeglyph.app.engine.RateMeter;
import com.strobeglyph.app.engine.Settings;
import com.strobeglyph.app.engine.Step;
import com.strobeglyph.app.engine.TrackRunner;
import com.strobeglyph.app.glyph.GlyphEffect;
import com.strobeglyph.app.glyph.GlyphLights;
import com.strobeglyph.app.glyph.GlyphScene;
import com.strobeglyph.app.output.AudioBeatSource;
import com.strobeglyph.app.output.FlashSink;
import com.strobeglyph.app.output.TorchController;

import java.util.Random;

/**
 * Runs the light show: owns the timing threads and routes each step to the torch, the screen and
 * the Glyph LEDs. All public methods belong on the main thread.
 *
 * <p>There are up to two timelines. The <em>pattern</em> track drives torch and screen (and the
 * Glyph LEDs too, in Sync mode). A Glyph effect other than Sync gets its own <em>effect</em> track
 * with its own speed.
 */
public final class ShowController implements TorchController.Listener, AudioBeatSource.Listener {
    public interface Listener {
        void onRunningChanged(boolean running);

        /** Something the user should read (shown as a toast). */
        void onMessage(String message);

        /** The torch wants the camera permission; ask for it, then start again. */
        void onCameraPermissionNeeded();
    }

    private static final long GLYPH_TEST_MS = 2600;

    private final Handler main;
    private final Settings settings;
    private final TorchController torch;
    private final GlyphLights glyph; // null on phones without Glyph lights
    private final FlashSink screen;
    private final AudioBeatSource audio;
    private final Listener listener;
    private final RateMeter meter = new RateMeter();

    private boolean running;
    private boolean testing;
    private boolean screenShown;
    private boolean glyphHeld;
    private long autoStopAt;
    private TrackRunner patternTrack;
    private TrackRunner effectTrack;

    private final Runnable autoStop = new Runnable() {
        @Override
        public void run() {
            stop("Timer finished");
        }
    };
    private final Runnable endTest = new Runnable() {
        @Override
        public void run() {
            stopTest();
        }
    };

    public ShowController(Handler main, Settings settings, TorchController torch, GlyphLights glyph,
                          FlashSink screen, AudioBeatSource audio, Listener listener) {
        this.main = main;
        this.settings = settings;
        this.torch = torch;
        this.glyph = glyph;
        this.screen = screen;
        this.audio = audio;
        this.listener = listener;
    }

    public boolean isRunning() {
        return running;
    }

    /** Flashes per second the phone is really managing, over the last second. */
    public float measuredHz() {
        return meter.hz(System.nanoTime());
    }

    /** Whole seconds until the timer stops the show, or -1 if there is no timer. */
    public int secondsLeft() {
        if (!running || autoStopAt == 0) {
            return -1;
        }
        return (int) Math.max(0, (autoStopAt - SystemClock.elapsedRealtime() + 999) / 1000);
    }

    // ---- start / stop -----------------------------------------------------------------

    public void start() {
        if (running) {
            return;
        }
        stopTest();
        boolean torchOut = torchWanted();
        boolean glyphOut = glyphWanted();
        if (!torchOut && !settings.screen && !glyphOut) {
            listener.onMessage("Nothing to flash. Switch on Torch, Screen or Glyph.");
            return;
        }
        if (settings.pattern == PatternType.BEAT && !audio.start(this)) {
            return; // the audio listener has already told the user why
        }
        running = true;
        meter.reset();
        if (torchOut) {
            torch.arm(this);
        }
        applyOutputs();
        startTracks();
        restartTimer();
        listener.onRunningChanged(true);
    }

    /** (Re)starts the auto-stop countdown from now, using the timer setting. */
    public void restartTimer() {
        main.removeCallbacks(autoStop);
        if (!running || settings.timerSeconds <= 0) {
            autoStopAt = 0;
            return;
        }
        long ms = settings.timerSeconds * 1000L;
        autoStopAt = SystemClock.elapsedRealtime() + ms;
        main.postDelayed(autoStop, ms);
    }

    public void stop() {
        stop(null);
    }

    private void stop(String message) {
        if (!running) {
            return;
        }
        running = false;
        main.removeCallbacks(autoStop);
        autoStopAt = 0;
        stopTracks();
        torch.disarm();
        releaseScreen();
        releaseGlyph();
        audio.stop();
        listener.onRunningChanged(false);
        if (message != null) {
            listener.onMessage(message);
        }
    }

    /**
     * Re-applies settings that cannot be read live (pattern, outputs, Glyph effect) to a running
     * show. Speed, flash length and brightness never need this.
     */
    public void refresh() {
        if (!running) {
            return;
        }
        stopTracks();
        if (settings.pattern == PatternType.BEAT) {
            if (!audio.start(this)) {
                settings.selectPattern(PatternType.STROBE);
            }
        } else {
            audio.stop();
        }
        if (torchWanted()) {
            torch.arm(this);
        }
        applyOutputs();
        if (!torchWanted() && !settings.screen && !glyphWanted()) {
            stop("Everything is switched off");
            return;
        }
        startTracks();
    }

    /** A two-second Glyph light check that does not touch the torch or screen. */
    public void testGlyph() {
        if (running || testing || glyph == null || !glyph.isReady()) {
            return;
        }
        if (!glyph.beginShow()) {
            return;
        }
        glyphHeld = true;
        testing = true;
        effectTrack = newTrack("glyph-test", new EffectStepper(GlyphEffect.CHASE, 10f, false));
        effectTrack.start();
        main.postDelayed(endTest, GLYPH_TEST_MS);
    }

    private void stopTest() {
        if (!testing) {
            return;
        }
        testing = false;
        main.removeCallbacks(endTest);
        if (effectTrack != null) {
            effectTrack.stop();
            effectTrack = null;
        }
        releaseGlyph();
    }

    // ---- outputs ----------------------------------------------------------------------

    private boolean torchWanted() {
        return settings.torch && torch.isAvailable();
    }

    private boolean glyphWanted() {
        return settings.glyph && glyph != null && glyph.isReady();
    }

    private void applyOutputs() {
        if (settings.screen && !screenShown) {
            screenShown = true;
            screen.begin();
        } else if (!settings.screen && screenShown) {
            releaseScreen();
        }
        if (glyphWanted() && !glyphHeld) {
            glyphHeld = glyph.beginShow();
        } else if (!glyphWanted() && glyphHeld) {
            releaseGlyph();
        }
        if (!torchWanted()) {
            torch.set(false, 1);
        }
    }

    private void releaseScreen() {
        if (screenShown) {
            screenShown = false;
            screen.end();
        }
    }

    private void releaseGlyph() {
        if (glyphHeld) {
            glyphHeld = false;
            glyph.endShow();
        }
    }

    // ---- tracks -----------------------------------------------------------------------

    private void startTracks() {
        patternTrack = newTrack("strobe", new PatternStepper(settings.pattern.create(audio)));
        patternTrack.start();
        if (glyphHeld && settings.glyphEffect != GlyphEffect.SYNC) {
            effectTrack = newTrack("glyph-fx", new EffectStepper(null, 0f, true));
            effectTrack.start();
        }
    }

    private void stopTracks() {
        if (patternTrack != null) {
            patternTrack.stop();
            patternTrack = null;
        }
        if (effectTrack != null) {
            effectTrack.stop();
            effectTrack = null;
        }
    }

    private TrackRunner newTrack(String name, TrackRunner.Stepper stepper) {
        return new TrackRunner(name, stepper, new Runnable() {
            @Override
            public void run() {
                Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO);
            }
        }, new TrackRunner.ErrorHandler() {
            @Override
            public void onError(Throwable t) {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        stop("Something went wrong, so the show was stopped.");
                    }
                });
            }
        });
    }

    /** Applies each pattern step to the torch, the screen, and Glyph (in Sync mode). */
    private final class PatternStepper implements TrackRunner.Stepper {
        private final Pattern pattern;
        private boolean wasOn;
        private int flashes;
        private int[] frame;

        PatternStepper(Pattern pattern) {
            this.pattern = pattern;
        }

        @Override
        public long step() {
            Step step = pattern.next(settings);
            boolean on = step.on;
            if (on && !wasOn) {
                flashes++;
                meter.edge(System.nanoTime());
            }
            wasOn = on;
            torch.set(on && settings.torch, settings.torchPercent);
            screen.setFlash(on && settings.screen, flashes);
            if (glyph != null && settings.glyph && settings.glyphEffect == GlyphEffect.SYNC) {
                GlyphScene scene = glyph.scene();
                if (frame == null) {
                    frame = new int[scene.size()];
                }
                scene.fill(on ? level(scene) : 0, frame);
                glyph.post(frame);
            }
            return step.nanos;
        }
    }

    /** Runs a Glyph effect on its own clock. */
    private final class EffectStepper implements TrackRunner.Stepper {
        private final GlyphEffect fixedEffect; // null = follow the settings
        private final float fixedHz;
        private final boolean followSettings;
        private final GlyphScene scene = glyph.scene();
        private final int[] frame = new int[scene.size()];
        private final Random rng = new Random();
        private long step;

        EffectStepper(GlyphEffect effect, float hz, boolean followSettings) {
            this.fixedEffect = effect;
            this.fixedHz = hz;
            this.followSettings = followSettings;
        }

        @Override
        public long step() {
            GlyphEffect effect = followSettings ? settings.glyphEffect : fixedEffect;
            float hz = followSettings ? settings.glyphHz : fixedHz;
            int level = followSettings ? level(scene) : scene.maxLevel();
            scene.render(effect, step++, level, rng, frame);
            glyph.post(frame);
            return scene.stepNanos(effect, hz);
        }
    }

    private int level(GlyphScene scene) {
        return Math.max(1, scene.maxLevel() * settings.glyphPercent / 100);
    }

    // ---- problems reported by the outputs ---------------------------------------------

    @Override
    public void onTorchProblem(boolean needsCameraPermission, String message) {
        if (!running) {
            return;
        }
        stop(needsCameraPermission ? null : message);
        if (needsCameraPermission) {
            listener.onCameraPermissionNeeded();
        }
    }

    @Override
    public void onAudioProblem(String message) {
        listener.onMessage(message);
        if (settings.pattern == PatternType.BEAT) {
            settings.selectPattern(PatternType.STROBE);
            if (running) {
                refresh();
            }
        }
    }
}
