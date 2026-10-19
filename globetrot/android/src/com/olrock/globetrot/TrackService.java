package com.olrock.globetrot;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.location.LocationRequest;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.util.List;

/**
 * Follows where you go, all the time, so the map can light up every 1 km
 * square you pass through. A foreground service of type "location" (the only
 * way Android lets an app keep receiving locations in the background), using
 * the phone's low-power location: the fused provider at balanced accuracy on
 * Android 12+, otherwise Wi-Fi/cell positioning plus fixes other apps ask for.
 * GPS only when "sharper trails" is switched on.
 *
 * Each accepted fix is appended to files/walk-points.txt as
 * "time,lat,lon,accuracy"; the page collects them with take() whenever it's
 * open. Started by the app, and again after a reboot or update by
 * BootReceiver. Paused from its notification or the app.
 */
public class TrackService extends Service implements LocationListener {
    static final String ACTION_PAUSE = "com.olrock.globetrot.PAUSE_TRACKING";
    static final String ACTION_RESUBSCRIBE = "com.olrock.globetrot.RESUBSCRIBE";
    private static final String CHANNEL = "tracking";
    private static final int NOTIFICATION = 1;
    private static final String PREFS = "tracking";

    // Balanced fixes come from Wi-Fi and cell towers: good to ~100 m, which is
    // plenty for 1 km squares. Anything vaguer would light up the wrong ones.
    private static final float WORST_ACCURACY_M = 150f;
    private static final float WORST_ACCURACY_GPS_M = 60f;
    // Don't write a fix that hasn't moved, unless it's been a while.
    private static final float MIN_MOVE_M = 25f;
    private static final long MIN_GAP_MS = 10 * 60 * 1000;
    // Faster than this between fixes isn't walking or cycling.
    private static final double WALK_MPS = 25 / 3.6;

    static volatile boolean running;

    private LocationManager lm;
    private boolean subscribed;
    private Location lastWritten;
    private double shownKm = -1;

    // ------------------------------------------------------------ state shared with the app

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The person wants their whereabouts followed (survives reboots). */
    static boolean enabled(Context c) {
        return prefs(c).getBoolean("enabled", false);
    }

    static void setEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean("enabled", on).apply();
    }

    static boolean highAccuracy(Context c) {
        return prefs(c).getBoolean("gps", false);
    }

    static boolean granted(Context c, String permission) {
        return Build.VERSION.SDK_INT < 23 || c.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    /** Allowed to keep following from the background (Android 10+ asks separately). */
    static boolean backgroundAllowed(Context c) {
        return Build.VERSION.SDK_INT < 29 || granted(c, "android.permission.ACCESS_BACKGROUND_LOCATION");
    }

    /** Starts (or nudges) the service. False if Android refused, e.g. from the background without permission. */
    static boolean start(Context c, String action) {
        Intent i = new Intent(c, TrackService.class);
        if (action != null) i.setAction(action);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
            return true;
        } catch (Exception e) {
            // ForegroundServiceStartNotAllowedException (12+) or SecurityException (14+).
            return false;
        }
    }

    static File points(Context c) {
        return new File(c.getFilesDir(), "walk-points.txt");
    }

    /** Everything recorded since the last call, and forgets it. */
    static String take(Context c) {
        synchronized (TrackService.class) {
            File f = points(c);
            if (!f.isFile()) return "";
            try {
                FileInputStream in = new FileInputStream(f);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                try {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                } finally {
                    in.close();
                }
                f.delete();
                return out.toString("UTF-8");
            } catch (Exception e) {
                return "";
            }
        }
    }

    /** Kilometres travelled on foot today, as the notification shows it. */
    static double todayKm(Context c) {
        SharedPreferences p = prefs(c);
        if (p.getLong("day", 0) != dayNumber(System.currentTimeMillis())) return 0;
        return p.getFloat("dayKm", 0f);
    }

    private static long dayNumber(long t) {
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.setTimeInMillis(t);
        return cal.get(java.util.Calendar.YEAR) * 1000L + cal.get(java.util.Calendar.DAY_OF_YEAR);
    }

    // ------------------------------------------------------------ the service

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_PAUSE.equals(action)) {
            setEnabled(this, false);
            stopSelf();
            return START_NOT_STICKY;
        }
        // startForegroundService() must be answered with startForeground() even
        // when we're about to stop, or Android treats it as a crash.
        if (!goForeground() || !enabled(this) || !granted(this, Manifest.permission.ACCESS_FINE_LOCATION)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_RESUBSCRIBE.equals(action)) unsubscribe();
        if (!subscribe()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        return START_STICKY;
    }

    private boolean goForeground() {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION, notification(todayKm(this)), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION, notification(todayKm(this)));
            }
            return true;
        } catch (Exception e) {
            // Android 14+ refuses a location service started from the background
            // without "all the time" permission (SecurityException).
            return false;
        }
    }

    private boolean subscribe() {
        if (subscribed) return true;
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return false;
        boolean gps = highAccuracy(this);
        try {
            if (Build.VERSION.SDK_INT >= 31 && lm.hasProvider(LocationManager.FUSED_PROVIDER)) {
                LocationRequest req = new LocationRequest.Builder(gps ? 10_000 : 30_000)
                        .setQuality(gps ? LocationRequest.QUALITY_HIGH_ACCURACY : LocationRequest.QUALITY_BALANCED_POWER_ACCURACY)
                        .setMinUpdateIntervalMillis(gps ? 5_000 : 15_000)
                        .setMinUpdateDistanceMeters(gps ? 15 : 30)
                        // Let the phone batch fixes for a couple of minutes instead of waking up for each.
                        .setMaxUpdateDelayMillis(gps ? 0 : 120_000)
                        .build();
                lm.requestLocationUpdates(LocationManager.FUSED_PROVIDER, req, getMainExecutor(), this);
            } else {
                boolean any = false;
                if (gps && lm.getAllProviders().contains(LocationManager.GPS_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 15, this, Looper.getMainLooper());
                    any = true;
                }
                if (lm.getAllProviders().contains(LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 30_000, 30, this, Looper.getMainLooper());
                    any = true;
                }
                // Free: fixes that other apps (maps, fitness) ask for anyway.
                if (lm.getAllProviders().contains(LocationManager.PASSIVE_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.PASSIVE_PROVIDER, 10_000, 15, this, Looper.getMainLooper());
                    any = true;
                }
                if (!any) return false;
            }
            subscribed = true;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void unsubscribe() {
        if (lm != null && subscribed) {
            try { lm.removeUpdates(this); } catch (Exception ignored) { }
        }
        subscribed = false;
    }

    private Notification notification(double km) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Mapping where you go", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while Globetrot maps where you go");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this).setPriority(Notification.PRIORITY_MIN);
        }
        int immutable = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent openApp = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(this, 0, openApp, immutable | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent pause = PendingIntent.getService(this, 1, new Intent(this, TrackService.class).setAction(ACTION_PAUSE), immutable | PendingIntent.FLAG_UPDATE_CURRENT);
        b.setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Mapping where you go")
                .setContentText(km >= 0.05 ? String.format(java.util.Locale.US, "%.1f km on foot today", km) : "Every square you pass through lights up")
                .setOngoing(true)
                .setShowWhen(false)
                .setOnlyAlertOnce(true)
                .setContentIntent(open)
                .addAction(android.R.drawable.ic_media_pause, "Pause", pause);
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    // ------------------------------------------------------------ fixes

    @Override
    public void onLocationChanged(Location l) {
        float worst = highAccuracy(this) ? WORST_ACCURACY_GPS_M : WORST_ACCURACY_M;
        if (!l.hasAccuracy() || l.getAccuracy() > worst) return;
        if (lastWritten != null && l.distanceTo(lastWritten) < MIN_MOVE_M && l.getTime() - lastWritten.getTime() < MIN_GAP_MS) return;
        if (lastWritten != null && l.getTime() <= lastWritten.getTime()) return; // passive and fused can repeat a fix
        String line = l.getTime() + "," + l.getLatitude() + "," + l.getLongitude() + "," + Math.round(l.getAccuracy()) + "\n";
        synchronized (TrackService.class) {
            try {
                FileWriter w = new FileWriter(points(this), true);
                try { w.write(line); } finally { w.close(); }
            } catch (Exception ignored) {
                return;
            }
        }
        countDistance(l);
        lastWritten = l;
    }

    // Batched fixes (Android 12+) arrive together.
    @Override
    public void onLocationChanged(List<Location> locations) {
        for (Location l : locations) onLocationChanged(l);
    }

    /** Today's distance on foot, for the notification. */
    private void countDistance(Location l) {
        SharedPreferences p = prefs(this);
        long day = dayNumber(l.getTime());
        double km = p.getLong("day", 0) == day ? p.getFloat("dayKm", 0f) : 0;
        if (lastWritten != null && dayNumber(lastWritten.getTime()) == day) {
            double m = l.distanceTo(lastWritten), s = (l.getTime() - lastWritten.getTime()) / 1000.0;
            if (s > 0 && s < 20 * 60 && m / s <= WALK_MPS) km += m / 1000.0;
        }
        p.edit().putLong("day", day).putFloat("dayKm", (float) km).apply();
        if (Math.abs(km - shownKm) >= 0.1) {
            shownKm = km;
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            try { nm.notify(NOTIFICATION, notification(km)); } catch (Exception ignored) { }
        }
    }

    // Abstract before Android 10 (the app runs on 5.0+), so they must exist.
    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) { }

    @Override
    public void onProviderEnabled(String provider) { }

    @Override
    public void onProviderDisabled(String provider) { }

    @Override
    public void onDestroy() {
        running = false;
        unsubscribe();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
