package com.ironlog.domain

import java.time.LocalDate
import kotlin.math.exp
import kotlin.math.roundToInt

/**
 * Rough strength standards, used only for the "only X% of lifters your age can do this"
 * line after a PR. Thresholds are the 5th / 20th / 50th / 80th / 95th percentile among
 * people who lift, as multiples of bodyweight for a one-rep max (or plain reps for
 * bodyweight moves), adapted from widely published lifting standards. They are an
 * estimate and the app labels them that way.
 */
object Strength {

    private val P = doubleArrayOf(5.0, 20.0, 50.0, 80.0, 95.0)

    private class Standard(val male: DoubleArray, val female: DoubleArray, val reps: Boolean = false)

    private fun s(m: List<Double>, f: List<Double>, reps: Boolean = false) =
        Standard(m.toDoubleArray(), f.toDoubleArray(), reps)

    private val standards: Map<String, Standard> = mapOf(
        "bench_press" to s(listOf(0.50, 0.80, 1.15, 1.60, 2.00), listOf(0.25, 0.45, 0.70, 1.00, 1.30)),
        "squat" to s(listOf(0.75, 1.15, 1.55, 2.10, 2.60), listOf(0.50, 0.80, 1.10, 1.55, 2.00)),
        "deadlift" to s(listOf(1.00, 1.40, 1.85, 2.45, 3.00), listOf(0.60, 0.95, 1.30, 1.80, 2.30)),
        "sumo_deadlift" to s(listOf(1.00, 1.40, 1.85, 2.45, 3.00), listOf(0.60, 0.95, 1.30, 1.80, 2.30)),
        "ohp" to s(listOf(0.35, 0.50, 0.70, 0.95, 1.20), listOf(0.20, 0.32, 0.45, 0.65, 0.85)),
        "barbell_row" to s(listOf(0.45, 0.70, 0.95, 1.30, 1.65), listOf(0.25, 0.40, 0.60, 0.85, 1.10)),
        "front_squat" to s(listOf(0.60, 0.95, 1.30, 1.70, 2.10), listOf(0.40, 0.65, 0.90, 1.25, 1.60)),
        "incline_bench" to s(listOf(0.45, 0.70, 1.00, 1.40, 1.75), listOf(0.20, 0.40, 0.60, 0.85, 1.10)),
        "close_grip_bench" to s(listOf(0.45, 0.70, 1.00, 1.35, 1.70), listOf(0.20, 0.38, 0.58, 0.85, 1.10)),
        // Dumbbell standards are per dumbbell.
        "db_bench" to s(listOf(0.15, 0.25, 0.40, 0.55, 0.70), listOf(0.08, 0.15, 0.25, 0.35, 0.45)),
        "db_incline_bench" to s(listOf(0.13, 0.22, 0.35, 0.50, 0.63), listOf(0.07, 0.13, 0.22, 0.32, 0.42)),
        "seated_db_press" to s(listOf(0.10, 0.18, 0.28, 0.40, 0.52), listOf(0.05, 0.10, 0.16, 0.24, 0.32)),
        "db_curl" to s(listOf(0.08, 0.15, 0.22, 0.32, 0.42), listOf(0.04, 0.08, 0.13, 0.19, 0.25)),
        "hammer_curl" to s(listOf(0.08, 0.15, 0.23, 0.33, 0.44), listOf(0.04, 0.08, 0.13, 0.19, 0.26)),
        "barbell_curl" to s(listOf(0.20, 0.35, 0.50, 0.70, 0.90), listOf(0.10, 0.20, 0.30, 0.45, 0.60)),
        "ez_curl" to s(listOf(0.20, 0.35, 0.50, 0.70, 0.90), listOf(0.10, 0.20, 0.30, 0.45, 0.60)),
        "leg_press" to s(listOf(1.00, 1.75, 2.60, 3.60, 4.60), listOf(0.60, 1.20, 1.90, 2.80, 3.60)),
        "hip_thrust" to s(listOf(0.60, 1.10, 1.70, 2.40, 3.10), listOf(0.50, 1.00, 1.50, 2.20, 2.90)),
        "lat_pulldown" to s(listOf(0.45, 0.65, 0.90, 1.20, 1.50), listOf(0.30, 0.45, 0.60, 0.85, 1.10)),
        "rdl" to s(listOf(0.60, 1.00, 1.40, 1.90, 2.40), listOf(0.40, 0.70, 1.00, 1.40, 1.80)),
        "pull_up" to s(listOf(1.0, 4.0, 10.0, 17.0, 25.0), listOf(0.3, 1.0, 4.0, 9.0, 15.0), reps = true),
        "chin_up" to s(listOf(1.0, 5.0, 11.0, 18.0, 26.0), listOf(0.3, 1.0, 5.0, 10.0, 16.0), reps = true),
        "push_up" to s(listOf(5.0, 15.0, 30.0, 45.0, 65.0), listOf(1.0, 6.0, 15.0, 28.0, 42.0), reps = true),
        "dip" to s(listOf(2.0, 8.0, 16.0, 26.0, 38.0), listOf(0.3, 2.0, 7.0, 13.0, 20.0), reps = true),
        "chest_dip" to s(listOf(2.0, 8.0, 16.0, 26.0, 38.0), listOf(0.3, 2.0, 7.0, 13.0, 20.0), reps = true),
    )

    fun hasStandard(exerciseId: String) = exerciseId in standards

    /** Younger and older lifters are compared with their own age group. */
    fun ageFactor(age: Int?): Double = when {
        age == null -> 1.0
        age <= 13 -> 0.62
        age == 14 -> 0.70
        age == 15 -> 0.78
        age == 16 -> 0.86
        age == 17 -> 0.92
        age == 18 -> 0.96
        age in 19..39 -> 1.0
        else -> (1.0 - (age - 39) * 0.01).coerceAtLeast(0.6)
    }

    /** When no bodyweight is entered, estimate one from height (BMI 22/21) or a typical value for the age. */
    fun assumedBodyweightKg(profile: Profile, age: Int?): Double {
        profile.bodyweightKg?.takeIf { it in 25.0..300.0 }?.let { return it }
        val female = profile.sex == Sex.FEMALE
        profile.heightCm?.takeIf { it in 120.0..230.0 }?.let { h ->
            val m = h / 100
            return (if (female) 21.0 else 22.0) * m * m
        }
        val byAge = if (female) mapOf(13 to 47.0, 14 to 50.0, 15 to 53.0, 16 to 55.0, 17 to 57.0)
        else mapOf(13 to 48.0, 14 to 54.0, 15 to 59.0, 16 to 63.0, 17 to 66.0)
        return when {
            age != null && age < 13 -> 42.0
            age != null && age in byAge -> byAge.getValue(age)
            else -> if (female) 65.0 else 80.0
        }
    }

    /** Percentile (0–99.9) of lifters this set beats, or null if there is no standard for the lift. */
    fun percentile(exerciseId: String, set: SetEntry, profile: Profile, today: LocalDate): Double? {
        val st = standards[exerciseId] ?: return null
        val age = profile.ageOn(today)
        val factor = ageFactor(age)
        val thresholds = (if (profile.sex == Sex.FEMALE) st.female else st.male).map { it * factor }
        val value = if (st.reps) {
            if (set.weightKg > 0) return null // weighted pull-ups etc. are not covered
            set.reps.toDouble()
        } else {
            val bw = assumedBodyweightKg(profile, age)
            estimateOneRepMax(set.weightKg, set.reps) / bw
        }
        return interpolate(value, thresholds)
    }

    internal fun interpolate(v: Double, t: List<Double>): Double {
        if (v <= 0) return 0.0
        if (v < t[0]) return P[0] * v / t[0]
        for (i in 0 until t.size - 1) {
            if (v < t[i + 1]) return P[i] + (P[i + 1] - P[i]) * (v - t[i]) / (t[i + 1] - t[i])
        }
        val span = (t[4] - t[3]).coerceAtLeast(1e-6)
        return 95.0 + 4.9 * (1 - exp(-(v - t[4]) / span))
    }

    /** "boys your age", "women your age", or plain "lifters your age". */
    fun peerGroup(profile: Profile, today: LocalDate): String {
        val age = profile.ageOn(today)
        return when (profile.sex) {
            Sex.MALE -> when { age == null -> "guys"; age < 18 -> "boys your age"; age < 30 -> "guys your age"; else -> "men your age" }
            Sex.FEMALE -> when { age == null -> "women"; age < 18 -> "girls your age"; else -> "women your age" }
            Sex.UNSPECIFIED -> if (age == null) "lifters" else "lifters your age"
        }
    }

    /** The brag line for a PR, e.g. "Only 4% of boys your age can do this (est.)". */
    fun brag(exerciseId: String, set: SetEntry, profile: Profile, today: LocalDate): String? {
        val p = percentile(exerciseId, set, profile, today) ?: return null
        val group = peerGroup(profile, today)
        val rest = 100 - p
        return when {
            p >= 99 -> "Fewer than 1% of $group can do this 🤯 (est.)"
            p >= 60 -> "Only ${rest.roundToInt().coerceAtLeast(1)}% of $group can do this 💪 (est.)"
            p >= 20 -> "Stronger than ${p.roundToInt()}% of $group 📈 (est.)"
            else -> "Every PR moves you up the ranks. Keep going! 🚀"
        }
    }
}
