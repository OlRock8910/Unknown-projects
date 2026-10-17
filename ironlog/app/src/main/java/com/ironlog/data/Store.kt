package com.ironlog.data

import com.ironlog.domain.AppData
import com.ironlog.domain.AppJson
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File

/**
 * Holds the app's data in memory and keeps it on disk as one JSON file.
 *
 * Writes go to a temp file that is then renamed over the real one, so a crash or a dead
 * battery mid-write leaves the previous version intact. The version before each write is
 * kept as a .bak, which is what loading falls back to if the main file is unreadable.
 */
class Store(private val file: File, private val scope: CoroutineScope) {

    private val backup = File(file.parentFile, file.name + ".bak")
    private val temp = File(file.parentFile, file.name + ".tmp")
    private val lock = Any()
    private val _data = MutableStateFlow(load())
    val data: StateFlow<AppData> = _data.asStateFlow()
    private var pending: Job? = null
    @Volatile private var dirty = false

    /** Called after every change has been written (widgets, reminders). */
    var onSaved: ((AppData) -> Unit)? = null

    val current: AppData get() = _data.value

    fun update(transform: (AppData) -> AppData) {
        synchronized(lock) {
            _data.value = transform(_data.value)
            dirty = true
        }
        scheduleSave()
    }

    fun replace(data: AppData) = update { data }

    private fun scheduleSave() {
        pending?.cancel()
        pending = scope.launch(Dispatchers.IO) {
            delay(250)
            writeNow()
        }
    }

    /** Writes immediately if anything is unsaved; called when the app goes to the background. */
    fun flush() {
        if (!dirty) return
        pending?.cancel()
        writeNow()
    }

    private fun writeNow() {
        val snapshot: AppData
        synchronized(lock) {
            snapshot = _data.value
            dirty = false
            try {
                file.parentFile?.mkdirs()
                temp.writeText(AppJson.encodeToString(AppData.serializer(), snapshot))
                if (file.exists()) file.copyTo(backup, overwrite = true)
                if (!temp.renameTo(file)) {
                    temp.copyTo(file, overwrite = true)
                    temp.delete()
                }
            } catch (e: Exception) {
                // Keep running on the in-memory copy; the next change or flush tries again.
                dirty = true
                return
            }
        }
        onSaved?.invoke(snapshot)
    }

    private fun load(): AppData {
        for (f in listOf(file, backup)) {
            if (!f.exists()) continue
            val parsed = runCatching { AppJson.decodeFromString(AppData.serializer(), f.readText()) }.getOrNull()
            if (parsed != null) return parsed
        }
        return AppData()
    }
}
