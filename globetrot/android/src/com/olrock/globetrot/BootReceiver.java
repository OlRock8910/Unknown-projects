package com.olrock.globetrot;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Starts mapping again after the phone restarts or Globetrot is updated, if
 * the person had it on. That only works with location allowed "all the time";
 * without it, Android won't hand locations to a service started from the
 * background, so instead a notification offers to resume with one tap.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "resume";
    private static final int NOTIFICATION = 2;

    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        if (!TrackService.enabled(c) || !TrackService.granted(c, Manifest.permission.ACCESS_FINE_LOCATION)) return;
        if (TrackService.backgroundAllowed(c) && TrackService.start(c, null)) return;
        offerResume(c);
    }

    private static void offerResume(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Resume mapping", NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(c, CHANNEL);
        } else {
            b = new Notification.Builder(c);
        }
        int immutable = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent open = PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class), immutable | PendingIntent.FLAG_UPDATE_CURRENT);
        b.setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Mapping is paused")
                .setContentText("Tap to carry on lighting up where you go")
                .setContentIntent(open)
                .setAutoCancel(true);
        try { nm.notify(NOTIFICATION, b.build()); } catch (Exception ignored) { }
    }
}
