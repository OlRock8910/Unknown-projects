package com.ironlog.domain

import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Turns progress typed (or pasted from another app) as plain text into sessions:
 *
 *   Bench press 60kg x 12, 10, 8
 *   Squat 5x5 @ 80kg
 *   12/09/2026
 *   Leg press 120 x 12
 *   Pull ups 3x10
 *
 * A date on a line of its own (or at the start of a line) applies to the lines after it.
 * Lines before any date are imported WITHOUT a date: they show up in history and count
 * as your records, but never appear on graphs, so a year of old lifts can't make the
 * chart look like you improved overnight. A line that just says "no date" switches back
 * to undated.
 */
object ProgressImport {

    data class Line(
        val lineNo: Int,
        val raw: String,
        val date: LocalDate?,
        val name: String,
        val exercise: ExerciseInfo?,
        val sets: List<SetEntry>,
        val problem: String? = null,
    ) {
        val ok: Boolean get() = problem == null && sets.isNotEmpty()
    }

    private val monthNames = listOf(
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    )
    private const val MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    private val isoDate = Regex("""\b(\d{4})-(\d{1,2})-(\d{1,2})\b""")
    private val dmyDate = Regex("""(?<![\d.])(\d{1,2})([/.])(\d{1,2})(?:\2(\d{2,4}))?(?![\d.])""")
    private val dayMonth = Regex("""\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?$MONTH\.?(?:,?\s+(\d{4}))?\b""", RegexOption.IGNORE_CASE)
    private val monthDay = Regex("""\b$MONTH\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b""", RegexOption.IGNORE_CASE)
    private val weekdays = Regex("""\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|nesday|rsday|urday)?\b""", RegexOption.IGNORE_CASE)
    private val fillerWords = Regex("""\b(session|workout|day|date|on|the|gym|training|week)\b""", RegexOption.IGNORE_CASE)
    private val undatedMarker = Regex("""^\W*(no date|undated|without date|no dates)\W*$""", RegexOption.IGNORE_CASE)
    private val bullet = Regex("""^\s*(?:[-*•>]+|\d+[.)](?=\s+\D))\s*""")

    private val leadingNamePart = Regex("""^\d+\s*(?:(?:degrees?|deg|s)\b|°)""", RegexOption.IGNORE_CASE)
    private val trailingJoiner = Regex("""\s*[x×@]\s*$""", RegexOption.IGNORE_CASE)
    private val headingWords = setOf("day", "week", "wk", "workout", "session", "part", "block", "phase", "routine")

    private fun isHeading(name: String, spec: String): Boolean {
        val words = ExerciseLibrary.normalize(name).split(' ').filter { it.isNotEmpty() }
        if (words.isEmpty() || !words.all { it in headingWords }) return false
        // Only bare numbers after it, e.g. "Week 2 Day 3": no x, no units, no @.
        return !Regex("""[x×@]|kg|lb|bw|rep""", RegexOption.IGNORE_CASE).containsMatchIn(spec)
    }

    private fun monthIndex(s: String): Int = monthNames.indexOf(s.lowercase().take(3)) + 1

    private fun safeDate(y: Int, m: Int, d: Int): LocalDate? =
        runCatching { LocalDate.of(y, m, d) }.getOrNull()

    /** A year-less date means the most recent one that is not in the future. */
    private fun withYear(y: Int?, m: Int, d: Int, today: LocalDate): LocalDate? {
        if (y != null) return safeDate(if (y < 100) 2000 + y else y, m, d)
        val guess = safeDate(today.year, m, d) ?: return null
        return if (guess.isAfter(today)) guess.minusYears(1) else guess
    }

    private data class DateHit(val date: LocalDate, val range: IntRange)

    private fun findDate(line: String, today: LocalDate): DateHit? {
        isoDate.find(line)?.let { m ->
            val (y, mo, d) = m.destructured
            safeDate(y.toInt(), mo.toInt(), d.toInt())?.let { return DateHit(it, m.range) }
        }
        dayMonth.find(line)?.let { m ->
            val d = m.groupValues[1].toInt()
            val mo = monthIndex(m.groupValues[2])
            withYear(m.groupValues[3].toIntOrNull(), mo, d, today)?.let { return DateHit(it, m.range) }
        }
        monthDay.find(line)?.let { m ->
            val mo = monthIndex(m.groupValues[1])
            val d = m.groupValues[2].toInt()
            withYear(m.groupValues[3].toIntOrNull(), mo, d, today)?.let { return DateHit(it, m.range) }
        }
        for (m in dmyDate.findAll(line)) {
            val a = m.groupValues[1].toInt()
            val b = m.groupValues[3].toInt()
            val sep = m.groupValues[2]
            val year = m.groupValues[4].toIntOrNull()
            // "12.5kg" is a weight, not the 12th of May, so dotted dates need a year. And
            // "60kg 12/10/8" is a list of reps, so a numeric date only counts at the start
            // of a line or on a line that is nothing but the date.
            if (year == null && sep == ".") continue
            val dateOnly = !line.replace(m.value, "").any { it.isDigit() }
            if (m.range.first != 0 && !dateOnly) continue
            if (year == null && !dateOnly) continue
            // Day first (UK). If that is impossible or in the future, try month first (US).
            val dayFirst = withYear(year, b, a, today)
            val monthFirst = withYear(year, a, b, today)
            val date = when {
                dayFirst != null && !dayFirst.isAfter(today) -> dayFirst
                monthFirst != null && !monthFirst.isAfter(today) -> monthFirst
                else -> dayFirst ?: monthFirst
            } ?: continue
            return DateHit(date, m.range)
        }
        return null
    }

    fun parse(
        text: String,
        defaultUnit: WeightUnit,
        today: LocalDate,
        pool: List<ExerciseInfo> = ExerciseLibrary.all,
    ): List<Line> {
        val out = ArrayList<Line>()
        var current: LocalDate? = null
        text.lines().forEachIndexed { idx, rawLine ->
            var line = rawLine.replace(bullet, "").trim()
            if (line.isEmpty() || line.startsWith("#") || line.startsWith("//")) return@forEachIndexed
            if (undatedMarker.matches(line)) {
                current = null
                return@forEachIndexed
            }
            findDate(line, today)?.let { hit ->
                current = hit.date
                line = line.removeRange(hit.range).trim()
            }
            val leftover = line.replace(weekdays, " ").replace(fillerWords, " ")
                .replace(Regex("""[^\p{L}\p{N}]"""), " ").trim()
            if (leftover.isEmpty()) return@forEachIndexed // a date header

            // A name may itself start with a number ("45 degree leg press", "21s").
            val lead = leadingNamePart.find(line)?.value?.length ?: 0
            val nameEnd = Regex("""\d|\bbw\b|\bbodyweight\b""", RegexOption.IGNORE_CASE).find(line, lead)?.range?.first ?: line.length
            val name = line.substring(0, nameEnd).trim()
                .replace(trailingJoiner, "")
                .trimEnd(':', '-', '–', '—', ',', '=', '(').trim()
            val spec = line.substring(nameEnd)
            // "Day 1", "Week 2 Day 3", "Workout 3": section headings, not exercises.
            if (isHeading(name, spec)) return@forEachIndexed
            if (name.isEmpty()) {
                out += Line(idx + 1, rawLine, current, "", null, emptyList(), "No exercise name before the numbers")
                return@forEachIndexed
            }
            val exercise = ExerciseLibrary.bestMatch(name, pool)
            val sets = parseSets(spec, defaultUnit, exercise?.equipment ?: ExerciseLibrary.guessEquipment(name))
            out += Line(
                idx + 1, rawLine, current, name, exercise, sets,
                if (sets.isEmpty()) "Couldn't find weight × reps on this line" else null,
            )
        }
        return out
    }

    private class Chunk(var weightKg: Double?, val reps: Int, val count: Int, val bodyweight: Boolean)

    fun parseSets(specRaw: String, unit: WeightUnit, equipment: Equipment): List<SetEntry> {
        var spec = specRaw.lowercase()
            .replace('×', 'x').replace('*', 'x')
            // "60kgs", "135lbs", "100 kilos" → 60kg, 135lb, 100kg
            .replace(Regex("""(\d)\s*(kgs|kilos?|kilograms?)\b"""), "$1kg")
            .replace(Regex("""(\d)\s*(lbs|pounds?)\b"""), "$1lb")
            .replace(Regex("""\b(kgs|kilos?|kilograms?)\b"""), "kg")
            .replace(Regex("""\b(lbs|pounds?)\b"""), "lb")
            .replace(Regex("""\brpe\s*\d+(?:\.\d+)?"""), " ")
            .replace(Regex("""(\d+)\s*sets?\s*(?:of|x)\s*(\d+)"""), "$1x$2")
            .replace(Regex("""(\d+)\s*(?:reps?|r)\b"""), "$1")
        spec = spec.replace(Regex("""\bsets?\b"""), " ")
        val parts = spec.split(Regex("""[,;|/]|\band\b|\bthen\b""")).map { it.trim() }.filter { it.isNotEmpty() }
        val chunks = ArrayList<Chunk>()
        var pendingWeight: Double? = null
        for (p in parts) {
            var rest = p
            var weight: Double? = null
            var bw = false
            // Where the weight sat relative to the other numbers decides their order:
            // "60kg x 10 x 3" is reps then sets, "3x10 @ 60kg" is sets then reps.
            var weightFirst = false
            Regex("""(\d+(?:\.\d+)?)\s*(kg|lb)\b""").find(rest)?.let { m ->
                val v = m.groupValues[1].toDouble()
                weight = if (m.groupValues[2] == "lb") v * KG_PER_LB else v
                weightFirst = !Regex("""\d""").containsMatchIn(rest.substring(0, m.range.first))
                rest = rest.removeRange(m.range)
                // With the weight already given, an "@8" is an RPE, not a second weight.
                rest = rest.replace(Regex("""@\s*\d+(?:\.\d+)?"""), " ")
            } ?: Regex("""(?:@|\bat\b)\s*(\d+(?:\.\d+)?)""").find(rest)?.let { m ->
                weight = m.groupValues[1].toDouble().toKg(unit)
                weightFirst = !Regex("""\d""").containsMatchIn(rest.substring(0, m.range.first))
                rest = rest.removeRange(m.range)
            }
            if (Regex("""\bbw\b|\bbodyweight\b""").containsMatchIn(rest)) {
                bw = true
                if (weight == null) weight = 0.0
                rest = rest.replace(Regex("""\bbw\b|\bbodyweight\b"""), " ")
            }
            val nums = Regex("""\d+(?:\.\d+)?""").findAll(rest).map { it.value.toDouble() }.toList()
            if (pendingWeight != null && weight == null) {
                weight = pendingWeight
            }
            pendingWeight = null
            when {
                nums.isEmpty() -> if (weight != null) pendingWeight = weight // "60kg" then "x 12" next
                weight != null -> {
                    if (nums.size == 1) {
                        chunks += Chunk(weight, nums[0].toInt(), 1, bw)
                    } else {
                        val (a, b) = nums[0] to nums[1]
                        val (reps, count) = when {
                            weightFirst -> a to b           // 60kg x 10 x 3
                            a > 10 && b <= 10 -> a to b     // 12x3 @ 60 (reps x sets)
                            else -> b to a                  // 3x10 @ 60 (sets x reps)
                        }
                        chunks += Chunk(weight, reps.toInt(), count.toInt(), bw)
                    }
                }
                nums.size == 1 -> chunks += Chunk(null, nums[0].toInt(), 1, false)
                nums.size == 2 -> {
                    val (a, b) = nums[0] to nums[1]
                    val loaded = equipment == Equipment.DUMBBELL || equipment == Equipment.KETTLEBELL
                    if (equipment == Equipment.BODYWEIGHT || (!loaded && a <= 6 && a == Math.floor(a) && b <= 30)) {
                        chunks += Chunk(null, b.toInt(), a.toInt(), false) // 3x10 = sets x reps
                    } else {
                        chunks += Chunk(a.toKg(unit), b.toInt(), 1, false) // 60x12 = weight x reps
                    }
                }
                else -> {
                    val (a, b, c) = Triple(nums[0], nums[1], nums[2])
                    if (c >= 20 && a <= 10 && b <= 30) {
                        chunks += Chunk(c.toKg(unit), b.toInt(), a.toInt(), false) // 3x10x60
                    } else {
                        chunks += Chunk(a.toKg(unit), b.toInt(), c.toInt(), false) // 60x12x3
                    }
                }
            }
        }
        // Bare rep counts borrow the weight written next to them: "60kg x 12, 10, 8" or "12, 10, 8 @ 60".
        for (i in chunks.indices) {
            if (chunks[i].weightKg != null) continue
            val before = (i - 1 downTo 0).firstNotNullOfOrNull { chunks[it].weightKg }
            val after = (i + 1 until chunks.size).firstNotNullOfOrNull { chunks[it].weightKg }
            chunks[i].weightKg = before ?: after ?: 0.0
        }
        return chunks
            .filter { it.reps in 1..300 && it.count in 1..20 && (it.weightKg ?: 0.0) in 0.0..1500.0 }
            // Kept at full precision: 135 lb must come back as exactly 135 lb.
            .flatMap { c -> List(c.count) { SetEntry(c.weightKg ?: 0.0, c.reps) } }
    }

    data class Applied(val data: AppData, val sessions: Int, val sets: Int, val newExercises: Int, val undatedLines: Int)

    /** Adds the parsed lines as imported sessions. Unknown exercise names become custom exercises. */
    fun apply(data: AppData, lines: List<Line>): Applied {
        val customs = data.customExercises.toMutableList()
        var newExercises = 0
        fun resolve(line: Line): String {
            line.exercise?.let { return it.id }
            val key = ExerciseLibrary.normalize(line.name)
            customs.firstOrNull { ExerciseLibrary.normalize(it.name) == key }?.let { return it.id }
            val c = CustomExercise(
                id = "c_" + newId(),
                name = line.name.replaceFirstChar { it.uppercase() },
                equipment = ExerciseLibrary.guessEquipment(line.name),
            )
            customs += c
            newExercises++
            return c.id
        }
        val good = lines.filter { it.ok }
        val byDate = good.groupBy { it.date }
        val newSessions = byDate.map { (date, group) ->
            // A dated day merges repeats of an exercise into one entry. Undated lines stay
            // one entry each: they may come from different days, so merging them would
            // invent a giant session and prefill dozens of sets.
            val entries: List<ExerciseLog> = if (date != null) {
                val merged = LinkedHashMap<String, MutableList<SetEntry>>()
                for (l in group) merged.getOrPut(resolve(l)) { ArrayList() } += l.sets
                merged.map { (id, sets) -> ExerciseLog(id, sets) }
            } else {
                group.map { l -> ExerciseLog(resolve(l), l.sets) }
            }
            Session(
                id = newId(),
                workoutName = if (date == null) "Imported (no date)" else "Imported",
                workoutEmoji = "📥",
                date = date?.toString(),
                startedAt = date?.atTime(12, 0)?.toInstant(ZoneOffset.UTC)?.toEpochMilli() ?: 0L,
                entries = entries,
                imported = true,
            )
        }
        return Applied(
            data.copy(customExercises = customs, sessions = data.sessions + newSessions),
            sessions = newSessions.count { it.date != null },
            sets = good.sumOf { it.sets.size },
            newExercises = newExercises,
            undatedLines = good.count { it.date == null },
        )
    }
}
