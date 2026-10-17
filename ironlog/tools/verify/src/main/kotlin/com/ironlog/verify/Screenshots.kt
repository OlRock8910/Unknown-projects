package com.ironlog.verify

import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.unit.Density
import androidx.compose.ui.use
import com.ironlog.data.Store
import com.ironlog.domain.AppData
import com.ironlog.domain.ExerciseLog
import com.ironlog.domain.Note
import com.ironlog.domain.Profile
import com.ironlog.domain.Session
import com.ironlog.domain.SetEntry
import com.ironlog.domain.Sex
import com.ironlog.domain.Templates
import com.ironlog.domain.ThemeMode
import com.ironlog.ui.AppState
import com.ironlog.ui.Banner
import com.ironlog.ui.IronLogApp
import com.ironlog.ui.Overlay
import com.ironlog.ui.Screen
import com.ironlog.ui.Tab
import com.ironlog.ui.platform.Platform
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.jetbrains.skia.EncodedImageFormat
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import kotlin.random.Random

/**
 * Renders the app's screens to PNG with realistic sample data, so the layout and the
 * glass look can be checked without a phone. Output: build/screens/.
 */

private object FakePlatform : Platform {
    override val appVersion = "1.0 (preview)"
    override fun copyText(text: String) {}
    override fun pasteText(): String? = null
    override fun shareText(subject: String, text: String) {}
    override fun saveTextFile(suggestedName: String, text: String, onDone: (Boolean) -> Unit) = onDone(false)
    override fun openTextFile(onResult: (String?) -> Unit) = onResult(null)
    override fun notificationsAllowed() = true
    override fun requestNotifications(onResult: (Boolean) -> Unit) = onResult(true)
    override fun setSystemBarsDark(dark: Boolean) {}
}

val NOW: LocalDateTime = LocalDateTime.of(2026, 10, 19, 17, 40) // a Monday

fun sampleData(theme: ThemeMode = ThemeMode.GYM, mono: Int = 0): AppData {
    val rnd = Random(7)
    val workouts = Templates.build(Templates.all.first()).mapIndexed { i, w -> w.copy(id = "w$i") }
    val start = LocalDate.of(2026, 3, 30)
    val sessions = ArrayList<Session>()
    var day = start
    var n = 0
    val base = mapOf(
        "bench_press" to 50.0, "db_incline_bench" to 16.0, "seated_db_press" to 12.0, "lateral_raise" to 6.0,
        "tricep_pushdown" to 20.0, "overhead_cable_ext" to 15.0, "lat_pulldown" to 40.0, "barbell_row" to 40.0,
        "cable_row" to 35.0, "face_pull" to 15.0, "db_curl" to 8.0, "hammer_curl" to 10.0, "squat" to 60.0,
        "leg_press" to 100.0, "rdl" to 50.0, "leg_extension" to 30.0, "lying_leg_curl" to 25.0, "standing_calf_raise" to 40.0,
    )
    while (day < NOW.toLocalDate()) {
        val w = workouts.firstOrNull { day.dayOfWeek.value in it.days }
        if (w != null && rnd.nextInt(10) < 9) {
            val weeks = java.time.temporal.ChronoUnit.WEEKS.between(start, day).toDouble()
            val entries = w.exerciseIds.filter { rnd.nextInt(10) < 9 }.map { id ->
                val b = base[id] ?: 20.0
                val step = if (b >= 40) 2.5 else 1.0
                val top = Math.round((b * (1 + weeks * 0.018)) / step) * step
                val sets = List(3) { k ->
                    SetEntry(top - if (k == 2) step else 0.0, 12 - k * 2 - rnd.nextInt(2), note = if (id == "bench_press" && k == 0) "Pause at the bottom" else null)
                }
                ExerciseLog(id, sets)
            }
            sessions += Session("s${n++}", w.id, w.name, w.emoji, day.toString(), n.toLong(), entries)
        }
        day = day.plusDays(1)
    }
    sessions += Session("imp", workoutName = "Imported (no date)", workoutEmoji = "📥", imported = true,
        entries = listOf(ExerciseLog("bench_press", listOf(SetEntry(45.0, 10), SetEntry(45.0, 8)))))
    return AppData(
        onboarded = true,
        profile = Profile(name = "Alex", birthday = "2008-04-12", sex = Sex.MALE, heightCm = 178.0, bodyweightKg = 70.0),
        settings = com.ironlog.domain.Settings(theme = theme, monoColor = mono),
        workouts = workouts,
        sessions = sessions,
        notes = listOf(
            Note("n1", "Bench press PR 🏆", "72.5kg × 6 on 12 Oct\nNext goal: 80kg by Christmas", 1, 1_790_000_000_000, pinned = true),
            Note("n2", "Leg day notes", "Leg press seat on notch 4. Squat — knees out, brace hard.", 1, 1_789_000_000_000),
            Note("n3", "Goals 2027", "• Bench 100kg\n• 15 pull-ups\n• Never miss a Monday", 1, 1_788_000_000_000),
        ),
    )
}

fun main() {
    val out = File("build/screens").apply { mkdirs() }
    val tmp = File("build/screens-data").apply { deleteRecursively(); mkdirs() }
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    var counter = 0

    fun shot(name: String, data: AppData, setup: (AppState) -> Unit = {}) {
        val store = Store(File(tmp, "d${counter++}.json"), scope)
        store.replace(data)
        val app = AppState(store, FakePlatform, scope) { NOW }
        setup(app)
        val w = 412
        val h = 892
        val density = 2f
        ImageComposeScene((w * density).toInt(), (h * density).toInt(), Density(density)) {
            IronLogApp(app)
        }.use { scene ->
            var t = 0L
            // A handful of frames 120ms apart lets entry animations settle (well inside the
            // banner's 6 s real-time timeout).
            repeat(12) { scene.render(t); t += 120_000_000L }
            Thread.sleep(100)
            val img = scene.render(t + 100_000_000L)

            File(out, "$name.png").writeBytes(img.encodeToData(EncodedImageFormat.PNG)!!.bytes)
        }
        println("rendered $name")
    }

    // gradle screenshots -Pdata=/path/to/data.json renders a few screens with real data instead.
    System.getProperty("ironlog.data")?.takeIf { it.isNotBlank() }?.let { path ->
        val real = com.ironlog.domain.AppJson.decodeFromString(AppData.serializer(), File(path).readText())
        shot("data-home", real)
        real.workouts.forEach { w ->
            shot("data-workout-${w.id}", real) { it.push(Screen.WorkoutView(w.id)) }
        }
        real.workouts.firstOrNull()?.let { w ->
            w.exerciseIds.take(3).forEach { e -> shot("data-logger-$e", real) { it.push(Screen.WorkoutView(w.id)); it.push(Screen.Logger(w.id, e)) } }
        }
        shot("data-notes", real) { it.selectTab(Tab.NOTES) }
        shot("data-progress", real) { it.selectTab(Tab.PROGRESS) }
        scope.cancel()
        System.exit(0)
    }

    val gym = sampleData()
    shot("01-home", gym)
    shot("02-workout", gym) { it.push(Screen.WorkoutView("w0")) }
    shot("03-logger", gym) { it.push(Screen.WorkoutView("w0")); it.push(Screen.Logger("w0", "bench_press")) }
    shot("04-progress", gym) { it.selectTab(Tab.PROGRESS) }
    shot("05-stats", gym) { it.selectTab(Tab.PROGRESS); it.push(Screen.ExerciseStats("bench_press")) }
    shot("06-notes", gym) { it.selectTab(Tab.NOTES) }
    shot("07-settings", gym) { it.push(Screen.Settings) }
    shot("08-editor", gym) { it.startWorkoutEditor("w2") }
    shot("09-picker", gym) { it.startWorkoutEditor("w2"); it.push(Screen.Picker(null)) }
    shot("10-pr", gym) {
        it.overlay = Overlay.Record("Bench Press", "NEW PR! 🏆 Absolute unit.", "75kg × 6", "Heaviest ever — beat 72.5kg", "Only 4% of boys your age can do this 💪 (est.)")
    }
    shot("11-onboarding", AppData())
    shot("12-dark-home", sampleData(ThemeMode.DARK))
    shot("13-light-home", sampleData(ThemeMode.LIGHT))
    shot("14-light-stats", sampleData(ThemeMode.LIGHT)) { it.selectTab(Tab.PROGRESS); it.push(Screen.ExerciseStats("squat")) }
    shot("15-history", gym) { it.selectTab(Tab.PROGRESS) ; }
    shot("16-backup", gym) { it.push(Screen.Settings); it.push(Screen.Backup) }
    shot("17-import", gym) { it.push(Screen.ImportText) }
    shot("18-addmenu", gym) { it.overlay = Overlay.AddMenu }
    shot("19-banner", gym) { it.showBanner(Banner("TIME TO GO UP 📈", "Last week you got 60kg × 12r. TRY 62.5KG! NO PAIN NO GAIN!")) }
    shot("20-finish", gym) {
        it.overlay = Overlay.Finish("Push day 💪", listOf("Exercises" to "6", "Sets" to "18", "Reps" to "176", "Volume" to "7.2kkg"), "Workout done ✅ Rest, eat, grow.")
    }
    shot("21-mono-white-home", sampleData(ThemeMode.MONO, 0))
    shot("22-mono-red-stats", sampleData(ThemeMode.MONO, 3)) { it.selectTab(Tab.PROGRESS); it.push(Screen.ExerciseStats("bench_press")) }
    shot("23-mono-settings", sampleData(ThemeMode.MONO, 0)) { it.push(Screen.Settings) }
    shot("24-mono-white-logger", sampleData(ThemeMode.MONO, 0)) { it.push(Screen.WorkoutView("w0")); it.push(Screen.Logger("w0", "bench_press")) }
    scope.cancel()
    System.exit(0)
}

private fun CoroutineScope.cancel() = (coroutineContext[kotlinx.coroutines.Job])?.cancel()
