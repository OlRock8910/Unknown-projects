package com.ironlog.domain

import com.ironlog.domain.Equipment.BARBELL
import com.ironlog.domain.Equipment.BODYWEIGHT
import com.ironlog.domain.Equipment.CABLE
import com.ironlog.domain.Equipment.DUMBBELL
import com.ironlog.domain.Equipment.KETTLEBELL
import com.ironlog.domain.Equipment.MACHINE
import com.ironlog.domain.Equipment.OTHER
import com.ironlog.domain.Equipment.SMITH
import com.ironlog.domain.Muscle.ABS
import com.ironlog.domain.Muscle.BACK
import com.ironlog.domain.Muscle.BICEPS
import com.ironlog.domain.Muscle.CALVES
import com.ironlog.domain.Muscle.CHEST
import com.ironlog.domain.Muscle.FOREARMS
import com.ironlog.domain.Muscle.FULL_BODY
import com.ironlog.domain.Muscle.GLUTES
import com.ironlog.domain.Muscle.HAMSTRINGS
import com.ironlog.domain.Muscle.QUADS
import com.ironlog.domain.Muscle.SHOULDERS
import com.ironlog.domain.Muscle.TRICEPS

object ExerciseLibrary {

    private fun ex(id: String, name: String, eq: Equipment, m: Muscle, aliases: String = "") =
        ExerciseInfo(id, name, eq, m, aliases)

    // IDs are stored in saved data and backup codes, so they must never change.
    val all: List<ExerciseInfo> = listOf(
        // Chest
        ex("bench_press", "Bench Press", BARBELL, CHEST, "flat bench, bb bench, barbell bench press"),
        ex("incline_bench", "Incline Bench Press", BARBELL, CHEST, "incline barbell press, upper chest"),
        ex("decline_bench", "Decline Bench Press", BARBELL, CHEST, "decline barbell press, lower chest"),
        ex("db_bench", "Dumbbell Bench Press", DUMBBELL, CHEST, "db bench, flat dumbbell press, db press"),
        ex("db_incline_bench", "Incline Dumbbell Press", DUMBBELL, CHEST, "incline db press, incline db bench, upper chest"),
        ex("db_decline_bench", "Decline Dumbbell Press", DUMBBELL, CHEST, "decline db press"),
        ex("db_fly", "Dumbbell Fly", DUMBBELL, CHEST, "db flyes, chest fly, flies"),
        ex("incline_db_fly", "Incline Dumbbell Fly", DUMBBELL, CHEST, "incline db flyes, flies"),
        ex("cable_fly", "Cable Fly", CABLE, CHEST, "cable crossover, cable flyes, flies"),
        ex("low_cable_fly", "Low-to-High Cable Fly", CABLE, CHEST, "low cable crossover, upper chest fly"),
        ex("high_cable_fly", "High-to-Low Cable Fly", CABLE, CHEST, "high cable crossover, lower chest fly"),
        ex("pec_deck", "Pec Deck", MACHINE, CHEST, "machine fly, butterfly, chest fly machine"),
        ex("machine_chest_press", "Chest Press Machine", MACHINE, CHEST, "seated chest press, machine press, hammer strength"),
        ex("incline_machine_press", "Incline Chest Press Machine", MACHINE, CHEST, "incline machine press, upper chest"),
        ex("smith_bench", "Smith Machine Bench Press", SMITH, CHEST, "smith bench"),
        ex("smith_incline", "Smith Machine Incline Press", SMITH, CHEST, "smith incline bench"),
        ex("push_up", "Push-Up", BODYWEIGHT, CHEST, "pushups, press up, press-ups"),
        ex("chest_dip", "Chest Dip", BODYWEIGHT, CHEST, "dips, parallel bar dips, leaning dips"),
        ex("floor_press", "Floor Press", BARBELL, CHEST, "barbell floor press"),
        ex("landmine_press", "Landmine Press", BARBELL, CHEST, "landmine chest press"),

        // Back
        ex("deadlift", "Deadlift", BARBELL, BACK, "conventional deadlift, dl, deads"),
        ex("sumo_deadlift", "Sumo Deadlift", BARBELL, BACK, "sumo dl"),
        ex("rack_pull", "Rack Pull", BARBELL, BACK, "block pull, partial deadlift"),
        ex("barbell_row", "Barbell Row", BARBELL, BACK, "bent over row, bb row, bent-over barbell row"),
        ex("pendlay_row", "Pendlay Row", BARBELL, BACK, "dead stop row"),
        ex("t_bar_row", "T-Bar Row", BARBELL, BACK, "t bar row, landmine row"),
        ex("db_row", "One-Arm Dumbbell Row", DUMBBELL, BACK, "db row, single arm row, kroc row"),
        ex("chest_supported_row", "Chest-Supported Row", DUMBBELL, BACK, "incline db row, seal row, chest supported dumbbell row"),
        ex("cable_row", "Seated Cable Row", CABLE, BACK, "cable row, low row, seated row"),
        ex("machine_row", "Seated Row Machine", MACHINE, BACK, "machine row, hammer strength row, low row machine"),
        ex("lat_pulldown", "Lat Pulldown", CABLE, BACK, "pull down, lat pull down, wide grip pulldown, lats"),
        ex("close_grip_pulldown", "Close-Grip Lat Pulldown", CABLE, BACK, "v bar pulldown, narrow pulldown"),
        ex("single_arm_pulldown", "Single-Arm Lat Pulldown", CABLE, BACK, "one arm pulldown"),
        ex("straight_arm_pulldown", "Straight-Arm Pulldown", CABLE, BACK, "lat prayer, cable pullover"),
        ex("machine_pulldown", "Lat Pulldown Machine", MACHINE, BACK, "plate loaded pulldown, hammer strength pulldown"),
        ex("pull_up", "Pull-Up", BODYWEIGHT, BACK, "pullups, wide grip pull up"),
        ex("chin_up", "Chin-Up", BODYWEIGHT, BACK, "chinups, underhand pull up"),
        ex("assisted_pull_up", "Assisted Pull-Up", MACHINE, BACK, "assisted pullup machine, gravitron"),
        ex("inverted_row", "Inverted Row", BODYWEIGHT, BACK, "australian pull up, body row"),
        ex("back_extension", "Back Extension", BODYWEIGHT, BACK, "hyperextension, roman chair, lower back"),
        ex("good_morning", "Good Morning", BARBELL, HAMSTRINGS, "barbell good morning"),
        ex("bb_shrug", "Barbell Shrug", BARBELL, BACK, "shrugs, traps"),
        ex("db_shrug", "Dumbbell Shrug", DUMBBELL, BACK, "db shrugs, traps"),
        ex("face_pull", "Face Pull", CABLE, SHOULDERS, "rope face pull, rear delts"),
        ex("db_pullover", "Dumbbell Pullover", DUMBBELL, BACK, "db pullover, pull over"),
        ex("meadows_row", "Meadows Row", BARBELL, BACK, "landmine single arm row"),

        // Shoulders
        ex("ohp", "Overhead Press", BARBELL, SHOULDERS, "ohp, military press, standing press, shoulder press barbell"),
        ex("seated_db_press", "Seated Dumbbell Shoulder Press", DUMBBELL, SHOULDERS, "db shoulder press, seated db press, dumbbell ohp"),
        ex("arnold_press", "Arnold Press", DUMBBELL, SHOULDERS, "arnold dumbbell press"),
        ex("machine_shoulder_press", "Shoulder Press Machine", MACHINE, SHOULDERS, "machine ohp, seated shoulder press"),
        ex("smith_shoulder_press", "Smith Machine Shoulder Press", SMITH, SHOULDERS, "smith ohp"),
        ex("push_press", "Push Press", BARBELL, SHOULDERS, "barbell push press"),
        ex("z_press", "Z Press", BARBELL, SHOULDERS, "seated floor press overhead"),
        ex("lateral_raise", "Lateral Raise", DUMBBELL, SHOULDERS, "side raise, lat raise, db lateral, side delts"),
        ex("cable_lateral_raise", "Cable Lateral Raise", CABLE, SHOULDERS, "cable side raise, side delts"),
        ex("machine_lateral_raise", "Lateral Raise Machine", MACHINE, SHOULDERS, "machine side raise"),
        ex("front_raise", "Front Raise", DUMBBELL, SHOULDERS, "db front raise, front delts"),
        ex("upright_row", "Upright Row", BARBELL, SHOULDERS, "barbell upright row"),
        ex("rear_delt_fly", "Rear Delt Fly", DUMBBELL, SHOULDERS, "reverse fly, bent over fly, rear delts"),
        ex("reverse_pec_deck", "Reverse Pec Deck", MACHINE, SHOULDERS, "rear delt machine, reverse fly machine"),

        // Biceps
        ex("barbell_curl", "Barbell Curl", BARBELL, BICEPS, "bb curl, standing curl"),
        ex("ez_curl", "EZ-Bar Curl", BARBELL, BICEPS, "ez curl, ez bar"),
        ex("db_curl", "Dumbbell Curl", DUMBBELL, BICEPS, "db curl, bicep curl, alternating curl"),
        ex("hammer_curl", "Hammer Curl", DUMBBELL, BICEPS, "db hammer curl, neutral grip curl"),
        ex("incline_db_curl", "Incline Dumbbell Curl", DUMBBELL, BICEPS, "incline curl"),
        ex("preacher_curl", "Preacher Curl", BARBELL, BICEPS, "ez preacher curl, scott curl"),
        ex("machine_preacher_curl", "Preacher Curl Machine", MACHINE, BICEPS, "machine curl, bicep machine"),
        ex("cable_curl", "Cable Curl", CABLE, BICEPS, "cable bicep curl, straight bar cable curl"),
        ex("rope_hammer_curl", "Rope Hammer Curl", CABLE, BICEPS, "cable hammer curl"),
        ex("concentration_curl", "Concentration Curl", DUMBBELL, BICEPS, "seated concentration curl"),
        ex("spider_curl", "Spider Curl", DUMBBELL, BICEPS, "prone incline curl"),
        ex("bayesian_curl", "Bayesian Cable Curl", CABLE, BICEPS, "behind the body cable curl"),

        // Triceps
        ex("close_grip_bench", "Close-Grip Bench Press", BARBELL, TRICEPS, "cgbp, close grip bench"),
        ex("skull_crusher", "Skull Crusher", BARBELL, TRICEPS, "lying triceps extension, ez skull crusher, french press"),
        ex("tricep_pushdown", "Triceps Pushdown", CABLE, TRICEPS, "pushdown, tricep pulldown, straight bar pushdown, cable pushdown"),
        ex("rope_pushdown", "Rope Pushdown", CABLE, TRICEPS, "rope tricep pushdown, rope pulldown"),
        ex("overhead_cable_ext", "Overhead Cable Extension", CABLE, TRICEPS, "overhead tricep extension, rope overhead"),
        ex("db_overhead_ext", "Overhead Dumbbell Extension", DUMBBELL, TRICEPS, "db overhead tricep extension, french press"),
        ex("dip", "Dip", BODYWEIGHT, TRICEPS, "triceps dips, parallel dips, dips"),
        ex("bench_dip", "Bench Dip", BODYWEIGHT, TRICEPS, "chair dips"),
        ex("machine_dip", "Dip Machine", MACHINE, TRICEPS, "seated dip machine, tricep press machine"),
        ex("tricep_kickback", "Triceps Kickback", DUMBBELL, TRICEPS, "db kickback, kickbacks"),
        ex("jm_press", "JM Press", BARBELL, TRICEPS, "jm press"),
        ex("diamond_push_up", "Diamond Push-Up", BODYWEIGHT, TRICEPS, "close grip push up, triangle push up"),

        // Forearms
        ex("wrist_curl", "Wrist Curl", DUMBBELL, FOREARMS, "forearm curl"),
        ex("reverse_wrist_curl", "Reverse Wrist Curl", DUMBBELL, FOREARMS, "wrist extension"),
        ex("reverse_curl", "Reverse Curl", BARBELL, FOREARMS, "overhand curl, ez reverse curl"),
        ex("farmers_walk", "Farmer's Walk", DUMBBELL, FOREARMS, "farmers carry, grip"),
        ex("dead_hang", "Dead Hang", BODYWEIGHT, FOREARMS, "bar hang, grip"),

        // Quads
        ex("squat", "Back Squat", BARBELL, QUADS, "squat, bb squat, barbell squat, high bar, low bar"),
        ex("front_squat", "Front Squat", BARBELL, QUADS, "barbell front squat"),
        ex("goblet_squat", "Goblet Squat", DUMBBELL, QUADS, "db squat, kettlebell squat"),
        ex("hack_squat", "Hack Squat", MACHINE, QUADS, "hack squat machine"),
        ex("leg_press", "Leg Press", MACHINE, QUADS, "45 degree leg press, sled press, legs"),
        ex("single_leg_press", "Single-Leg Press", MACHINE, QUADS, "one leg press, unilateral leg press"),
        ex("leg_extension", "Leg Extension", MACHINE, QUADS, "quad extension, leg ext"),
        ex("bulgarian_split_squat", "Bulgarian Split Squat", DUMBBELL, QUADS, "bss, rear foot elevated split squat, split squat"),
        ex("db_lunge", "Dumbbell Lunge", DUMBBELL, QUADS, "lunges, db lunge, reverse lunge"),
        ex("walking_lunge", "Walking Lunge", DUMBBELL, QUADS, "walking lunges"),
        ex("barbell_lunge", "Barbell Lunge", BARBELL, QUADS, "bb lunge"),
        ex("smith_squat", "Smith Machine Squat", SMITH, QUADS, "smith squat"),
        ex("step_up", "Step-Up", DUMBBELL, QUADS, "box step up, db step up"),
        ex("pendulum_squat", "Pendulum Squat", MACHINE, QUADS, "pendulum"),
        ex("belt_squat", "Belt Squat", MACHINE, QUADS, "belt squat machine"),
        ex("sissy_squat", "Sissy Squat", BODYWEIGHT, QUADS, "sissy"),
        ex("box_squat", "Box Squat", BARBELL, QUADS, "barbell box squat"),
        ex("pause_squat", "Pause Squat", BARBELL, QUADS, "paused squat"),
        ex("safety_bar_squat", "Safety Bar Squat", BARBELL, QUADS, "ssb squat"),
        ex("bodyweight_squat", "Bodyweight Squat", BODYWEIGHT, QUADS, "air squat"),

        // Hamstrings
        ex("rdl", "Romanian Deadlift", BARBELL, HAMSTRINGS, "rdl, romanian, barbell rdl"),
        ex("db_rdl", "Dumbbell Romanian Deadlift", DUMBBELL, HAMSTRINGS, "db rdl, dumbbell rdl"),
        ex("stiff_leg_deadlift", "Stiff-Leg Deadlift", BARBELL, HAMSTRINGS, "sldl, stiff legged deadlift"),
        ex("single_leg_rdl", "Single-Leg Romanian Deadlift", DUMBBELL, HAMSTRINGS, "single leg rdl, one leg rdl"),
        ex("lying_leg_curl", "Lying Leg Curl", MACHINE, HAMSTRINGS, "hamstring curl, prone leg curl, leg curl"),
        ex("seated_leg_curl", "Seated Leg Curl", MACHINE, HAMSTRINGS, "hamstring curl, leg curl"),
        ex("nordic_curl", "Nordic Curl", BODYWEIGHT, HAMSTRINGS, "nordic hamstring curl, nordics"),
        ex("glute_ham_raise", "Glute-Ham Raise", BODYWEIGHT, HAMSTRINGS, "ghr"),
        ex("kb_swing", "Kettlebell Swing", KETTLEBELL, HAMSTRINGS, "kb swing, russian swing"),

        // Glutes
        ex("hip_thrust", "Hip Thrust", BARBELL, GLUTES, "barbell hip thrust, glute bridge barbell"),
        ex("machine_hip_thrust", "Hip Thrust Machine", MACHINE, GLUTES, "glute drive machine"),
        ex("glute_bridge", "Glute Bridge", BODYWEIGHT, GLUTES, "bridge"),
        ex("cable_kickback", "Cable Glute Kickback", CABLE, GLUTES, "glute kickback, donkey kick"),
        ex("hip_abduction", "Hip Abduction Machine", MACHINE, GLUTES, "abductor, outer thigh"),
        ex("hip_adduction", "Hip Adduction Machine", MACHINE, QUADS, "adductor, inner thigh"),
        ex("cable_pull_through", "Cable Pull-Through", CABLE, GLUTES, "pull through"),
        ex("reverse_hyper", "Reverse Hyperextension", MACHINE, GLUTES, "reverse hyper"),

        // Calves
        ex("standing_calf_raise", "Standing Calf Raise", MACHINE, CALVES, "calf raise machine, calves"),
        ex("seated_calf_raise", "Seated Calf Raise", MACHINE, CALVES, "seated calves, soleus"),
        ex("leg_press_calf_raise", "Leg Press Calf Raise", MACHINE, CALVES, "calf press"),
        ex("smith_calf_raise", "Smith Machine Calf Raise", SMITH, CALVES, "smith calves"),
        ex("db_calf_raise", "Dumbbell Calf Raise", DUMBBELL, CALVES, "single leg calf raise"),

        // Abs
        ex("crunch", "Crunch", BODYWEIGHT, ABS, "sit up, abs crunch"),
        ex("cable_crunch", "Cable Crunch", CABLE, ABS, "kneeling cable crunch, rope crunch"),
        ex("machine_crunch", "Ab Crunch Machine", MACHINE, ABS, "crunch machine"),
        ex("hanging_leg_raise", "Hanging Leg Raise", BODYWEIGHT, ABS, "leg raises, toes to bar"),
        ex("hanging_knee_raise", "Hanging Knee Raise", BODYWEIGHT, ABS, "knee raises, captain's chair"),
        ex("lying_leg_raise", "Lying Leg Raise", BODYWEIGHT, ABS, "leg raise"),
        ex("plank", "Plank", BODYWEIGHT, ABS, "front plank, core"),
        ex("side_plank", "Side Plank", BODYWEIGHT, ABS, "obliques"),
        ex("ab_wheel", "Ab Wheel Rollout", OTHER, ABS, "ab roller, rollout"),
        ex("russian_twist", "Russian Twist", BODYWEIGHT, ABS, "obliques, twist"),
        ex("decline_situp", "Decline Sit-Up", BODYWEIGHT, ABS, "decline crunch, sit ups"),
        ex("bicycle_crunch", "Bicycle Crunch", BODYWEIGHT, ABS, "bicycles, obliques"),
        ex("woodchopper", "Cable Woodchopper", CABLE, ABS, "wood chop, obliques"),
        ex("pallof_press", "Pallof Press", CABLE, ABS, "anti rotation press, core"),
        ex("dead_bug", "Dead Bug", BODYWEIGHT, ABS, "core"),
        ex("mountain_climber", "Mountain Climber", BODYWEIGHT, ABS, "mountain climbers"),

        // Full body
        ex("power_clean", "Power Clean", BARBELL, FULL_BODY, "clean, olympic lift"),
        ex("clean_and_jerk", "Clean and Jerk", BARBELL, FULL_BODY, "c&j, olympic lift"),
        ex("snatch", "Snatch", BARBELL, FULL_BODY, "power snatch, olympic lift"),
        ex("thruster", "Thruster", BARBELL, FULL_BODY, "squat press"),
        ex("burpee", "Burpee", BODYWEIGHT, FULL_BODY, "burpees"),
        ex("kb_clean_press", "Kettlebell Clean & Press", KETTLEBELL, FULL_BODY, "kb clean and press"),
        ex("turkish_get_up", "Turkish Get-Up", KETTLEBELL, FULL_BODY, "tgu"),
        ex("sled_push", "Sled Push", OTHER, FULL_BODY, "prowler"),
    )

    val byId: Map<String, ExerciseInfo> = all.associateBy { it.id }

    private val order: Map<String, Int> = all.withIndex().associate { it.value.id to it.index }

    // Gym shorthand people actually type into the search box.
    private val synonyms = mapOf(
        "db" to "dumbbell", "dbs" to "dumbbell", "bb" to "barbell", "kb" to "kettlebell",
        "ohp" to "overhead", "rdl" to "romanian", "bw" to "bodyweight", "legs" to "leg",
        "pecs" to "chest", "lats" to "lat", "delts" to "shoulders", "tris" to "triceps",
        "bis" to "biceps", "quad" to "quads", "hammies" to "hamstrings", "glute" to "glutes",
        "ab" to "abs", "core" to "abs", "calf" to "calves", "trap" to "traps",
    )

    fun normalize(s: String): String =
        s.lowercase().replace(Regex("[^a-z0-9 ]"), " ").replace(Regex("\\s+"), " ").trim()

    private fun tokens(s: String): List<String> = normalize(s).split(' ').filter { it.isNotEmpty() }

    /**
     * Search by name, alias, muscle or equipment. Every query word must match the start of
     * some word in the exercise's text, so "inc db" finds "Incline Dumbbell Press".
     * Results are ranked: name matches first, then aliases, then muscle/equipment.
     */
    fun search(query: String, pool: List<ExerciseInfo> = all): List<ExerciseInfo> {
        val q = tokens(query)
        if (q.isEmpty()) return pool.sortedBy { it.name }
        // Plurals ("pull ups", "curls", "presses") match the singular names.
        val expanded = q.map { w ->
            val singular = if (w.length >= 3 && w.endsWith("s")) listOf(w.dropLast(1), w.removeSuffix("es")) else emptyList()
            (listOfNotNull(w, synonyms[w]) + singular).distinct().filter { it.isNotEmpty() }
        }
        return pool.mapNotNull { e ->
            val nameT = tokens(e.name)
            val aliasT = tokens(e.aliases)
            val metaT = tokens(e.muscle.label + " " + e.equipment.label)
            var score = 0
            for (alts in expanded) {
                val s = alts.maxOf { word ->
                    when {
                        nameT.any { it == word } -> 6
                        nameT.any { it.startsWith(word) } -> 4
                        aliasT.any { it == word } -> 3
                        aliasT.any { it.startsWith(word) } -> 2
                        metaT.any { it.startsWith(word) } -> 1
                        else -> 0
                    }
                }
                if (s == 0) return@mapNotNull null
                score += s
            }
            val full = normalize(query)
            val nameN = normalize(e.name)
            if (nameN == full) score += 20 else if (nameN.startsWith(full)) score += 8
            if (e.aliases.split(',').any { normalize(it) == full }) score += 10
            else if (aliasT.joinToString(" ").contains(full)) score += 2
            e to score
        }.sortedWith(
            // Ties go to library order, which lists the common version of a lift first.
            compareByDescending<Pair<ExerciseInfo, Int>> { it.second }
                .thenBy { order[it.first.id] ?: Int.MAX_VALUE }
                .thenBy { it.first.name },
        ).map { it.first }
    }

    /** Best single match for free text (used by the progress importer), or null if nothing is close. */
    fun bestMatch(text: String, pool: List<ExerciseInfo> = all): ExerciseInfo? {
        val n = normalize(text)
        if (n.isEmpty()) return null
        pool.firstOrNull { normalize(it.name) == n }?.let { return it }
        pool.firstOrNull { e -> e.aliases.split(',').any { normalize(it) == n } }?.let { return it }
        return search(text, pool).firstOrNull()
    }

    fun guessEquipment(name: String): Equipment {
        val t = tokens(name)
        return when {
            t.any { it == "db" || it.startsWith("dumbbell") } -> DUMBBELL
            t.any { it == "kb" || it.startsWith("kettlebell") } -> KETTLEBELL
            t.any { it.startsWith("cable") || it == "rope" } -> CABLE
            t.any { it == "smith" } -> SMITH
            t.any { it.startsWith("machine") || it == "press" && "leg" in t } -> MACHINE
            t.any { it == "bb" || it.startsWith("barbell") } -> BARBELL
            else -> OTHER
        }
    }

    // One arm or one leg at a time, so they start out logging left and right reps.
    private val unilateralIds = setOf(
        "db_row", "single_arm_pulldown", "meadows_row", "concentration_curl", "single_leg_press",
        "bulgarian_split_squat", "db_lunge", "walking_lunge", "barbell_lunge", "step_up",
        "single_leg_rdl", "cable_kickback",
    )
    private val unilateralName = Regex("""\b(single|one)[- ]?(arm|leg|hand|side)|unilateral|split squat|lunge|step[- ]?up""", RegexOption.IGNORE_CASE)

    fun isUnilateral(e: ExerciseInfo): Boolean =
        e.id in unilateralIds || e.custom && unilateralName.containsMatchIn(e.name)
}
