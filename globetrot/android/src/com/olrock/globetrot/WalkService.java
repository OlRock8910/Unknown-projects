package com.olrock.globetrot;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;

/**
 * Records a walk: a foreground service (so it keeps going with the screen off
 * or the app in the background) that writes each GPS fix to
 * files/walk-points.txt as "time,lat,lon,accuracy". The page collects the
 * points with take() and turns them into the 1 km squares you've walked
 * through. Stops from the notification or the app.
 */
public class WalkService extends Service implements LocationListener {
    static final String ACTION_STOP = "com.olrock.globetrot.STOP_WALK";
    private static final String CHANNEL = "walks";
    private static final int NOTIFICATION = 1;
    // Fixes vaguer than this would light up the wrong squares.
    private static final float WORST_ACCURACY_M = 60f;

    static volatile boolean running;

    private LocationManager lm;

    static File points(Context c) {
        return new File(c.getFilesDir(), "walk-points.txt");
    }

    /** Everything recorded since the last call, and forgets it. */
    static String take(Context c) {
        synchronized (WalkService.class) {
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

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION, notification());
        }
        if (lm == null) {
            lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            try {
                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 4000, 10, this, Looper.getMainLooper());
            } catch (Exception e) {
                stopSelf();
                return START_NOT_STICKY;
            }
        }
        running = true;
        return START_STICKY;
    }

    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Walk recording", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shown while Globetrot records where you walk");
            nm.createNotificationChannel(ch);
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        int immutable = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent openApp = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open = PendingIntent.getActivity(this, 0, openApp, immutable | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, WalkService.class).setAction(ACTION_STOP), immutable | PendingIntent.FLAG_UPDATE_CURRENT);
        b.setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Recording your walk")
                .setContentText("Lighting up the places you walk through")
                .setOngoing(true)
                .setContentIntent(open)
                .addAction(android.R.drawable.ic_media_pause, "Stop", stop);
        return b.build();
    }

    @Override
    public void onLocationChanged(Location l) {
        if (l.hasAccuracy() && l.getAccuracy() > WORST_ACCURACY_M) return;
        String line = l.getTime() + "," + l.getLatitude() + "," + l.getLongitude() + "," + Math.round(l.getAccuracy()) + "\n";
        synchronized (WalkService.class) {
            try {
                FileWriter w = new FileWriter(points(this), true);
                try { w.write(line); } finally { w.close(); }
            } catch (Exception ignored) {
            }
        }
    }

    // Abstract before Android 10, so they must exist.
    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) { }

    @Override
    public void onProviderEnabled(String provider) { }

    @Override
    public void onProviderDisabled(String provider) { }

    @Override
    public void onDestroy() {
        running = false;
        if (lm != null) lm.removeUpdates(this);
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
