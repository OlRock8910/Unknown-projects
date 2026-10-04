package com.strobeglyph.app.output;

import android.content.Context;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import android.os.Handler;

/**
 * Drives the camera flash as a torch. This needs no camera session, so toggling is as cheap as
 * Android makes it: one binder call per change. Where the phone allows (Android 13+), it also sets
 * the torch's brightness.
 */
public final class TorchController {
    public interface Listener {
        /** Called on the main thread. The torch cannot be used until the problem is dealt with. */
        void onTorchProblem(boolean needsCameraPermission, String message);
    }

    private final CameraManager manager;
    private final Handler main;
    private final String cameraId;
    private final int maxLevel;
    private volatile Listener listener;
    /** Accepting {@link #set} calls. Cleared as soon as something goes wrong. */
    private volatile boolean armed;
    /** Holding a torch callback and possibly a lit torch that {@link #disarm} must clean up. */
    private boolean engaged;
    /** 0 when off, otherwise the strength level currently on. */
    private int appliedLevel;

    private final CameraManager.TorchCallback callback = new CameraManager.TorchCallback() {
        @Override
        public void onTorchModeUnavailable(String id) {
            if (armed && id.equals(cameraId)) {
                problem(false, "The flash is being used by another app.");
            }
        }
    };

    public TorchController(Context context, Handler main) {
        this.main = main;
        manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
        String id = null;
        int max = 1;
        try {
            for (String candidate : manager.getCameraIdList()) {
                CameraCharacteristics cc = manager.getCameraCharacteristics(candidate);
                Boolean flash = cc.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (flash == null || !flash) {
                    continue;
                }
                Integer facing = cc.get(CameraCharacteristics.LENS_FACING);
                boolean back = facing != null && facing == CameraCharacteristics.LENS_FACING_BACK;
                if (id == null || back) {
                    id = candidate;
                    max = 1;
                    if (Build.VERSION.SDK_INT >= 33) {
                        Integer level = cc.get(CameraCharacteristics.FLASH_INFO_STRENGTH_MAXIMUM_LEVEL);
                        if (level != null) {
                            max = level;
                        }
                    }
                }
                if (back) {
                    break;
                }
            }
        } catch (CameraAccessException | RuntimeException e) {
            id = null;
        }
        cameraId = id;
        maxLevel = max;
    }

    public boolean isAvailable() {
        return cameraId != null;
    }

    /** True if the phone can run its torch at less than full power. */
    public boolean supportsBrightness() {
        return cameraId != null && maxLevel > 1;
    }

    /** Starts accepting {@link #set} calls and watching for the flash being taken away. */
    public synchronized void arm(Listener l) {
        listener = l;
        if (cameraId == null) {
            return;
        }
        armed = true;
        if (engaged) {
            return;
        }
        engaged = true;
        appliedLevel = 0;
        try {
            manager.registerTorchCallback(callback, main);
        } catch (RuntimeException ignored) {
            // Only the "taken by another app" notice is lost.
        }
    }

    /** Turns the torch off and ignores further {@link #set} calls. */
    public synchronized void disarm() {
        armed = false;
        if (!engaged) {
            return;
        }
        engaged = false;
        try {
            manager.setTorchMode(cameraId, false);
        } catch (CameraAccessException | RuntimeException ignored) {
            // Nothing sensible to do: the torch is either off already or beyond our reach.
        }
        appliedLevel = 0;
        try {
            manager.unregisterTorchCallback(callback);
        } catch (RuntimeException ignored) {
            // Already gone.
        }
    }

    /**
     * Lights or darkens the torch. Does nothing if the state is already what was asked for, so
     * patterns can call it every step. {@code percent} (1..100) only matters on phones that
     * support torch brightness.
     */
    public synchronized void set(boolean on, int percent) {
        if (!armed) {
            return;
        }
        int level = on ? levelFor(percent) : 0;
        if (level == appliedLevel) {
            return;
        }
        try {
            if (!on) {
                manager.setTorchMode(cameraId, false);
            } else if (maxLevel > 1 && Build.VERSION.SDK_INT >= 33) {
                manager.turnOnTorchWithStrengthLevel(cameraId, level);
            } else {
                manager.setTorchMode(cameraId, true);
            }
            appliedLevel = level;
        } catch (SecurityException e) {
            problem(true, "Camera permission is needed to use the flash on this phone.");
        } catch (CameraAccessException e) {
            problem(false, "Could not use the flash. Another app may be using the camera.");
        } catch (RuntimeException e) {
            problem(false, "The flash refused the request.");
        }
    }

    private int levelFor(int percent) {
        if (maxLevel <= 1) {
            return 1;
        }
        return Math.max(1, Math.min(maxLevel, Math.round(maxLevel * percent / 100f)));
    }

    private void problem(final boolean needsPermission, final String message) {
        armed = false;
        final Listener l = listener;
        if (l != null) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    l.onTorchProblem(needsPermission, message);
                }
            });
        }
    }
}
