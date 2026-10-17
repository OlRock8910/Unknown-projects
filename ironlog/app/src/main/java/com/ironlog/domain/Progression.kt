package com.ironlog.domain

import kotlin.math.abs
import kotlin.math.roundToLong

/** The +/- step a fresh exercise starts with, by equipment. */
fun defaultStep(equipment: Equipment, unit: WeightUnit): Double = when (unit) {
    WeightUnit.KG -> when (equipment) {
        Equipment.BARBELL, Equipment.DUMBBELL, Equipment.SMITH, Equipment.CABLE -> 2.5
        Equipment.MACHINE -> 5.0
        Equipment.KETTLEBELL -> 4.0
        Equipment.BODYWEIGHT -> 2.5
        Equipment.BAND, Equipment.OTHER -> 2.5
    }
    WeightUnit.LB -> when (equipment) {
        Equipment.MACHINE -> 10.0
        Equipment.KETTLEBELL -> 9.0
        else -> 5.0
    }
}

val STEP_CHOICES_KG = listOf(0.5, 1.0, 1.25, 2.0, 2.5, 4.0, 5.0, 10.0)
val STEP_CHOICES_LB = listOf(1.0, 2.5, 5.0, 10.0, 15.0, 20.0, 25.0)

/**
 * Learns how the weight moves on a machine from what was actually typed: the most common
 * jump between consecutive different weights. A pin stack in 7 kg plates shows up as 7.
 * Needs at least two matching jumps before it trusts the pattern.
 */
fun inferStep(weightsInUnit: List<Double>): Double? {
    val diffs = weightsInUnit.zipWithNext { a, b -> abs(b - a) }
        .map { (it * 100).roundToLong() / 100.0 }
        .filter { it in 0.5..25.0 }
    if (diffs.size < 2) return null
    val (step, count) = diffs.groupingBy { it }.eachCount().maxByOrNull { it.value } ?: return null
    // Real stacks and plates move in quarter units at the finest (1.25, 2.5, 7…);
    // 11.02 is just 5 kg seen in pounds.
    if (abs(step * 4 - Math.round(step * 4)) > 0.01) return null
    return step.takeIf { count >= 2 }
}

fun stepFor(data: AppData, exercise: ExerciseInfo): Double {
    val unit = data.settings.unit
    val prefs = data.exercisePrefs[exercise.id]
    val chosen = if (unit == WeightUnit.KG) prefs?.stepKg else prefs?.stepLb
    if (chosen != null && chosen > 0) return chosen
    val weights = data.history(exercise.id).dated
        .flatMap { p -> p.sets.filter { it.reps > 0 }.map { it.weightKg.kgTo(unit) } }
        .filter { it > 0 }
    // Only machine-like kit benefits from learning; barbells and dumbbells have standard jumps.
    if (exercise.equipment == Equipment.MACHINE || exercise.equipment == Equipment.CABLE) {
        inferStep(weights.distinct().sorted())?.let { return it }
    }
    return defaultStep(exercise.equipment, unit)
}

/**
 * Moves [kg] one step up or down in the user's unit, landing on a multiple of the step:
 * 132.28 lb (60 kg) goes to 135 or 130 with a 5 lb step, not 137.28.
 */
fun stepWeight(kg: Double, step: Double, unit: WeightUnit, up: Boolean): Double {
    if (step <= 0) return kg
    val current = kg.kgTo(unit)
    val units = current / step
    val nextUnits = if (up) Math.floor(units + 1e-6) + 1 else Math.ceil(units - 1e-6) - 1
    val next = (nextUnits * step * 100).roundToLong() / 100.0
    return if (next <= 0) 0.0 else next.toKg(unit)
}

/** Starting weight for an exercise with no history at all. */
fun startingWeightKg(equipment: Equipment, unit: WeightUnit): Double {
    val v = when (equipment) {
        Equipment.BARBELL -> if (unit == WeightUnit.KG) 20.0 else 45.0
        Equipment.DUMBBELL -> if (unit == WeightUnit.KG) 10.0 else 20.0
        Equipment.MACHINE, Equipment.CABLE, Equipment.SMITH -> if (unit == WeightUnit.KG) 20.0 else 40.0
        Equipment.KETTLEBELL -> if (unit == WeightUnit.KG) 12.0 else 25.0
        Equipment.BODYWEIGHT, Equipment.BAND, Equipment.OTHER -> 0.0
    }
    return v.toKg(unit)
}

enum class SuggestionKind { MORE_WEIGHT, MORE_REPS }

data class Suggestion(
    val kind: SuggestionKind,
    val last: SetEntry,
    val targetWeightKg: Double,
    val targetReps: Int,
)

/**
 * Progressive overload in its simplest form: hit 12 reps on your top set, go up a step;
 * otherwise chase one more rep at the same weight.
 */
fun suggestNext(lastTopSet: SetEntry, step: Double, unit: WeightUnit, equipment: Equipment): Suggestion {
    val bodyweightOnly = lastTopSet.weightKg == 0.0 &&
        (equipment == Equipment.BODYWEIGHT || equipment == Equipment.OTHER || equipment == Equipment.BAND)
    return when {
        bodyweightOnly -> Suggestion(SuggestionKind.MORE_REPS, lastTopSet, 0.0, lastTopSet.reps + if (lastTopSet.reps >= 15) 2 else 1)
        lastTopSet.reps >= 12 -> Suggestion(
            SuggestionKind.MORE_WEIGHT, lastTopSet,
            stepWeight(lastTopSet.weightKg, step, unit, up = true), (lastTopSet.reps - 3).coerceAtLeast(6),
        )
        else -> Suggestion(SuggestionKind.MORE_REPS, lastTopSet, lastTopSet.weightKg, lastTopSet.reps + 1)
    }
}
