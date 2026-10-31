package com.ironlog.domain

import kotlinx.serialization.Serializable
import java.time.LocalDate
import kotlin.random.Random

// Everything the app knows lives in one AppData value. It is small enough to keep in
// memory and write out as a single file, and the same value is what a backup code holds.

@Serializable
enum class WeightUnit { KG, LB }

@Serializable
enum class ThemeMode { GYM, DARK, LIGHT, MONO }

@Serializable
enum class Sex { MALE, FEMALE, UNSPECIFIED }

@Serializable
enum class Equipment(val label: String) {
    BARBELL("Barbell"),
    DUMBBELL("Dumbbell"),
    MACHINE("Machine"),
    CABLE("Cable"),
    SMITH("Smith machine"),
    KETTLEBELL("Kettlebell"),
    BODYWEIGHT("Bodyweight"),
    BAND("Band"),
    OTHER("Other"),
}

@Serializable
enum class Muscle(val label: String) {
    CHEST("Chest"),
    BACK("Back"),
    SHOULDERS("Shoulders"),
    BICEPS("Biceps"),
    TRICEPS("Triceps"),
    FOREARMS("Forearms"),
    QUADS("Quads"),
    HAMSTRINGS("Hamstrings"),
    GLUTES("Glutes"),
    CALVES("Calves"),
    ABS("Abs"),
    FULL_BODY("Full body"),
}

@Serializable
data class Profile(
    val name: String = "",
    /** ISO yyyy-MM-dd. */
    val birthday: String? = null,
    val heightCm: Double? = null,
    val bodyweightKg: Double? = null,
    val sex: Sex = Sex.UNSPECIFIED,
)

@Serializable
data class Settings(
    val unit: WeightUnit = WeightUnit.KG,
    val theme: ThemeMode = ThemeMode.GYM,
    /** Index into the one-colour palette, used when [theme] is MONO. */
    val monoColor: Int = 0,
    val remindersEnabled: Boolean = true,
    /** Minutes after midnight. Two or three entries. */
    val reminderTimes: List<Int> = listOf(8 * 60 + 30, 13 * 60, 18 * 60),
    val motivationPopups: Boolean = true,
    val strengthComparisons: Boolean = true,
)

@Serializable
data class CustomExercise(
    val id: String,
    val name: String,
    val equipment: Equipment = Equipment.OTHER,
    val muscle: Muscle = Muscle.FULL_BODY,
)

@Serializable
data class Workout(
    val id: String,
    val name: String,
    val emoji: String = "",
    /** ISO days of week, 1 = Monday … 7 = Sunday. Drives reminders and the "today" card. */
    val days: List<Int> = emptyList(),
    val exerciseIds: List<String> = emptyList(),
    /** Index into the accent palette. */
    val color: Int = 0,
)

@Serializable
data class SetEntry(
    /** Always stored in kilograms; converted for display. For bodyweight moves this is added weight. */
    val weightKg: Double = 0.0,
    val reps: Int = 0,
    /** The per-set note ("check form", "rest 2 min"). Carried forward until deleted. */
    val note: String? = null,
    /** Left and right counts for single-arm / single-leg moves; null for an ordinary set.
     *  [reps] still holds one number for records and graphs (see [withSides]). */
    val left: Int? = null,
    val right: Int? = null,
) {
    val perSide: Boolean get() = left != null && right != null
}

/**
 * A set counted per side. [SetEntry.reps] becomes the weaker side, so "60kg × 8" on a
 * graph means 8 on both sides; if only one side was done it's that side's count.
 */
fun SetEntry.withSides(left: Int, right: Int): SetEntry =
    copy(left = left, right = right, reps = if (left > 0 && right > 0) minOf(left, right) else maxOf(left, right))

/** The set in the shape the exercise logs: split into left/right (both = reps) or back to one count. */
fun SetEntry.asPerSide(on: Boolean): SetEntry = when {
    on && !perSide -> withSides(reps, reps)
    !on && perSide -> copy(left = null, right = null)
    else -> this
}

@Serializable
data class ExerciseLog(
    val exerciseId: String,
    val sets: List<SetEntry> = emptyList(),
)

@Serializable
data class Session(
    val id: String,
    val workoutId: String? = null,
    val workoutName: String = "",
    val workoutEmoji: String = "",
    /** ISO yyyy-MM-dd. Null for imported history that came without a date: it is kept and
     *  shown, but never plotted or counted, so it cannot fake a jump on a graph. */
    val date: String? = null,
    /** Epoch millis of the first save, for ordering two sessions on the same day. */
    val startedAt: Long = 0,
    val entries: List<ExerciseLog> = emptyList(),
    val imported: Boolean = false,
) {
    val localDate: LocalDate? get() = date?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
}

@Serializable
data class Note(
    val id: String,
    val title: String,
    val body: String = "",
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    val pinned: Boolean = false,
)

/** Per-exercise overrides for the +/- step, one per unit so switching units never mixes them. */
@Serializable
data class ExercisePrefs(
    val stepKg: Double? = null,
    val stepLb: Double? = null,
    /** Log left and right reps separately. Null means the default for the exercise. */
    val perSide: Boolean? = null,
)

@Serializable
data class AppData(
    val schema: Int = 1,
    val onboarded: Boolean = false,
    val profile: Profile = Profile(),
    val settings: Settings = Settings(),
    val customExercises: List<CustomExercise> = emptyList(),
    val workouts: List<Workout> = emptyList(),
    val sessions: List<Session> = emptyList(),
    val notes: List<Note> = emptyList(),
    val exercisePrefs: Map<String, ExercisePrefs> = emptyMap(),
)

private const val ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"

fun newId(random: Random = Random.Default): String =
    buildString { repeat(12) { append(ID_CHARS[random.nextInt(ID_CHARS.length)]) } }

/** A resolved exercise: either from the built-in library or one the user created. */
data class ExerciseInfo(
    val id: String,
    val name: String,
    val equipment: Equipment,
    val muscle: Muscle,
    val aliases: String = "",
    val custom: Boolean = false,
)

fun AppData.exercise(id: String): ExerciseInfo =
    ExerciseLibrary.byId[id]
        ?: customExercises.firstOrNull { it.id == id }?.let {
            ExerciseInfo(it.id, it.name, it.equipment, it.muscle, custom = true)
        }
        ?: ExerciseInfo(id, "Unknown exercise", Equipment.OTHER, Muscle.FULL_BODY, custom = true)

fun AppData.allExercises(): List<ExerciseInfo> =
    ExerciseLibrary.all + customExercises.map {
        ExerciseInfo(it.id, it.name, it.equipment, it.muscle, custom = true)
    }

/** Whether [exercise] logs left and right reps: the user's choice, else on for one-arm / one-leg moves. */
fun AppData.isPerSide(exercise: ExerciseInfo): Boolean =
    exercisePrefs[exercise.id]?.perSide ?: ExerciseLibrary.isUnilateral(exercise)

fun AppData.workout(id: String?): Workout? = id?.let { wid -> workouts.firstOrNull { it.id == wid } }

/** Dated sessions, oldest first. */
fun AppData.datedSessions(): List<Session> =
    sessions.filter { it.localDate != null }.sortedWith(compareBy({ it.date }, { it.startedAt }))

/** The session for [workoutId] on [day], if one has been started. */
fun AppData.sessionFor(workoutId: String, day: LocalDate): Session? =
    sessions.firstOrNull { it.workoutId == workoutId && it.date == day.toString() && !it.imported }

/**
 * The session a workout is currently being logged into: today's, or one started in the
 * last few hours, so a workout that runs past midnight stays one session.
 */
fun AppData.activeSession(workoutId: String, day: LocalDate, nowMillis: Long): Session? =
    sessionFor(workoutId, day)
        ?: sessions.filter { it.workoutId == workoutId && !it.imported && it.startedAt > 0 && nowMillis - it.startedAt in 0..ACTIVE_WINDOW_MS }
            .maxByOrNull { it.startedAt }

private const val ACTIVE_WINDOW_MS = 5L * 60 * 60 * 1000

fun AppData.workoutsOn(day: LocalDate): List<Workout> =
    workouts.filter { day.dayOfWeek.value in it.days }

fun Profile.ageOn(day: LocalDate): Int? {
    val b = birthday?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
    return java.time.Period.between(b, day).years.takeIf { it in 5..110 }
}
