package com.ironlog.domain

/** Ready-made weeks for people who don't want to build one from scratch. Everything is editable after. */
object Templates {

    data class Day(val name: String, val emoji: String, val days: List<Int>, val exercises: List<String>)
    data class Template(val id: String, val name: String, val emoji: String, val description: String, val workouts: List<Day>)

    val all = listOf(
        Template(
            "ppl", "Push / Pull / Legs", "🔥", "3 days: chest & arms, back & biceps, legs",
            listOf(
                Day("Push day", "💪", listOf(1), listOf("bench_press", "db_incline_bench", "seated_db_press", "lateral_raise", "tricep_pushdown", "overhead_cable_ext")),
                Day("Pull day", "🦍", listOf(3), listOf("lat_pulldown", "barbell_row", "cable_row", "face_pull", "db_curl", "hammer_curl")),
                Day("Leg day", "🦵", listOf(5), listOf("squat", "leg_press", "rdl", "leg_extension", "lying_leg_curl", "standing_calf_raise")),
            ),
        ),
        Template(
            "upper_lower", "Upper / Lower", "⚡", "4 days: upper, lower, rest, upper, lower",
            listOf(
                Day("Upper A", "💪", listOf(1), listOf("bench_press", "barbell_row", "seated_db_press", "lat_pulldown", "db_curl", "tricep_pushdown")),
                Day("Lower A", "🦵", listOf(2), listOf("squat", "rdl", "leg_press", "lying_leg_curl", "standing_calf_raise")),
                Day("Upper B", "🏋️", listOf(4), listOf("db_incline_bench", "cable_row", "ohp", "pull_up", "hammer_curl", "rope_pushdown")),
                Day("Lower B", "🍑", listOf(5), listOf("deadlift", "hack_squat", "hip_thrust", "leg_extension", "seated_calf_raise")),
            ),
        ),
        Template(
            "full_body", "Full Body x3", "🏆", "3 days, whole body each time — great for starting out",
            listOf(
                Day("Full body A", "🏋️", listOf(1), listOf("squat", "bench_press", "barbell_row", "lateral_raise", "plank")),
                Day("Full body B", "💥", listOf(3), listOf("deadlift", "ohp", "lat_pulldown", "leg_press", "db_curl")),
                Day("Full body C", "🔥", listOf(5), listOf("goblet_squat", "db_incline_bench", "cable_row", "hip_thrust", "tricep_pushdown")),
            ),
        ),
        Template(
            "bro", "Bro Split", "😤", "5 days: one muscle group a day",
            listOf(
                Day("Chest day", "🛡️", listOf(1), listOf("bench_press", "db_incline_bench", "machine_chest_press", "cable_fly", "chest_dip")),
                Day("Back day", "🦍", listOf(2), listOf("deadlift", "lat_pulldown", "barbell_row", "cable_row", "straight_arm_pulldown")),
                Day("Leg day", "🦵", listOf(3), listOf("squat", "leg_press", "rdl", "leg_extension", "lying_leg_curl", "standing_calf_raise")),
                Day("Shoulder day", "🥥", listOf(4), listOf("ohp", "seated_db_press", "lateral_raise", "rear_delt_fly", "db_shrug")),
                Day("Arm day", "💪", listOf(5), listOf("barbell_curl", "skull_crusher", "hammer_curl", "rope_pushdown", "preacher_curl", "overhead_cable_ext")),
            ),
        ),
    )

    fun build(t: Template): List<Workout> = t.workouts.mapIndexed { i, d ->
        Workout(newId(), d.name, d.emoji, d.days, d.exercises.filter { it in ExerciseLibrary.byId }, color = i)
    }
}
