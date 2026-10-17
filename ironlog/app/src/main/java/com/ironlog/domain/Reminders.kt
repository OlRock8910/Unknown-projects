package com.ironlog.domain

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

object Reminders {

    /** Workouts planned for [day] that have nothing saved yet. */
    fun pendingOn(data: AppData, day: LocalDate): List<Workout> =
        data.workoutsOn(day).filter { w ->
            val s = data.sessionFor(w.id, day)
            s == null || s.entries.none { e -> e.sets.any { it.reps > 0 } }
        }

    /**
     * The next moment a reminder should fire, or null if none is due in the coming week.
     * Days with no planned workout are skipped, and so are the rest of today's slots once
     * today's workouts have been logged.
     */
    fun next(data: AppData, now: LocalDateTime): LocalDateTime? {
        val s = data.settings
        if (!s.remindersEnabled || data.workouts.none { it.days.isNotEmpty() }) return null
        val times = s.reminderTimes.filter { it in 0 until 24 * 60 }.sorted().distinct()
        if (times.isEmpty()) return null
        for (offset in 0..7) {
            val day = now.toLocalDate().plusDays(offset.toLong())
            if (data.workoutsOn(day).isEmpty()) continue
            if (offset == 0 && pendingOn(data, day).isEmpty()) continue
            for (t in times) {
                val at = LocalDateTime.of(day, LocalTime.of(t / 60, t % 60))
                if (at.isAfter(now)) return at
            }
        }
        return null
    }

    fun label(w: Workout): String = (w.name + " " + w.emoji).trim()

    fun formatTime(minutes: Int): String = "%02d:%02d".format(minutes / 60, minutes % 60)
}
