package com.ironlog.domain

import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

const val KG_PER_LB = 0.45359237

val WeightUnit.label: String get() = if (this == WeightUnit.KG) "kg" else "lb"

/** Kilograms → the user's unit, rounded to 0.01 so float noise never reaches the screen. */
fun Double.kgTo(unit: WeightUnit): Double {
    val v = if (unit == WeightUnit.KG) this else this / KG_PER_LB
    return (v * 100).roundToLong() / 100.0
}

/** A value in the user's unit → kilograms for storage. */
fun Double.toKg(unit: WeightUnit): Double = if (unit == WeightUnit.KG) this else this * KG_PER_LB

/** 60.0 → "60", 62.5 → "62.5", 61.25 → "61.25". */
fun formatNumber(value: Double): String {
    val rounded = (value * 100).roundToLong() / 100.0
    return if (abs(rounded - rounded.roundToLong()) < 1e-9) {
        rounded.roundToLong().toString()
    } else {
        String.format(Locale.US, "%.2f", rounded).trimEnd('0').trimEnd('.')
    }
}

fun formatWeight(kg: Double, unit: WeightUnit, withUnit: Boolean = true): String {
    val n = formatNumber(kg.kgTo(unit))
    return if (withUnit) "$n${unit.label}" else n
}

/** "60kg × 12", or "BW × 15" for an unweighted bodyweight set. */
fun formatSet(set: SetEntry, unit: WeightUnit, equipment: Equipment? = null): String {
    val w = when {
        set.weightKg == 0.0 && (equipment == Equipment.BODYWEIGHT || equipment == null) -> "BW"
        equipment == Equipment.BODYWEIGHT -> "BW+" + formatWeight(set.weightKg, unit)
        else -> formatWeight(set.weightKg, unit)
    }
    return "$w × ${set.reps}"
}

/** Total weight moved, e.g. "12.4k kg". */
fun formatVolume(kg: Double, unit: WeightUnit): String = formatCompact(kg.kgTo(unit)) + " " + unit.label

/** Big volumes read better as "12.4k". */
fun formatCompact(value: Double): String = when {
    value >= 1_000_000 -> formatNumber((value / 100_000).roundToLong() / 10.0) + "M"
    value >= 10_000 -> formatNumber((value / 100).roundToLong() / 10.0) + "k"
    else -> formatNumber(value.roundToLong().toDouble())
}
