package com.ironlog.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.ironlog.data.Store
import com.ironlog.domain.AppData
import com.ironlog.domain.BackupCodec
import com.ironlog.domain.CustomExercise
import com.ironlog.domain.Equipment
import com.ironlog.domain.ExerciseLog
import com.ironlog.domain.ExercisePrefs
import com.ironlog.domain.Motivation
import com.ironlog.domain.Muscle
import com.ironlog.domain.Note
import com.ironlog.domain.ProgressImport
import com.ironlog.domain.activeSession
import com.ironlog.domain.PrKind
import com.ironlog.domain.Profile
import com.ironlog.domain.Session
import com.ironlog.domain.SetEntry
import com.ironlog.domain.Settings
import com.ironlog.domain.Strength
import com.ironlog.domain.Templates
import com.ironlog.domain.WeightUnit
import com.ironlog.domain.Workout
import com.ironlog.domain.detectRecords
import com.ironlog.domain.estimateOneRepMax
import com.ironlog.domain.exercise
import com.ironlog.domain.formatCompact
import com.ironlog.domain.formatSet
import com.ironlog.domain.formatVolume
import com.ironlog.domain.formatWeight
import com.ironlog.domain.history
import com.ironlog.domain.kgTo
import com.ironlog.domain.lastPoint
import com.ironlog.domain.newId
import com.ironlog.domain.stepFor
import com.ironlog.domain.suggestNext
import com.ironlog.domain.label
import com.ironlog.domain.workout
import com.ironlog.ui.platform.Platform
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

sealed interface Screen {
    data object Home : Screen
    data object Progress : Screen
    data object Notes : Screen
    data class WorkoutView(val workoutId: String) : Screen
    data class WorkoutEdit(val workoutId: String?) : Screen
    data class Picker(val targetWorkoutId: String?) : Screen
    data class Logger(val workoutId: String?, val exerciseId: String, val sessionId: String? = null) : Screen
    data class ExerciseStats(val exerciseId: String) : Screen
    data class SessionView(val sessionId: String) : Screen
    data class NoteEdit(val noteId: String?) : Screen
    data object Settings : Screen
    data object ProfileEdit : Screen
    data object Backup : Screen
    data object ImportText : Screen
    data object Onboarding : Screen
}

enum class Tab(val root: Screen) { HOME(Screen.Home), PROGRESS(Screen.Progress), NOTES(Screen.Notes) }

/** The workout being created or edited; lives here so the exercise picker can add to it. */
data class WorkoutDraft(
    val id: String?,
    val name: String = "",
    val emoji: String = "",
    val days: Set<Int> = emptySet(),
    val exerciseIds: List<String> = emptyList(),
    val color: Int = 0,
)

sealed interface Overlay {
    data class Confirm(
        val title: String,
        val message: String,
        val confirmText: String,
        val danger: Boolean = false,
        val cancelText: String = "Cancel",
        /** Runs instead of just closing when the left button is pressed. */
        val onCancel: (() -> Unit)? = null,
        val onConfirm: () -> Unit,
    ) : Overlay
    data class Record(val exerciseName: String, val headline: String, val setText: String, val detail: String, val brag: String?) : Overlay
    data class Finish(val title: String, val stats: List<Pair<String, String>>, val message: String) : Overlay
    data object AddMenu : Overlay
    /** Any bottom sheet a screen wants to show. */
    class Sheet(val content: @Composable () -> Unit) : Overlay
}

data class Banner(val headline: String, val body: String, val id: Long = System.nanoTime())

class AppState(
    val store: Store,
    val platform: Platform,
    private val scope: CoroutineScope,
    private val clock: () -> LocalDateTime = { LocalDateTime.now() },
) {
    val data get() = store.data
    val current: AppData get() = store.current

    fun now(): LocalDateTime = clock()
    fun today(): LocalDate = clock().toLocalDate()
    fun nowMillis(): Long = clock().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    // ---------------------------------------------------------------- navigation

    var stack by mutableStateOf(listOf(if (store.current.onboarded) Screen.Home else Screen.Onboarding))
        private set
    var forward by mutableStateOf(true)
        private set

    val screen: Screen get() = stack.last()
    val tab: Tab? get() = Tab.entries.firstOrNull { it.root == stack.first() }

    /**
     * True for a moment after every navigation. The screen layer ignores touches while it
     * is set, so a double-tap on SAVE can't land on FINISH on the screen sliding in.
     */
    var navBusy by mutableStateOf(false)
        private set
    private var navJob: Job? = null

    private fun markNav() {
        navBusy = true
        navJob?.cancel()
        navJob = scope.launch { delay(380); navBusy = false }
    }

    fun push(s: Screen) {
        forward = true
        stack = stack + s
        markNav()
    }

    /** A reminder or widget tap: show that workout without throwing away what is open. */
    fun openWorkout(id: String) {
        if (!current.onboarded || current.workout(id) == null) return
        if (stack.any { it == Screen.WorkoutView(id) || (it is Screen.Logger && it.workoutId == id) }) return
        if (stack.size == 1 && stack.first() != Screen.Home) selectTab(Tab.HOME)
        push(Screen.WorkoutView(id))
    }

    /** Returns false when already at a tab root (let the system handle back). */
    fun pop(): Boolean {
        if (overlay != null) { overlay = null; return true }
        if (stack.size <= 1) {
            if (stack.first() != Screen.Home && stack.first() != Screen.Onboarding) {
                forward = false
                stack = listOf(Screen.Home)
                markNav()
                return true
            }
            return false
        }
        forward = false
        stack = stack.dropLast(1)
        markNav()
        return true
    }

    fun selectTab(t: Tab) {
        if (stack.size == 1 && stack.first() == t.root) return
        forward = t.ordinal >= (tab?.ordinal ?: 0)
        stack = listOf(t.root)
        markNav()
    }

    private fun resetTo(s: Screen) {
        forward = false
        stack = listOf(s)
        markNav()
    }

    // ---------------------------------------------------------------- overlays

    var overlay by mutableStateOf<Overlay?>(null)
    var banner by mutableStateOf<Banner?>(null)
        private set
    var toast by mutableStateOf<String?>(null)
        private set
    private var bannerJob: Job? = null
    private var toastJob: Job? = null

    fun showToast(text: String) {
        toast = text
        toastJob?.cancel()
        toastJob = scope.launch { delay(2200); toast = null }
    }

    fun showBanner(b: Banner, millis: Long = 6000) {
        banner = b
        bannerJob?.cancel()
        bannerJob = scope.launch { delay(millis); if (banner?.id == b.id) banner = null }
    }

    fun dismissBanner() { banner = null }

    fun confirm(
        title: String,
        message: String,
        confirmText: String,
        danger: Boolean = false,
        cancelText: String = "Cancel",
        onCancel: (() -> Unit)? = null,
        onConfirm: () -> Unit,
    ) {
        overlay = Overlay.Confirm(title, message, confirmText, danger, cancelText, onCancel, onConfirm)
    }

    fun sheet(content: @Composable () -> Unit) { overlay = Overlay.Sheet(content) }

    fun closeOverlay() { overlay = null }

    // ---------------------------------------------------------------- onboarding

    fun finishOnboarding(profile: Profile, unit: WeightUnit, templateId: String?) {
        val template = Templates.all.firstOrNull { it.id == templateId }
        store.update { d ->
            d.copy(
                onboarded = true,
                profile = profile,
                settings = d.settings.copy(unit = unit),
                workouts = if (template != null && d.workouts.isEmpty()) Templates.build(template) else d.workouts,
            )
        }
        resetTo(Screen.Home)
        if (template == null && store.current.workouts.isEmpty()) startWorkoutEditor(null)
    }

    // ---------------------------------------------------------------- workouts

    var draft by mutableStateOf(WorkoutDraft(null))

    fun startWorkoutEditor(workoutId: String?) {
        val w = current.workout(workoutId)
        draft = if (w != null) {
            WorkoutDraft(w.id, w.name, w.emoji, w.days.toSet(), w.exerciseIds, w.color)
        } else {
            WorkoutDraft(null, color = current.workouts.size)
        }
        push(Screen.WorkoutEdit(workoutId))
    }

    fun saveDraft(): Boolean {
        if (screen !is Screen.WorkoutEdit) return false // a second tap while leaving
        val d = draft
        val name = d.name.trim()
        if (name.isEmpty()) {
            showToast("Give the workout a name first")
            return false
        }
        val id = d.id ?: newId()
        val w = Workout(id, name, d.emoji.trim(), d.days.sorted(), d.exerciseIds.distinct(), d.color)
        store.update { data ->
            val exists = data.workouts.any { it.id == id }
            data.copy(workouts = if (exists) data.workouts.map { if (it.id == id) w else it } else data.workouts + w)
        }
        pop()
        showToast(if (d.id == null) "Workout created 💪" else "Workout saved ✓")
        return true
    }

    fun deleteWorkout(id: String) {
        val w = current.workout(id) ?: return
        confirm(
            "Delete ${w.name}?",
            "The workout is removed from your week. Sessions you've already logged stay in your history and graphs.",
            "Delete", danger = true,
        ) {
            store.update { d -> d.copy(workouts = d.workouts.filterNot { it.id == id }) }
            overlay = null
            resetTo(Screen.Home)
            showToast("Workout deleted")
        }
    }

    /** Adds exercises from the picker to either the draft or a saved workout. */
    fun addExercises(targetWorkoutId: String?, ids: List<String>) {
        if (ids.isEmpty()) return
        if (targetWorkoutId == null) {
            draft = draft.copy(exerciseIds = (draft.exerciseIds + ids).distinct())
        } else {
            store.update { d ->
                d.copy(workouts = d.workouts.map { w ->
                    if (w.id == targetWorkoutId) w.copy(exerciseIds = (w.exerciseIds + ids).distinct()) else w
                })
            }
            showToast(if (ids.size == 1) "Exercise added" else "${ids.size} exercises added")
        }
    }

    fun removeExerciseFromWorkout(workoutId: String, exerciseId: String) {
        store.update { d ->
            d.copy(workouts = d.workouts.map { w ->
                if (w.id == workoutId) w.copy(exerciseIds = w.exerciseIds - exerciseId) else w
            })
        }
    }

    fun createCustomExercise(name: String, equipment: Equipment, muscle: Muscle): String {
        val c = CustomExercise("c_" + newId(), name.trim().replaceFirstChar { it.uppercase() }, equipment, muscle)
        store.update { d -> d.copy(customExercises = d.customExercises + c) }
        return c.id
    }

    // ---------------------------------------------------------------- logging

    private val celebrated = HashSet<String>()

    /** Shows "Last week you got 60kg × 12r. TRY 62.5KG!" when an exercise is opened. */
    fun maybeChallenge(exerciseId: String) {
        val d = current
        if (!d.settings.motivationPopups) return
        val info = d.exercise(exerciseId)
        val last = d.history(exerciseId).lastPoint() ?: return
        val top = last.topSet ?: return
        val s = suggestNext(top, stepFor(d, info), d.settings.unit, info.equipment)
        val popup = Motivation.challenge(s, last.date, today(), d.settings.unit, info.equipment)
        showBanner(Banner(popup.headline, popup.body))
    }

    /**
     * Saves one exercise into the workout's active session (creating it on the first save),
     * or into [sessionId] when editing history. An empty list removes the exercise.
     * Returns false when nothing was saved.
     */
    fun saveExercise(workoutId: String?, exerciseId: String, sets: List<SetEntry>, sessionId: String?): Boolean {
        if (screen !is Screen.Logger) return false // a second tap while leaving
        val clean = sets.filter { it.reps > 0 }.map { s -> s.copy(note = s.note?.trim()?.takeIf { it.isNotEmpty() }) }
        val d = current
        val today = today()
        val target: Session? = when {
            sessionId != null -> d.sessions.firstOrNull { it.id == sessionId }
            workoutId != null -> d.activeSession(workoutId, today, nowMillis())
            else -> null
        }
        val hadEntry = target?.entries?.any { it.exerciseId == exerciseId } == true
        if (clean.isEmpty() && !hadEntry) {
            showToast("Nothing to save yet — give a set some reps")
            return false
        }
        val before = d.history(exerciseId, excludeSessionId = target?.id)
        val records = if (target?.imported == true) emptyList() else detectRecords(before, clean)

        store.update { data ->
            val existing = target?.let { t -> data.sessions.firstOrNull { it.id == t.id } }
            if (existing != null) {
                val entries = if (clean.isEmpty()) {
                    existing.entries.filterNot { it.exerciseId == exerciseId }
                } else if (existing.entries.any { it.exerciseId == exerciseId }) {
                    existing.entries.map { if (it.exerciseId == exerciseId) ExerciseLog(exerciseId, clean) else it }
                } else existing.entries + ExerciseLog(exerciseId, clean)
                val updated = existing.copy(entries = entries)
                data.copy(sessions = if (entries.isEmpty() && !existing.imported) data.sessions.filterNot { it.id == existing.id }
                else data.sessions.map { if (it.id == existing.id) updated else it })
            } else if (clean.isNotEmpty()) {
                val w = data.workout(workoutId)
                data.copy(sessions = data.sessions + Session(
                    id = newId(),
                    workoutId = workoutId,
                    workoutName = w?.name ?: "Workout",
                    workoutEmoji = w?.emoji ?: "",
                    date = today.toString(),
                    startedAt = nowMillis(),
                    entries = listOf(ExerciseLog(exerciseId, clean)),
                ))
            } else data
        }
        pop()
        val rec = records.firstOrNull()
        val key = rec?.let { "$exerciseId:${it.kind}:${it.set.weightKg}:${it.set.reps}" }
        if (rec != null && celebrated.add(key!!)) {
            val unit = d.settings.unit
            val info = d.exercise(exerciseId)
            val detail = when (rec.kind) {
                PrKind.WEIGHT -> "Heaviest ever" + (rec.previous?.let { " — beat " + formatWeight(it.weightKg, unit) } ?: "")
                PrKind.E1RM -> "Best estimated 1-rep max: " + formatWeight(estimateOneRepMax(rec.set.weightKg, rec.set.reps), unit)
                PrKind.REPS -> "Most reps ever at this weight" + (rec.previous?.let { " — beat ${it.reps}" } ?: "")
            }
            val brag = if (d.settings.strengthComparisons) Strength.brag(exerciseId, rec.set, d.profile, today) else null
            overlay = Overlay.Record(info.name, Motivation.prLines.random(), formatSet(rec.set, unit, info.equipment), detail, brag)
        } else {
            showToast(
                when {
                    sessionId != null && clean.isEmpty() -> "Removed from this session"
                    sessionId != null -> "Updated ✓"
                    clean.isEmpty() -> "Removed from today"
                    else -> "Saved ✓  ${Motivation.shout()}"
                },
            )
        }
        return true
    }

    /** Deleting a carried-forward note removes it at its source, so it doesn't come back next time. */
    fun deleteCarriedNote(exerciseId: String, note: String) {
        store.update { d ->
            val source = d.sessions
                .filter { s -> s.entries.any { e -> e.exerciseId == exerciseId && e.sets.any { it.note == note } } }
                .maxWithOrNull(compareBy({ it.date ?: "" }, { it.startedAt })) ?: return@update d
            d.copy(sessions = d.sessions.map { s ->
                if (s.id != source.id) s else s.copy(entries = s.entries.map { e ->
                    if (e.exerciseId != exerciseId) e
                    else e.copy(sets = e.sets.map { st -> if (st.note == note) st.copy(note = null) else st })
                })
            })
        }
    }

    fun finishWorkout(workoutId: String) {
        if (screen !is Screen.WorkoutView) return
        val d = current
        val s = d.activeSession(workoutId, today(), nowMillis())
        val w = d.workout(workoutId)
        resetTo(Screen.Home)
        if (s == null || s.entries.isEmpty()) {
            showToast("Nothing logged yet — save an exercise first")
            return
        }
        val sets = s.entries.flatMap { it.sets }
        val volume = sets.sumOf { it.weightKg * it.reps }
        val unit = d.settings.unit
        overlay = Overlay.Finish(
            title = "${w?.name ?: s.workoutName} ${w?.emoji ?: s.workoutEmoji}".trim(),
            stats = listOf(
                "Exercises" to s.entries.size.toString(),
                "Sets" to sets.size.toString(),
                "Reps" to sets.sumOf { it.reps }.toString(),
                "Volume" to formatVolume(volume, unit),
            ),
            message = Motivation.finishLines.random(),
        )
    }

    fun deleteSession(id: String) {
        confirm("Delete this session?", "Its sets are removed from your history and graphs. This can't be undone.", "Delete", danger = true) {
            store.update { d -> d.copy(sessions = d.sessions.filterNot { it.id == id }) }
            overlay = null
            pop()
            showToast("Session deleted")
        }
    }

    fun setStep(exerciseId: String, step: Double) {
        store.update { d ->
            val prev = d.exercisePrefs[exerciseId] ?: ExercisePrefs()
            val next = if (d.settings.unit == WeightUnit.KG) prev.copy(stepKg = step) else prev.copy(stepLb = step)
            d.copy(exercisePrefs = d.exercisePrefs + (exerciseId to next))
        }
    }

    fun setPerSide(exerciseId: String, on: Boolean) {
        store.update { d ->
            val prev = d.exercisePrefs[exerciseId] ?: ExercisePrefs()
            d.copy(exercisePrefs = d.exercisePrefs + (exerciseId to prev.copy(perSide = on)))
        }
    }

    // ---------------------------------------------------------------- notes

    fun saveNote(id: String?, title: String, body: String, pinned: Boolean) {
        if (screen !is Screen.NoteEdit) return
        val t = title.trim().ifEmpty { body.trim().lineSequence().firstOrNull()?.take(40) ?: "" }
        if (t.isEmpty() && body.isBlank()) {
            pop()
            return
        }
        val now = nowMillis()
        store.update { d ->
            val existing = d.notes.firstOrNull { it.id == id }
            val note = existing?.copy(title = t, body = body.trimEnd(), updatedAt = now, pinned = pinned)
                ?: Note(newId(), t, body.trimEnd(), now, now, pinned)
            d.copy(notes = if (existing != null) d.notes.map { if (it.id == id) note else it } else d.notes + note)
        }
        pop()
        showToast("Note saved ✓")
    }

    fun deleteNote(id: String) {
        confirm("Delete this note?", "This can't be undone.", "Delete", danger = true) {
            store.update { d -> d.copy(notes = d.notes.filterNot { it.id == id }) }
            overlay = null
            pop()
            showToast("Note deleted")
        }
    }

    // ---------------------------------------------------------------- settings & data

    fun updateSettings(f: (Settings) -> Settings) = store.update { it.copy(settings = f(it.settings)) }
    fun updateProfile(f: (Profile) -> Profile) = store.update { it.copy(profile = f(it.profile)) }

    fun backupCode(): String = BackupCodec.encode(current)

    /** Returns an error message, or null after a successful restore. */
    fun restore(code: String, onDone: () -> Unit = {}): String? {
        return when (val r = BackupCodec.decode(code)) {
            is BackupCodec.Result.Error -> r.message
            is BackupCodec.Result.Ok -> {
                // A code that carries no profile or settings (e.g. a program written up for
                // someone) must not blank out the ones already on this phone.
                val keepProfile = r.data.profile == Profile()
                val keepSettings = r.data.settings == Settings()
                val incoming = r.data.copy(
                    onboarded = true,
                    profile = if (keepProfile) current.profile else r.data.profile,
                    settings = if (keepSettings) current.settings else r.data.settings,
                )
                val sessions = incoming.sessions.count { it.date != null }
                val kept = listOfNotNull("profile".takeIf { keepProfile }, "settings".takeIf { keepSettings })
                confirm(
                    "Restore this backup?",
                    "It has ${incoming.workouts.size} workouts, $sessions sessions and ${incoming.notes.size} notes. " +
                        "Your workouts, history and notes on this phone are replaced by it." +
                        if (kept.isNotEmpty()) " Your ${kept.joinToString(" and ")} stay as they are." else "",
                    "Restore",
                ) {
                    store.replace(incoming)
                    // A restored phone has not granted notifications yet; ask, so reminders work.
                    if (incoming.settings.remindersEnabled && !platform.notificationsAllowed()) {
                        platform.requestNotifications { }
                    }
                    overlay = null
                    resetTo(Screen.Home)
                    showToast("Backup restored ✓")
                    onDone()
                }
                null
            }
        }
    }

    fun applyImport(lines: List<ProgressImport.Line>) {
        if (screen != Screen.ImportText) return
        var result: ProgressImport.Applied? = null
        store.update { d -> ProgressImport.apply(d, lines).also { result = it }.data }
        val r = result ?: return
        pop()
        val parts = buildList {
            add("${r.sets} sets added")
            if (r.sessions > 0) add("${r.sessions} dated sessions")
            if (r.undatedLines > 0) add("${r.undatedLines} lines without a date (kept off graphs)")
        }
        showToast(parts.joinToString(" · "))
    }

    fun deleteEverything() {
        confirm(
            "Delete ALL data?",
            "Every workout, session, note and setting on this phone is erased. Copy a backup code first if you might want it back.",
            "Erase everything", danger = true,
        ) {
            store.replace(AppData())
            overlay = null
            resetTo(Screen.Onboarding)
        }
    }

    fun exerciseNameOf(id: String) = current.exercise(id).name
}

val DAY_SHORT = listOf("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
val DAY_LONG = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")

fun daysLabel(days: List<Int>): String = when {
    days.isEmpty() -> "ANY DAY"
    days.size == 7 -> "EVERY DAY"
    else -> days.sorted().joinToString(" · ") { DAY_SHORT[it - 1] }
}
