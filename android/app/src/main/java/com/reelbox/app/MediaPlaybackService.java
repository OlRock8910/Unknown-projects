package com.reelbox.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.PendingIntentCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Keeps sound playing with the app in the background or the screen locked,
 * and puts play/pause/next/previous on the lock screen, in the notification
 * shade and on headphone buttons.
 *
 * The actual playback happens in the WebView. This service only (1) runs in
 * the foreground while something plays, so Android does not freeze or kill
 * the app, (2) holds a CPU wake lock so playback does not stall with the
 * screen off, and (3) owns the MediaSession, whose buttons are sent back to
 * the page through {@link GalleryPlugin#emitMediaAction}.
 */
public class MediaPlaybackService extends Service {

    /** What the page says is playing. */
    static final class Info {

        String kind = "music";
        String id = "";
        String title = "";
        String artist = "";
        String art = "";
        long durationMs;
        long positionMs;
        boolean playing;
        /** Paused by another app's sound; the WebView plays again once it stops. */
        boolean interrupted;
        boolean canPrev = true;
        boolean canNext;
        boolean canLike;
        boolean liked;
    }

    static final String ACTION_PLAY = "com.reelbox.app.PLAY";
    static final String ACTION_PAUSE = "com.reelbox.app.PAUSE";
    static final String ACTION_NEXT = "com.reelbox.app.NEXT";
    static final String ACTION_PREV = "com.reelbox.app.PREV";
    static final String ACTION_DISMISS = "com.reelbox.app.DISMISS";
    static final String ACTION_LIKE = "com.reelbox.app.LIKE";

    private static final String CHANNEL = "playback";
    private static final int NOTIFICATION_ID = 7;

    private static MediaPlaybackService instance;
    /** Handed over to the service when it is being started. */
    private static Info pending;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService artLoader = Executors.newSingleThreadExecutor();
    private MediaSessionCompat session;
    private PowerManager.WakeLock wakeLock;
    private Info info;
    private String artKey;
    private Bitmap artBitmap;
    private boolean foreground;

    /*
     * Taking turns with other apps' sound (audio focus) is left to the
     * WebView: it asks Android for the sound whenever a song or video starts,
     * pauses when another app starts playing, and after a short interruption
     * (a voice note, a call, directions) plays again by itself. This service
     * must not ask for the sound as well: the two would take it from each
     * other, and whichever lost would pause the song just started.
     */

    /** How long to stay running while paused by an interruption, waiting to play again. */
    private static final long INTERRUPTION_WAIT_MS = 10 * 60 * 1000;
    /** Ends the wait: still paused, so it is no longer worth keeping the app running. */
    private final Runnable interruptionOver = () -> {
        if (info != null && !info.playing && foreground) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH);
            foreground = false;
        }
    };

    /** Headphones unplugged or Bluetooth dropped: pause rather than play out loud. */
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction()) && info != null && info.playing) {
                GalleryPlugin.emitMediaAction("pause", -1);
            }
        }
    };

    /** Show or update the controls. Must run on the main thread. */
    static void show(Context context, Info info) {
        if (instance != null) {
            instance.apply(info);
            return;
        }
        // Nothing to keep alive for a paused item that was never playing.
        if (!info.playing) return;
        pending = info;
        try {
            ContextCompat.startForegroundService(context, new Intent(context, MediaPlaybackService.class));
        } catch (Exception e) {
            // Android refuses to start a foreground service from the background
            // (for example a restore while the app is not visible). Playback
            // still works; it just has no lock-screen controls this time.
            pending = null;
        }
    }

    /** Remove the controls and let the app be backgrounded normally. */
    static void hide() {
        if (instance != null) instance.shutDown();
        pending = null;
    }

    /** A notification button, from {@link MediaButtonReceiver}. */
    static void button(String action) {
        if (instance != null) instance.handle(action);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        NotificationManagerCompat.from(this).createNotificationChannel(
            new NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_LOW)
                .setName(getString(R.string.playback_channel))
                .setShowBadge(false)
                .build()
        );
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ReelBox:playback");
        wakeLock.setReferenceCounted(false);

        session = new MediaSessionCompat(this, "ReelBox");
        session.setSessionActivity(openAppIntent());
        session.setCallback(
            new MediaSessionCompat.Callback() {
                @Override
                public void onPlay() {
                    GalleryPlugin.emitMediaAction("play", -1);
                }

                @Override
                public void onPause() {
                    GalleryPlugin.emitMediaAction("pause", -1);
                }

                @Override
                public void onSkipToNext() {
                    GalleryPlugin.emitMediaAction("next", -1);
                }

                @Override
                public void onSkipToPrevious() {
                    GalleryPlugin.emitMediaAction("prev", -1);
                }

                @Override
                public void onSeekTo(long pos) {
                    GalleryPlugin.emitMediaAction("seek", pos / 1000.0);
                }

                @Override
                public void onStop() {
                    GalleryPlugin.emitMediaAction("pause", -1);
                }

                @Override
                public void onCustomAction(String action, android.os.Bundle extras) {
                    if (ACTION_LIKE.equals(action)) GalleryPlugin.emitMediaAction("like", -1);
                }
            }
        );
        session.setActive(true);

        ContextCompat.registerReceiver(
            this,
            noisy,
            new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Info next = pending != null ? pending : info;
        pending = null;
        if (next == null) {
            // Restarted with nothing to show; startForegroundService still needs startForeground.
            next = new Info();
            next.title = getString(R.string.app_name);
        }
        // Must reach startForeground() promptly after startForegroundService().
        info = next;
        goForeground(build());
        apply(next);
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Swiped away from recents: the WebView is gone, so stop.
        shutDown();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        instance = null;
        main.removeCallbacks(interruptionOver);
        try {
            unregisterReceiver(noisy);
        } catch (IllegalArgumentException ignored) {}
        if (wakeLock.isHeld()) wakeLock.release();
        session.setActive(false);
        session.release();
        artLoader.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void handle(String action) {
        switch (action) {
            case ACTION_PLAY:
                GalleryPlugin.emitMediaAction("play", -1);
                break;
            case ACTION_PAUSE:
                GalleryPlugin.emitMediaAction("pause", -1);
                break;
            case ACTION_NEXT:
                GalleryPlugin.emitMediaAction("next", -1);
                break;
            case ACTION_PREV:
                GalleryPlugin.emitMediaAction("prev", -1);
                break;
            case ACTION_LIKE:
                GalleryPlugin.emitMediaAction("like", -1);
                break;
            case ACTION_DISMISS:
                GalleryPlugin.emitMediaAction("stop", -1);
                shutDown();
                break;
        }
    }

    private void apply(Info i) {
        info = i;
        loadArt(i);

        long actions =
            PlaybackStateCompat.ACTION_PLAY |
            PlaybackStateCompat.ACTION_PAUSE |
            PlaybackStateCompat.ACTION_PLAY_PAUSE |
            PlaybackStateCompat.ACTION_SEEK_TO |
            PlaybackStateCompat.ACTION_STOP;
        if (i.canPrev) actions |= PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
        if (i.canNext) actions |= PlaybackStateCompat.ACTION_SKIP_TO_NEXT;
        PlaybackStateCompat.Builder state = new PlaybackStateCompat.Builder().setActions(actions);
        if (i.canLike) {
            // The heart next to the controls on Android 13+ media controls, like Spotify's.
            state.addCustomAction(
                new PlaybackStateCompat.CustomAction.Builder(
                    ACTION_LIKE,
                    getString(i.liked ? R.string.unlike : R.string.like),
                    i.liked ? R.drawable.ic_np_heart_on : R.drawable.ic_np_heart
                ).build()
            );
        }
        session.setPlaybackState(
            state
                .setState(
                    i.playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                    i.positionMs,
                    i.playing ? 1f : 0f,
                    SystemClock.elapsedRealtime()
                )
                .build()
        );
        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, i.title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, i.artist)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, i.durationMs > 0 ? i.durationMs : -1);
        if (artBitmap != null) meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artBitmap);
        session.setMetadata(meta.build());

        Notification n = build();
        main.removeCallbacks(interruptionOver);
        if (i.playing) {
            goForeground(n);
            if (!wakeLock.isHeld()) wakeLock.acquire();
        } else if (i.interrupted && foreground) {
            // A voice note, call or directions paused it: keep the app running
            // (so Android does not freeze it) to play again when that ends.
            goForeground(n);
            if (wakeLock.isHeld()) wakeLock.release();
            main.postDelayed(interruptionOver, INTERRUPTION_WAIT_MS);
        } else {
            // Paused: the notification stays (and can be swiped away), but the
            // app no longer needs to be kept running.
            if (foreground) {
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH);
                foreground = false;
            }
            if (wakeLock.isHeld()) wakeLock.release();
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.notify(NOTIFICATION_ID, n);
        }
    }

    private void goForeground(Notification n) {
        try {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                n,
                Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0
            );
            foreground = true;
        } catch (Exception e) {
            // Not allowed right now (started from the background on Android 12+).
            foreground = false;
        }
    }

    private void shutDown() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        foreground = false;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.cancel(NOTIFICATION_ID);
        stopSelf();
    }

    private Notification build() {
        Info i = info;
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_play)
            .setContentTitle(i.title)
            .setContentText(i.artist)
            .setContentIntent(openAppIntent())
            .setDeleteIntent(buttonIntent(ACTION_DISMISS, 4))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(i.playing)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setLargeIcon(artBitmap);
        int compact = 0;
        int[] compactSlots = new int[3];
        int index = 0;
        if (i.canLike) {
            // Older Android shows notification buttons rather than session ones.
            b.addAction(
                i.liked ? R.drawable.ic_np_heart_on : R.drawable.ic_np_heart,
                getString(i.liked ? R.string.unlike : R.string.like),
                buttonIntent(ACTION_LIKE, 3)
            );
            index++;
        }
        if (i.canPrev) {
            b.addAction(R.drawable.ic_np_prev, getString(R.string.previous), buttonIntent(ACTION_PREV, 0));
            compactSlots[compact++] = index++;
        }
        if (i.playing) {
            b.addAction(R.drawable.ic_np_pause, getString(R.string.pause), buttonIntent(ACTION_PAUSE, 1));
        } else {
            b.addAction(R.drawable.ic_np_play, getString(R.string.play), buttonIntent(ACTION_PLAY, 1));
        }
        compactSlots[compact++] = index++;
        if (i.canNext) {
            b.addAction(R.drawable.ic_np_next, getString(R.string.next), buttonIntent(ACTION_NEXT, 2));
            compactSlots[compact++] = index;
        }
        int[] shown = new int[compact];
        System.arraycopy(compactSlots, 0, shown, 0, compact);
        b.setStyle(new MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(shown));
        return b.build();
    }

    private PendingIntent openAppIntent() {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntentCompat.getActivity(this, 10, open, PendingIntent.FLAG_UPDATE_CURRENT, false);
    }

    private PendingIntent buttonIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MediaButtonReceiver.class).setAction(action);
        return PendingIntentCompat.getBroadcast(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT, false);
    }

    /** Cover art (songs) or poster frame (videos) for the lock screen, loaded off the main thread. */
    private void loadArt(Info i) {
        String key = i.kind + ":" + i.id;
        if (key.equals(artKey)) return;
        artKey = key;
        artBitmap = null;
        long id;
        try {
            id = Long.parseLong(i.id.replaceAll("\\D", ""));
        } catch (NumberFormatException e) {
            return;
        }
        Uri art = Uri.parse("https://localhost" + (i.art.startsWith("/") ? i.art : "/"));
        String version = art.getQueryParameter("m");
        String album = art.getQueryParameter("album");
        boolean audio = "music".equals(i.kind);
        Context ctx = getApplicationContext();
        artLoader.execute(() -> {
            File file = MediaWebViewClient.cachedImage(ctx, audio, id, version, album);
            Bitmap bmp = file == null ? null : BitmapFactory.decodeFile(file.getPath());
            main.post(() -> {
                if (bmp == null || !key.equals(artKey) || instance != this || info == null) return;
                artBitmap = bmp;
                apply(info);
            });
        });
    }
}
