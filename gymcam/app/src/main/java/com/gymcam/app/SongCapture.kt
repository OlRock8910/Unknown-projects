package com.gymcam.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.content.IntentCompat

/** Holds the MediaProjection that lets GymCam hear the song other apps are playing. */
object SongCapture {
    @Volatile var projection: MediaProjection? = null
        private set

    val isReady get() = projection != null

    /** Called on the main thread whenever [projection] appears or goes away. */
    var onChanged: (() -> Unit)? = null

    private val main = Handler(Looper.getMainLooper())

    internal fun set(p: MediaProjection?) {
        projection = p
        main.post { onChanged?.invoke() }
    }

    fun stop(context: Context) {
        val p = projection
        projection = null
        runCatching { p?.stop() }
        context.stopService(Intent(context, SongCaptureService::class.java))
        main.post { onChanged?.invoke() }
    }
}

/**
 * Android only hands out a MediaProjection to an app running a mediaProjection
 * foreground service, so this service exists just to hold it.
 */
class SongCaptureService : Service() {

    companion object {
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        private const val CHANNEL = "song_capture"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Song in video", NotificationManager.IMPORTANCE_LOW)
        )
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_music)
            .setContentTitle("Song in video is on")
            .setContentText("GymCam can record your music into clips. Sound only.")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)

        val code = intent?.getIntExtra(EXTRA_CODE, 0) ?: 0
        val data = intent?.let { IntentCompat.getParcelableExtra(it, EXTRA_DATA, Intent::class.java) }
        if (data != null && !SongCapture.isReady) {
            val mpm = getSystemService(MediaProjectionManager::class.java)
            val p = runCatching { mpm.getMediaProjection(code, data) }.getOrNull()
            if (p == null) {
                stopSelf()
                return START_NOT_STICKY
            }
            p.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    if (SongCapture.projection === p) SongCapture.set(null)
                    stopSelf()
                }
            }, Handler(Looper.getMainLooper()))
            SongCapture.set(p)
        }
        return START_NOT_STICKY
    }
}
