package com.ironlog.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import kotlin.random.Random

class UnitsTest {
    @Test fun formatsWeights() {
        assertEquals("60kg", formatWeight(60.0, WeightUnit.KG))
        assertEquals("62.5kg", formatWeight(62.5, WeightUnit.KG))
        assertEquals("135lb", formatWeight(135.0.toKg(WeightUnit.LB), WeightUnit.LB))
        assertEquals("BW × 15", formatSet(SetEntry(0.0, 15), WeightUnit.KG, Equipment.BODYWEIGHT))
        assertEquals("BW+10kg × 8", formatSet(SetEntry(10.0, 8), WeightUnit.KG, Equipment.BODYWEIGHT))
        assertEquals("12.4k", formatCompact(12_400.0))
    }

    @Test fun stepsInPoundsStayOnTheGrid() {
        var kg = 135.0.toKg(WeightUnit.LB)
        repeat(3) { kg = stepWeight(kg, 5.0, WeightUnit.LB, up = true) }
        assertEquals("150lb", formatWeight(kg, WeightUnit.LB))
        assertEquals(0.0, stepWeight(2.0, 2.5, WeightUnit.KG, up = false), 0.0)
    }
}

class SearchTest {
    private fun first(q: String) = ExerciseLibrary.search(q).first().id

    @Test fun findsByKeywordsAndShorthand() {
        assertEquals("bench_press", first("bench"))
        assertEquals("db_incline_bench", first("inc db"))
        assertEquals("squat", first("squat"))
        assertEquals("rdl", first("rdl"))
        assertEquals("lat_pulldown", first("lat pull"))
        assertEquals("leg_press", first("leg press"))
        assertEquals("tricep_pushdown", first("pushdown"))
        assertEquals("ohp", first("ohp"))
        assertTrue(ExerciseLibrary.search("chest").size > 10)
        assertTrue(ExerciseLibrary.search("zzzz").isEmpty())
    }

    @Test fun libraryIdsAreUnique() {
        assertEquals(ExerciseLibrary.all.size, ExerciseLibrary.all.map { it.id }.toSet().size)
    }
}

class StatsTest {
    private val today = LocalDate.of(2026, 10, 17)

    private fun data(vararg sessions: Pair<String?, List<SetEntry>>) = AppData(
        sessions = sessions.mapIndexed { i, (d, sets) ->
            Session(id = "s$i", date = d, startedAt = i.toLong(), entries = listOf(ExerciseLog("bench_press", sets)),
                imported = d == null)
        },
    )

    @Test fun undatedImportsNeverReachTheGraph() {
        val d = data(
            null to listOf(SetEntry(100.0, 5)),
            "2026-09-01" to listOf(SetEntry(60.0, 10)),
            "2026-10-15" to listOf(SetEntry(66.0, 10)),
        )
        val h = d.history("bench_press")
        assertEquals(2, h.dated.size)
        assertEquals(1, h.undated.size)
        val series = h.series(Metric.TOP_WEIGHT, Range.ALL, today)
        assertEquals(listOf(60.0, 66.0), series.map { it.second })
        val change = h.changeSinceLastMonth(Metric.TOP_WEIGHT, today)!!
        assertEquals(10.0, change.percent, 1e-9)
        assertEquals("since last month", change.sinceLabel)
        // The undated 100kg still counts as a record.
        assertEquals(100.0, h.records().heaviest!!.weightKg, 0.0)
        assertEquals(2, h.timesDone())
    }

    @Test fun rangeFiltersByDate() {
        val d = data("2026-01-01" to listOf(SetEntry(50.0, 5)), "2026-10-14" to listOf(SetEntry(70.0, 5)))
        assertEquals(1, d.history("bench_press").series(Metric.TOP_WEIGHT, Range.W1, today).size)
        assertEquals(2, d.history("bench_press").series(Metric.TOP_WEIGHT, Range.Y1, today).size)
    }

    @Test fun detectsWeightAndRepRecords() {
        val before = data("2026-10-01" to listOf(SetEntry(60.0, 10), SetEntry(60.0, 8))).history("bench_press")
        assertEquals(PrKind.WEIGHT, detectRecords(before, listOf(SetEntry(62.5, 6))).single().kind)
        assertEquals(PrKind.E1RM, detectRecords(before, listOf(SetEntry(60.0, 12))).single().kind)
        assertTrue(detectRecords(before, listOf(SetEntry(55.0, 10))).isEmpty())
        // First time ever is not a PR.
        assertTrue(detectRecords(ExerciseHistory(emptyList(), emptyList()), listOf(SetEntry(100.0, 1))).isEmpty())
        val bw = data("2026-10-01" to listOf(SetEntry(0.0, 10))).history("bench_press")
        assertEquals(PrKind.REPS, detectRecords(bw, listOf(SetEntry(0.0, 11))).single().kind)
    }

    @Test fun weekStreakCountsBackFromLastWeekOnAMonday() {
        val monday = LocalDate.of(2026, 10, 19)
        val d = data(
            "2026-10-06" to listOf(SetEntry(60.0, 5)),
            "2026-10-13" to listOf(SetEntry(60.0, 5)),
            "2026-10-16" to listOf(SetEntry(60.0, 5)),
        )
        val o = d.overview(monday)
        assertEquals(2, o.weekStreak)
        assertEquals(3, o.lifetimeSessions)
        assertEquals(0, o.thisWeek)
    }

    @Test fun axisIsRound() {
        val (lo, hi, step) = niceAxis(57.0, 83.0)
        assertTrue(lo <= 57 && hi >= 83)
        assertEquals(0.0, lo % step, 1e-9)
    }
}

class ProgressionTest {
    @Test fun learnsMachineStep() {
        assertEquals(7.0, inferStep(listOf(35.0, 42.0, 49.0, 56.0))!!, 0.0)
        assertNull(inferStep(listOf(40.0, 45.0)))
    }

    @Test fun suggestsWeightAfterTwelveReps() {
        val s = suggestNext(SetEntry(60.0, 12), 2.5, WeightUnit.KG, Equipment.BARBELL)
        assertEquals(SuggestionKind.MORE_WEIGHT, s.kind)
        assertEquals(62.5, s.targetWeightKg, 1e-9)
        val r = suggestNext(SetEntry(60.0, 9), 2.5, WeightUnit.KG, Equipment.BARBELL)
        assertEquals(SuggestionKind.MORE_REPS, r.kind)
        assertEquals(10, r.targetReps)
    }

    @Test fun challengeTextMentionsLastAndTarget() {
        val s = suggestNext(SetEntry(60.0, 12), 5.0, WeightUnit.KG, Equipment.BARBELL)
        val today = LocalDate.of(2026, 10, 17)
        repeat(30) { seed ->
            val p = Motivation.challenge(s, today.minusDays(7), today, WeightUnit.KG, Equipment.BARBELL, Random(seed))
            assertFalse(p.body, p.body.contains("{"))
            assertTrue(p.body, p.body.contains("65KG"))
        }
    }

    @Test fun usesUserStepWhenSet() {
        val d = AppData(exercisePrefs = mapOf("leg_press" to ExercisePrefs(stepKg = 7.0)))
        assertEquals(7.0, stepFor(d, ExerciseLibrary.byId.getValue("leg_press")), 0.0)
        assertEquals(10.0, stepFor(d.copy(settings = Settings(unit = WeightUnit.LB)), ExerciseLibrary.byId.getValue("leg_press")), 0.0)
    }
}

class StrengthTest {
    private val today = LocalDate.of(2026, 10, 17)

    @Test fun teenBenchingBodyweightIsTopTier() {
        val p = Profile(birthday = "2010-05-01", sex = Sex.MALE, bodyweightKg = 63.0)
        val pct = Strength.percentile("bench_press", SetEntry(80.0, 3), p, today)!!
        assertTrue("was $pct", pct > 80)
        val line = Strength.brag("bench_press", SetEntry(80.0, 3), p, today)!!
        assertTrue(line, line.contains("boys your age"))
    }

    @Test fun percentileIsMonotonic() {
        val p = Profile(sex = Sex.MALE, bodyweightKg = 80.0)
        val values = (20..200 step 10).map { Strength.percentile("squat", SetEntry(it.toDouble(), 1), p, today)!! }
        assertEquals(values, values.sorted())
        assertTrue(values.last() < 100)
    }

    @Test fun weightedPullUpsHaveNoRepStandard() {
        assertNull(Strength.percentile("pull_up", SetEntry(10.0, 8), Profile(), today))
        assertNotNull(Strength.percentile("pull_up", SetEntry(0.0, 8), Profile(), today))
    }
}

class BackupTest {
    private val sample = AppData(
        onboarded = true,
        profile = Profile(name = "Alex", birthday = "2008-03-04"),
        workouts = listOf(Workout("w1", "Leg day", "🦵", listOf(1), listOf("squat", "leg_press"))),
        sessions = listOf(
            Session("s1", "w1", "Leg day", "🦵", "2026-10-12", 1, listOf(ExerciseLog("squat", listOf(SetEntry(80.0, 5, "check depth"))))),
            Session("s2", date = null, imported = true, entries = listOf(ExerciseLog("bench_press", listOf(SetEntry(60.0, 10))))),
        ),
        notes = listOf(Note("n1", "Bench PR", "80kg x 3 💪", 1, 2)),
    )

    @Test fun roundTrips() {
        val code = BackupCodec.encode(sample, Random(1))
        assertTrue(code.startsWith(BackupCodec.PREFIX))
        val back = BackupCodec.decode(code) as BackupCodec.Result.Ok
        assertEquals(sample, back.data)
        // Survives being wrapped across lines by a messaging app.
        val wrapped = code.chunked(40).joinToString("\n")
        assertEquals(sample, (BackupCodec.decode("here you go: $wrapped") as BackupCodec.Result.Ok).data)
    }

    @Test fun rejectsDamagedCodes() {
        val code = BackupCodec.encode(sample, Random(2))
        assertTrue(BackupCodec.decode(code.dropLast(10)) is BackupCodec.Result.Error)
        val flipped = code.substring(0, 30) + (if (code[30] == 'A') 'B' else 'A') + code.substring(31)
        assertTrue(BackupCodec.decode(flipped) is BackupCodec.Result.Error)
        assertTrue(BackupCodec.decode("hello") is BackupCodec.Result.Error)
    }

    @Test fun twoExportsLookDifferent() {
        assertFalse(BackupCodec.encode(sample, Random(3)) == BackupCodec.encode(sample, Random(4)))
    }
}

class ImportTest {
    private val today = LocalDate.of(2026, 10, 17)
    private fun sets(spec: String, eq: Equipment = Equipment.BARBELL, unit: WeightUnit = WeightUnit.KG) =
        ProgressImport.parseSets(spec, unit, eq).map { formatNumber(it.weightKg) + "x" + it.reps }

    @Test fun understandsCommonNotations() {
        assertEquals(listOf("60x12", "60x10", "60x8"), sets("60kg x 12, 10, 8"))
        assertEquals(listOf("60x12", "60x10", "60x8"), sets("12, 10, 8 @ 60kg"))
        assertEquals(List(5) { "80x5" }, sets("5x5 @ 80kg"))
        assertEquals(List(3) { "100x8" }, sets("3 sets of 8 at 100"))
        assertEquals(listOf("60x12", "65x10"), sets("60x12, 65x10"))
        assertEquals(List(3) { "60x12" }, sets("60x12x3"))
        assertEquals(List(3) { "0x10" }, sets("3x10", Equipment.BODYWEIGHT))
        assertEquals(listOf("0x15"), sets("bw x 15", Equipment.BODYWEIGHT))
        assertEquals(listOf("12.5x10"), sets("12.5kg x 10", Equipment.DUMBBELL))
        assertEquals(listOf("61.23x5"), sets("135lb x 5"))
        assertEquals(listOf("20x12"), sets("20 x 12 reps", Equipment.DUMBBELL))
    }

    @Test fun datesApplyToFollowingLinesAndUndatedStaysUndated() {
        val text = """
            Bench press 70kg x 5
            12/09/2026
            Squat 5x5 @ 80kg
            Leg press: 120 x 12
            Oct 3
            Zercher squat 60 x 8
            no date
            Pull ups 3x10
        """.trimIndent()
        val lines = ProgressImport.parse(text, WeightUnit.KG, today)
        assertEquals(5, lines.size)
        assertTrue(lines.all { it.ok })
        assertNull(lines[0].date)
        assertEquals(LocalDate.of(2026, 9, 12), lines[1].date)
        assertEquals("leg_press", lines[2].exercise?.id)
        assertEquals(LocalDate.of(2026, 10, 3), lines[3].date)
        assertNull(lines[3].exercise) // becomes a custom exercise
        assertNull(lines[4].date)
        assertEquals("pull_up", lines[4].exercise?.id)

        val applied = ProgressImport.apply(AppData(), lines)
        assertEquals(2, applied.sessions)
        assertEquals(1, applied.newExercises)
        assertEquals(2, applied.undatedLines)
        // The two undated lines share one undated session and stay off the graphs.
        val undated = applied.data.sessions.filter { it.date == null }
        assertEquals(1, undated.size)
        assertTrue(applied.data.history("bench_press").dated.isEmpty())
        assertEquals(1, applied.data.history("bench_press").undated.size)
    }

    @Test fun flagsLinesItCannotRead() {
        val lines = ProgressImport.parse("felt great today\nBench press 60kg x 10", WeightUnit.KG, today)
        assertEquals(2, lines.size)
        assertFalse(lines[0].ok)
        assertTrue(lines[1].ok)
    }
}

class RemindersTest {
    private val legs = Workout("w1", "Leg day", "🦵", days = listOf(1, 4)) // Mon, Thu

    @Test fun firesOnlyOnPlannedDays() {
        val d = AppData(workouts = listOf(legs))
        // Saturday evening → Monday 08:30
        assertEquals(LocalDateTime.of(2026, 10, 19, 8, 30), Reminders.next(d, LocalDateTime.of(2026, 10, 17, 20, 0)))
        // Monday 10:00 → Monday 13:00
        assertEquals(LocalDateTime.of(2026, 10, 19, 13, 0), Reminders.next(d, LocalDateTime.of(2026, 10, 19, 10, 0)))
    }

    @Test fun stopsForTheDayOnceLogged() {
        val done = Session("s", "w1", date = "2026-10-19", entries = listOf(ExerciseLog("squat", listOf(SetEntry(80.0, 5)))))
        val d = AppData(workouts = listOf(legs), sessions = listOf(done))
        assertEquals(LocalDateTime.of(2026, 10, 22, 8, 30), Reminders.next(d, LocalDateTime.of(2026, 10, 19, 10, 0)))
        assertNull(Reminders.next(d.copy(settings = Settings(remindersEnabled = false)), LocalDateTime.of(2026, 10, 19, 10, 0)))
    }
}

class ReviewFixesTest {
    private val today = LocalDate.of(2026, 10, 17)
    private fun sets(spec: String, eq: Equipment = Equipment.BARBELL, unit: WeightUnit = WeightUnit.KG) =
        ProgressImport.parseSets(spec, unit, eq).map { formatNumber(it.weightKg.kgTo(unit)) + "x" + it.reps }

    @Test fun unitSuffixesStuckToNumbers() {
        assertEquals(listOf("135x5"), sets("135lbs x 5", unit = WeightUnit.LB))
        assertEquals(listOf("60x8"), sets("60kgs x 8"))
        assertEquals(listOf("100x5"), sets("100 kilos x 5"))
    }

    @Test fun weightFirstMeansRepsThenSets() {
        assertEquals(List(3) { "60x10" }, sets("60kg x 10 x 3"))
        assertEquals(listOf("60x8"), sets("60kg x 8 @8"))
        assertEquals(listOf("60x8"), sets("60kg x 8 rpe 8"))
    }

    @Test fun importKeepsExactPounds() {
        val kg = ProgressImport.parseSets("135lb x 5", WeightUnit.LB, Equipment.BARBELL).single().weightKg
        assertEquals("135lb", formatWeight(kg, WeightUnit.LB))
    }

    @Test fun slashRepsAreNotDatesAndHeadingsAreSkipped() {
        val lines = ProgressImport.parse(
            "Day 1\nBench 60kg 12/10/8\nWeek 2 Day 3\nPull ups x 12\n45 degree leg press 100kg x 10",
            WeightUnit.KG, today,
        )
        assertEquals(3, lines.size)
        assertNull(lines[0].date)
        assertEquals(listOf(12, 10, 8), lines[0].sets.map { it.reps })
        assertEquals("pull_up", lines[1].exercise?.id)
        assertEquals("Pull ups", lines[1].name)
        assertEquals("leg_press", lines[2].exercise?.id)
    }

    @Test fun usDateFallsBackWhenDayFirstWouldBeInTheFuture() {
        // 10/12/2026 day-first is 10 Dec (future); month-first is 12 Oct.
        val lines = ProgressImport.parse("10/12/2026\nSquat 100kg x 5", WeightUnit.KG, today)
        assertEquals(LocalDate.of(2026, 10, 12), lines.single().date)
    }

    @Test fun undatedRepeatsStaySeparate() {
        val lines = ProgressImport.parse("Bench 60kg x 10\nBench 65kg x 8", WeightUnit.KG, today)
        val d = ProgressImport.apply(AppData(), lines).data
        val h = d.history("bench_press")
        assertEquals(2, h.undated.size)
        assertEquals(65.0, h.lastSets()!!.single().weightKg, 0.0)
    }

    @Test fun chestPressIsTheMachine() {
        assertEquals("machine_chest_press", ExerciseLibrary.bestMatch("Chest press")?.id)
    }

    @Test fun stepsSnapToTheGridAfterAUnitSwitch() {
        val kg60 = 60.0
        assertEquals("135lb", formatWeight(stepWeight(kg60, 5.0, WeightUnit.LB, up = true), WeightUnit.LB))
        assertEquals("130lb", formatWeight(stepWeight(kg60, 5.0, WeightUnit.LB, up = false), WeightUnit.LB))
        assertEquals("62.5kg", formatWeight(stepWeight(61.0, 2.5, WeightUnit.KG, up = true), WeightUnit.KG))
        assertNull(inferStep(listOf(110.23, 121.25, 132.28, 143.3)))
    }

    @Test fun noMonthTrendWhenNotDoneForAMonth() {
        val d = AppData(sessions = listOf(
            Session("a", date = "2026-07-01", entries = listOf(ExerciseLog("bench_press", listOf(SetEntry(60.0, 5))))),
            Session("b", date = "2026-08-01", entries = listOf(ExerciseLog("bench_press", listOf(SetEntry(65.0, 5))))),
        ))
        assertNull(d.history("bench_press").changeSinceLastMonth(Metric.TOP_WEIGHT, today))
    }

    @Test fun bodyweightOnlyHasNoOneRepMaxSet() {
        val d = AppData(sessions = listOf(Session("a", date = "2026-10-01", entries = listOf(ExerciseLog("pull_up", listOf(SetEntry(0.0, 5), SetEntry(0.0, 12)))))))
        val r = d.history("pull_up").records()
        assertNull(r.bestE1rmSet)
        assertEquals(12, r.mostReps!!.reps)
    }

    @Test fun activeSessionSpansMidnight() {
        val started = java.time.LocalDateTime.of(2026, 10, 16, 23, 30).atZone(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()
        val now = started + 45 * 60 * 1000
        val d = AppData(sessions = listOf(Session("s", "w1", date = "2026-10-16", startedAt = started)))
        assertEquals("s", d.activeSession("w1", today, now)?.id)
        assertNull(d.activeSession("w1", today, started + 6L * 3600 * 1000))
    }
}

class PerSideTest {
    @Test fun repsIsTheWeakerSideOrTheOnlySideDone() {
        assertEquals(7, SetEntry(20.0).withSides(8, 7).reps)
        assertEquals(9, SetEntry(20.0).withSides(0, 9).reps)
        assertEquals(0, SetEntry(20.0).withSides(0, 0).reps)
    }

    @Test fun switchingOnCopiesRepsToBothSidesAndOffDropsThem() {
        val on = SetEntry(20.0, 10, "slow").asPerSide(true)
        assertEquals(10, on.left)
        assertEquals(10, on.right)
        assertEquals("slow", on.note)
        val off = on.withSides(10, 8).asPerSide(false)
        assertFalse(off.perSide)
        assertEquals(8, off.reps)
        assertEquals(on, on.asPerSide(true))
    }

    @Test fun formatsBothSides() {
        assertEquals("20kg × 10L 9R", formatSet(SetEntry(20.0).withSides(10, 9), WeightUnit.KG))
        assertEquals("20kg × 10", formatSet(SetEntry(20.0, 10), WeightUnit.KG))
    }

    @Test fun oneArmAndOneLegMovesDefaultToPerSide() {
        val d = AppData(customExercises = listOf(
            CustomExercise("c1", "Single-Leg Dumbbell Calf Raise"),
            CustomExercise("c2", "Rope Biceps Curl"),
        ))
        assertTrue(d.isPerSide(d.exercise("db_row")))
        assertTrue(d.isPerSide(d.exercise("bulgarian_split_squat")))
        assertTrue(d.isPerSide(d.exercise("c1")))
        assertFalse(d.isPerSide(d.exercise("c2")))
        assertFalse(d.isPerSide(d.exercise("leg_extension")))
        val chosen = d.copy(exercisePrefs = mapOf("leg_extension" to ExercisePrefs(perSide = true), "db_row" to ExercisePrefs(perSide = false)))
        assertTrue(chosen.isPerSide(chosen.exercise("leg_extension")))
        assertFalse(chosen.isPerSide(chosen.exercise("db_row")))
    }

    @Test fun sidesSurviveABackupCode() {
        val d = AppData(sessions = listOf(Session("s", date = "2026-10-30", entries = listOf(
            ExerciseLog("db_row", listOf(SetEntry(22.5).withSides(10, 9))),
        ))))
        val back = (BackupCodec.decode(BackupCodec.encode(d, Random(3))) as BackupCodec.Result.Ok).data
        assertEquals(d, back)
    }
}
