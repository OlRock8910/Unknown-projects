package com.ironlog.android

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.ironlog.R
import com.ironlog.domain.AppData
import com.ironlog.domain.Motivation
import com.ironlog.domain.Reminders
import java.time.LocalDateTime
import java.time.ZoneId

object Notifications {
    const val CHANNEL = "workout_reminders"
    private const val ID = 4201

    fun createChannel(context: Context) {
        // Silent on purpose: a quiet buzz, no sound.
        val channel = NotificationChannel(CHANNEL, "Workout reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Nudges on days you've planned a workout, until it's logged"
            setSound(null, null)
            enableVibration(true)
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    fun allowed(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Takes a reminder out of the shade once it no longer applies. */
    fun cancelReminder(context: Context) = NotificationManagerCompat.from(context).cancel(ID)

    @SuppressLint("MissingPermission") // checked by allowed() just below
    fun showReminder(context: Context, title: String, text: String, workoutId: String?) {
        if (!allowed(context)) return
        val open = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (workoutId != null) putExtra(MainActivity.EXTRA_WORKOUT, workoutId)
        }
        val pi = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFC6FF3D.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(ID, n)
        } catch (e: SecurityException) {
            // Permission was revoked between the check and the post.
        }
    }
}

/**
 * Keeps exactly one alarm pending: the next reminder slot on a day with a planned
 * workout. Each time it fires, the receiver posts (if still needed) and books the next.
 */
object ReminderScheduler {
    private const val REQUEST = 77
    private const val MIDNIGHT_REQUEST = 78
    const val ACTION_MIDNIGHT = "com.ironlog.MIDNIGHT"

    private fun pending(context: Context, flags: Int): PendingIntent? =
        PendingIntent.getBroadcast(context, REQUEST, Intent(context, ReminderReceiver::class.java), flags or PendingIntent.FLAG_IMMUTABLE)

    fun schedule(context: Context, data: AppData) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        // Just after midnight: flip the widgets to the new day and clear yesterday's nudge.
        val midnight = LocalDateTime.now().toLocalDate().plusDays(1).atTime(0, 1)
            .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val midnightIntent = Intent(context, ReminderReceiver::class.java).setAction(ACTION_MIDNIGHT)
        PendingIntent.getBroadcast(context, MIDNIGHT_REQUEST, midnightIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            ?.let { am.set(AlarmManager.RTC, midnight, it) }
        val next = Reminders.next(data, LocalDateTime.now().plusSeconds(30))
        if (next == null) {
            pending(context, PendingIntent.FLAG_NO_CREATE)?.let { am.cancel(it) }
            return
        }
        val at = next.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val pi = pending(context, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        // Not an exact alarm (that needs a special permission); Android may shift it by a
        // few minutes to save battery, which is fine for a reminder.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val data = context.ironLog.store.current
        if (intent.action == ReminderScheduler.ACTION_MIDNIGHT) {
            Notifications.cancelReminder(context)
            Widgets.updateAll(context, data)
            ReminderScheduler.schedule(context, data)
            return
        }
        val today = LocalDateTime.now().toLocalDate()
        val due = Reminders.pendingOn(data, today)
        if (data.settings.remindersEnabled && data.onboarded && due.isNotEmpty()) {
            val w = due.first()
            val label = Reminders.label(w)
            val text = Motivation.reminder(label)
            val title = if (due.size > 1) "${due.size} workouts planned today" else "Time to train 💪"
            Notifications.showReminder(context, title, text, w.id)
        }
        ReminderScheduler.schedule(context, data)
        Widgets.updateAll(context, data)
    }
}

/** Alarms don't survive a reboot or a clock change, so rebook them. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val data = context.ironLog.store.current
        ReminderScheduler.schedule(context, data)
        Widgets.updateAll(context, data)
    }
}
