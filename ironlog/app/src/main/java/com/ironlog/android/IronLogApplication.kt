package com.ironlog.android

import android.app.Application
import com.ironlog.data.Store
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.io.File

class IronLogApplication : Application() {

    /** App-wide scope for disk writes; lives as long as the process. */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** The one copy of the data, shared by the UI, the widgets and the reminder receiver. */
    val store: Store by lazy {
        Store(File(filesDir, "ironlog.json"), scope).also { s ->
            s.onSaved = { data ->
                Widgets.updateAll(this, data)
                ReminderScheduler.schedule(this, data)
                // Logged today's workout, or turned reminders off: the nudge has done its job.
                val today = java.time.LocalDate.now()
                if (!data.settings.remindersEnabled || com.ironlog.domain.Reminders.pendingOn(data, today).isEmpty()) {
                    Notifications.cancelReminder(this)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        Notifications.createChannel(this)
        ReminderScheduler.schedule(this, store.current)
    }
}

val android.content.Context.ironLog: IronLogApplication get() = applicationContext as IronLogApplication
