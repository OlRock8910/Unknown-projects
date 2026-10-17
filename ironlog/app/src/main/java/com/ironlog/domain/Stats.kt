package com.ironlog.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.max
import kotlin.math.min

enum class Metric(val label: String, val short: String) {
    TOP_WEIGHT("Heaviest set", "Weight"),
    E1RM("Estimated 1-rep max", "1RM"),
    VOLUME("Volume (weight × reps)", "Volume"),
    REPS("Most reps in a set", "Reps"),
}

enum class Range(val label: String, val days: Long?) {
    W1("1W", 7), M1("1M", 30), M3("3M", 91), M6("6M", 182), Y1("1Y", 365), ALL("ALL", null);

    val longLabel: String
        get() = when (this) {
            W1 -> "last week"; M1 -> "last month"; M3 -> "last 3 months"
            M6 -> "last 6 months"; Y1 -> "last year"; ALL -> "lifetime"
        }
}

/** Epley, with reps capped so a 40-rep set does not claim a silly max. */
fun estimateOneRepMax(weightKg: Double, reps: Int): Double = when {
    reps <= 0 || weightKg <= 0 -> 0.0
    reps == 1 -> weightKg
    else -> weightKg * (1 + min(reps, 20) / 30.0)
}

/** One exercise in one session, reduced to the numbers the graphs need. */
data class ExercisePoint(
    val date: LocalDate?,
    val sessionId: String,
    val sets: List<SetEntry>,
) {
    private val working = sets.filter { it.reps > 0 }
    val topWeightKg: Double = working.maxOfOrNull { it.weightKg } ?: 0.0
    val e1rmKg: Double = working.maxOfOrNull { estimateOneRepMax(it.weightKg, it.reps) } ?: 0.0
    val volumeKg: Double = working.sumOf { it.weightKg * it.reps }
    val bestReps: Int = working.maxOfOrNull { it.reps } ?: 0
    val totalReps: Int = working.sumOf { it.reps }
    val setCount: Int = working.size

    /** The set that best represents the session: heaviest, then most reps at that weight. */
    val topSet: SetEntry? = working.maxWithOrNull(compareBy({ it.weightKg }, { it.reps }))

    fun value(metric: Metric): Double = when (metric) {
        Metric.TOP_WEIGHT -> topWeightKg
        Metric.E1RM -> e1rmKg
        Metric.VOLUME -> volumeKg
        Metric.REPS -> bestReps.toDouble()
    }
}

data class ExerciseHistory(
    /** Dated sessions, oldest first. */
    val dated: List<ExercisePoint>,
    /** Imported without a date: listed and counted towards records, never plotted. */
    val undated: List<ExercisePoint>,
) {
    val all: List<ExercisePoint> get() = dated + undated
    val isEmpty: Boolean get() = dated.isEmpty() && undated.isEmpty()
}

fun AppData.history(exerciseId: String, excludeSessionId: String? = null): ExerciseHistory {
    val dated = ArrayList<ExercisePoint>()
    val undated = ArrayList<ExercisePoint>()
    for (s in sessions.sortedWith(compareBy({ it.date ?: "" }, { it.startedAt }))) {
        if (s.id == excludeSessionId) continue
        for (e in s.entries) {
            if (e.exerciseId != exerciseId || e.sets.none { it.reps > 0 }) continue
            val p = ExercisePoint(s.localDate, s.id, e.sets)
            if (p.date != null) dated += p else undated += p
        }
    }
    return ExerciseHistory(dated, undated)
}

/** The sets to prefill when this exercise is opened: the latest dated session, else imported history. */
fun ExerciseHistory.lastSets(): List<SetEntry>? = (dated.lastOrNull() ?: undated.lastOrNull())?.sets

fun ExerciseHistory.lastPoint(): ExercisePoint? = dated.lastOrNull() ?: undated.lastOrNull()

/** Graph points inside [range], merged to one per day so two sessions on a day don't zig-zag. */
fun ExerciseHistory.series(metric: Metric, range: Range, today: LocalDate): List<Pair<LocalDate, Double>> {
    val from = range.days?.let { today.minusDays(it) }
    return dated
        .filter { p -> from == null || !p.date!!.isBefore(from) }
        .groupBy { it.date!! }
        .map { (day, pts) ->
            day to when (metric) {
                Metric.VOLUME -> pts.sumOf { it.volumeKg }
                else -> pts.maxOf { it.value(metric) }
            }
        }
        .filter { it.second > 0 }
        .sortedBy { it.first }
}

data class Change(val from: Double, val to: Double, val sinceLabel: String) {
    val percent: Double get() = if (from == 0.0) 0.0 else (to - from) / from * 100.0
}

/**
 * "You've increased 10% since last month": the most recent session against the last
 * session that is at least a month old. With no month-old session yet, it compares with
 * the first session ever, and says so.
 */
fun ExerciseHistory.changeSinceLastMonth(metric: Metric, today: LocalDate): Change? {
    if (dated.size < 2) return null
    val monthAgo = today.minusDays(30)
    // Nothing in the last month means there is no "since last month" to talk about.
    if (!dated.last().date!!.isAfter(monthAgo)) return null
    val latest = dated.last().value(metric)
    val base = dated.lastOrNull { !it.date!!.isAfter(monthAgo) }
    return if (base != null) {
        Change(base.value(metric), latest, "since last month").takeIf { it.from > 0 }
    } else {
        val first = dated.first()
        val days = ChronoUnit.DAYS.between(first.date, today)
        val label = when {
            days <= 1 -> "since yesterday"
            days < 7 -> "in $days days"
            days < 14 -> "since last week"
            else -> "in ${days / 7} weeks"
        }
        Change(first.value(metric), latest, label).takeIf { it.from > 0 }
    }
}

/** First vs last point of a plotted series. */
fun rangeChange(series: List<Pair<LocalDate, Double>>, range: Range): Change? {
    if (series.size < 2) return null
    val from = series.first().second
    if (from <= 0) return null
    return Change(from, series.last().second, "over the ${range.longLabel}")
}

data class Records(
    val heaviest: SetEntry?,
    val bestE1rmKg: Double,
    val bestE1rmSet: SetEntry?,
    val mostReps: SetEntry?,
    val bestVolumeKg: Double,
)

fun ExerciseHistory.records(): Records {
    val sets = all.flatMap { it.sets }.filter { it.reps > 0 }
    // Unweighted bodyweight sets have no 1RM; leave it empty rather than picking the oldest set.
    val bestE1rmSet = sets.filter { it.weightKg > 0 }.maxByOrNull { estimateOneRepMax(it.weightKg, it.reps) }
    return Records(
        heaviest = sets.maxWithOrNull(compareBy({ it.weightKg }, { it.reps })),
        bestE1rmKg = bestE1rmSet?.let { estimateOneRepMax(it.weightKg, it.reps) } ?: 0.0,
        bestE1rmSet = bestE1rmSet,
        mostReps = sets.maxWithOrNull(compareBy({ it.reps }, { it.weightKg })),
        bestVolumeKg = all.maxOfOrNull { it.volumeKg } ?: 0.0,
    )
}

enum class PrKind { WEIGHT, E1RM, REPS }

data class PersonalRecord(val kind: PrKind, val set: SetEntry, val previous: SetEntry?)

/**
 * What a just-saved set list beats. Compared against everything before it, including
 * undated imports, so re-entering an old lift from another app is not a "new PR".
 * Nothing counts as a PR the first time an exercise is ever logged.
 */
fun detectRecords(before: ExerciseHistory, newSets: List<SetEntry>): List<PersonalRecord> {
    if (before.isEmpty) return emptyList()
    val prev = before.records()
    val working = newSets.filter { it.reps > 0 }
    if (working.isEmpty()) return emptyList()
    val out = ArrayList<PersonalRecord>()
    val heaviest = working.maxWith(compareBy({ it.weightKg }, { it.reps }))
    if (heaviest.weightKg > 0 && heaviest.weightKg > (prev.heaviest?.weightKg ?: 0.0) + 1e-6) {
        out += PersonalRecord(PrKind.WEIGHT, heaviest, prev.heaviest)
    }
    val bestE = working.maxBy { estimateOneRepMax(it.weightKg, it.reps) }
    if (out.isEmpty() && estimateOneRepMax(bestE.weightKg, bestE.reps) > prev.bestE1rmKg + 1e-6 && bestE.weightKg > 0) {
        out += PersonalRecord(PrKind.E1RM, bestE, prev.bestE1rmSet)
    }
    // Reps PR: more reps than ever at this weight or heavier (covers bodyweight moves).
    if (out.isEmpty()) {
        val allPrev = before.all.flatMap { it.sets }.filter { it.reps > 0 }
        val repPr = working.firstOrNull { s ->
            val bestAtOrAbove = allPrev.filter { it.weightKg >= s.weightKg - 1e-6 }.maxOfOrNull { it.reps } ?: 0
            s.reps > bestAtOrAbove && allPrev.isNotEmpty()
        }
        if (repPr != null) {
            out += PersonalRecord(PrKind.REPS, repPr, allPrev.filter { it.weightKg >= repPr.weightKg - 1e-6 }.maxByOrNull { it.reps })
        }
    }
    return out
}

data class Overview(
    val lifetimeSessions: Int,
    val thisWeek: Int,
    val thisMonth: Int,
    val weekStreak: Int,
    val totalSets: Int,
    val totalVolumeKg: Double,
)

fun AppData.overview(today: LocalDate): Overview {
    val dated = datedSessions().filter { s -> s.entries.any { e -> e.sets.any { it.reps > 0 } } }
    val weekStart = today.minusDays((today.dayOfWeek.value - 1).toLong())
    val days = dated.mapNotNull { it.localDate }
    val weeks = days.map { it.minusDays((it.dayOfWeek.value - 1).toLong()) }.toSet()
    // Consecutive weeks with at least one session, counting back from this week (or last
    // week, so the streak does not read 0 every Monday morning).
    var streak = 0
    var w = if (weekStart in weeks) weekStart else weekStart.minusWeeks(1)
    while (w in weeks) { streak++; w = w.minusWeeks(1) }
    val sets = dated.flatMap { s -> s.entries.flatMap { e -> e.sets.filter { it.reps > 0 } } }
    return Overview(
        lifetimeSessions = dated.size,
        thisWeek = days.count { !it.isBefore(weekStart) && !it.isAfter(today) },
        thisMonth = days.count { it.year == today.year && it.month == today.month },
        weekStreak = streak,
        totalSets = sets.size,
        totalVolumeKg = sets.sumOf { it.weightKg * it.reps },
    )
}

/** How many dated sessions included this exercise. */
fun ExerciseHistory.timesDone(): Int = dated.map { it.sessionId }.distinct().size

/** Default metric: bodyweight moves done without added weight are tracked by reps. */
fun ExerciseHistory.defaultMetric(): Metric =
    if (all.isNotEmpty() && all.all { it.topWeightKg == 0.0 }) Metric.REPS else Metric.TOP_WEIGHT

fun niceAxis(minV: Double, maxV: Double, ticks: Int = 4): Triple<Double, Double, Double> {
    var lo = minV
    var hi = maxV
    if (hi - lo < 1e-9) { lo -= max(1.0, lo * 0.1); hi += max(1.0, hi * 0.1) }
    val rawStep = (hi - lo) / ticks
    val mag = Math.pow(10.0, Math.floor(Math.log10(rawStep)))
    val step = listOf(1.0, 2.0, 2.5, 5.0, 10.0).map { it * mag }.first { it >= rawStep }
    val start = Math.floor(lo / step) * step
    val end = Math.ceil(hi / step) * step
    return Triple(if (minV >= 0) max(0.0, start) else start, end, step)
}
