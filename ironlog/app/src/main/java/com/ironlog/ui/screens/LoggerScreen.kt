package com.ironlog.ui.screens

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.ironlog.domain.Equipment
import com.ironlog.domain.STEP_CHOICES_KG
import com.ironlog.domain.STEP_CHOICES_LB
import com.ironlog.domain.SetEntry
import com.ironlog.domain.WeightUnit
import com.ironlog.domain.exercise
import com.ironlog.domain.formatNumber
import com.ironlog.domain.formatSet
import com.ironlog.domain.history
import com.ironlog.domain.kgTo
import com.ironlog.domain.label
import com.ironlog.domain.lastPoint
import com.ironlog.domain.lastSets
import com.ironlog.domain.records
import com.ironlog.domain.activeSession
import com.ironlog.domain.asPerSide
import com.ironlog.domain.isPerSide
import com.ironlog.domain.withSides
import com.ironlog.domain.startingWeightKg
import com.ironlog.domain.stepFor
import com.ironlog.domain.stepWeight
import com.ironlog.domain.toKg
import com.ironlog.ui.AppState
import com.ironlog.ui.Screen
import com.ironlog.ui.components.BottomActions
import com.ironlog.ui.components.ButtonStyle
import com.ironlog.ui.components.Chip
import com.ironlog.ui.components.CircleIconButton
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.GlassSwitch
import com.ironlog.ui.components.GlassTextField
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.NoteBadge
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.PillShape
import com.ironlog.ui.components.Stepper
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.components.glass
import com.ironlog.ui.components.pressable
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import com.ironlog.ui.platform.SystemBackHandler
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Sets as flat [weight, reps, note, left, right] groups (-1 = no side), which a saved-state Bundle can hold. */
private val SetListSaver = listSaver<SnapshotStateList<SetEntry>, Any>(
    save = { list -> list.flatMap { listOf(it.weightKg, it.reps, it.note ?: "", it.left ?: -1, it.right ?: -1) } },
    restore = { flat ->
        flat.chunked(5).map { (w, r, n, l, rr) ->
            SetEntry(w as Double, r as Int, (n as String).ifEmpty { null }, (l as Int).takeIf { it >= 0 }, (rr as Int).takeIf { it >= 0 })
        }.toMutableStateList()
    },
)

private val QUICK_NOTES = listOf(
    "Check form", "Rest 2 min", "Drink water 💧", "Go heavier next time", "Slow on the way down",
    "Seat on notch 4", "Use a spotter", "Felt easy 😎", "Felt tough 😮‍💨", "Warm up first",
)

@Composable
fun LoggerScreen(app: AppState, workoutId: String?, exerciseId: String, sessionId: String?) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    val info = data.exercise(exerciseId)
    val unit = data.settings.unit
    val today = app.today()

    // Work out once which session we're writing to and what to prefill.
    val target = remember {
        val d = app.current
        sessionId?.let { id -> d.sessions.firstOrNull { it.id == id } }
            ?: workoutId?.let { d.activeSession(it, today, app.nowMillis()) }
    }
    val existing = remember { target?.entries?.firstOrNull { it.exerciseId == exerciseId }?.sets }
    val hist = remember(data) { data.history(exerciseId, excludeSessionId = target?.id) }
    val perSide = data.isPerSide(info)
    // Saveable, so the sets you've adjusted survive opening the graph or rotating the phone.
    val rows = rememberSaveable(saver = SetListSaver) {
        (existing ?: hist.lastSets()?.filter { it.reps > 0 }?.takeIf { it.isNotEmpty() }
            ?: List(3) { SetEntry(startingWeightKg(info.equipment, unit), 10) }).map { it.asPerSide(perSide) }.toMutableStateList()
    }
    // What was on screen when it opened; anything different counts as unsaved.
    val initial = rememberSaveable(saver = SetListSaver) { rows.toList().toMutableStateList() }
    // Switching left/right on or off reshapes the sets; that alone isn't an unsaved change.
    LaunchedEffect(perSide) {
        for (i in rows.indices) rows[i] = rows[i].asPerSide(perSide)
        for (i in initial.indices) initial[i] = initial[i].asPerSide(perSide)
    }
    val dirty = rows.toList() != initial.toList()
    val step = stepFor(data, info)
    val bodyweight = info.equipment == Equipment.BODYWEIGHT

    var challenged by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!challenged && sessionId == null && existing == null) app.maybeChallenge(exerciseId)
        challenged = true
    }

    fun save() = app.saveExercise(workoutId, exerciseId, rows.toList(), sessionId)

    fun leave() {
        if (!dirty) {
            app.pop()
            return
        }
        app.confirm(
            "Save your sets?",
            "You changed ${info.name} but haven't saved it.",
            "Save",
            cancelText = "Discard",
            onCancel = { app.closeOverlay(); app.pop() },
        ) { app.closeOverlay(); save() }
    }
    SystemBackHandler(enabled = dirty && app.overlay == null) { leave() }

    fun weightText(kg: Double): String =
        if (bodyweight && kg == 0.0) "BW" else formatNumber(kg.kgTo(unit))

    fun editNumber(title: String, initial: String, suffix: String?, decimal: Boolean, apply: (Double) -> Unit) {
        app.sheet { NumberSheet(app, title, initial, suffix, decimal, apply) }
    }

    Box(Modifier.fillMaxSize()) {
        Page(bottomInset = 110.dp) {
            item {
                TopBar(info.name, { leave() }, subtitle = "${info.muscle.label} · ${info.equipment.label}") {
                    CircleIconButton(IronIcons.Chart, { app.push(Screen.ExerciseStats(exerciseId)) }, contentDescription = "Graph")
                }
            }
            item {
                val last = hist.lastPoint()
                val rec = hist.records()
                GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(16.dp)) {
                    if (last == null) {
                        Text("FIRST TIME 🎉", style = Type.label, color = p.accent)
                        VSpace(4.dp)
                        Text("Set your starting weight and reps, then hit save. Next time it'll be filled in for you.", style = Type.bodySmall, color = p.textMuted)
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "LAST TIME" + (last.date?.let { " · " + it.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.UK)).uppercase() } ?: " · IMPORTED"),
                                style = Type.label, color = p.accent, modifier = Modifier.weight(1f),
                            )
                            rec.heaviest?.let {
                                Text(
                                    "🏆 " + formatSet(it, unit, info.equipment),
                                    style = Type.label, color = p.text,
                                    modifier = Modifier.clip(PillShape).background(p.field).padding(horizontal = 10.dp, vertical = 5.dp),
                                )
                            }
                        }
                        VSpace(8.dp)
                        Text(
                            last.sets.filter { it.reps > 0 }.joinToString("   ") { formatSet(it, unit, info.equipment) },
                            style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text,
                        )
                    }
                }
                VSpace(16.dp)
                Row(Modifier.padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("SET", style = Type.label, color = p.textFaint, modifier = Modifier.width(36.dp))
                    Text(if (bodyweight) "ADDED ${unit.label.uppercase()}" else "WEIGHT ${unit.label.uppercase()}", style = Type.label, color = p.textFaint, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                    Text(if (perSide) "REPS L / R" else "REPS", style = Type.label, color = p.textFaint, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                    Text("NOTE", style = Type.label, color = p.textFaint, modifier = Modifier.width(44.dp), textAlign = TextAlign.Center)
                }
                VSpace(8.dp)
            }
            itemsIndexed(rows) { i, set ->
                SetRow(
                    index = i,
                    weight = weightText(set.weightKg),
                    hasNote = !set.note.isNullOrBlank(),
                    onWeightMinus = { rows[i] = rows[i].copy(weightKg = stepWeight(rows[i].weightKg, step, unit, up = false)) },
                    onWeightPlus = { rows[i] = rows[i].copy(weightKg = stepWeight(rows[i].weightKg, step, unit, up = true)) },
                    onWeightClick = {
                        editNumber("Set ${i + 1} weight", formatNumber(rows[i].weightKg.kgTo(unit)), unit.label, true) { v ->
                            if (i < rows.size) rows[i] = rows[i].copy(weightKg = v.coerceIn(0.0, 2000.0).toKg(unit))
                        }
                    },
                    reps = { mod ->
                        if (set.perSide) {
                            // Two counters, left over right. Each edits its own side.
                            fun side(isLeft: Boolean, change: (Int) -> Int) {
                                if (i >= rows.size || !rows[i].perSide) return
                                val s = rows[i]
                                val l = if (isLeft) change(s.left!!).coerceIn(0, 999) else s.left!!
                                val r = if (isLeft) s.right!! else change(s.right!!).coerceIn(0, 999)
                                rows[i] = s.withSides(l, r)
                            }
                            Column(mod, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                listOf(true, false).forEach { isLeft ->
                                    val n = if (isLeft) set.left!! else set.right!!
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(if (isLeft) "L" else "R", style = Type.label, color = p.accent2, modifier = Modifier.width(14.dp), textAlign = TextAlign.Center)
                                        Stepper(
                                            n.toString(),
                                            { side(isLeft) { it - 1 } },
                                            { side(isLeft) { it + 1 } },
                                            {
                                                editNumber("Set ${i + 1} ${if (isLeft) "left" else "right"} reps", n.toString(), "reps", false) { v ->
                                                    side(isLeft) { v.toInt() }
                                                }
                                            },
                                            Modifier.weight(1f), dim = n == 0,
                                        )
                                    }
                                }
                            }
                        } else {
                            Stepper(
                                set.reps.toString(),
                                { rows[i] = rows[i].copy(reps = (rows[i].reps - 1).coerceAtLeast(0)) },
                                { rows[i] = rows[i].copy(reps = (rows[i].reps + 1).coerceAtMost(999)) },
                                {
                                    editNumber("Set ${i + 1} reps", rows[i].reps.toString(), "reps", false) { v ->
                                        if (i < rows.size) rows[i] = rows[i].copy(reps = v.toInt().coerceIn(0, 999))
                                    }
                                },
                                mod, dim = set.reps == 0,
                            )
                        }
                    },
                    onNote = {
                        app.sheet {
                            SetNoteSheet(app, i, rows[i].note) { note ->
                                if (i >= rows.size) return@SetNoteSheet
                                val old = rows[i].note
                                rows[i] = rows[i].copy(note = note)
                                // Deleting a carried-forward note takes it off the old session
                                // straight away, so it doesn't reappear next time.
                                if (note == null && old != null) {
                                    app.deleteCarriedNote(exerciseId, old)
                                    if (i < initial.size && initial[i].note == old) initial[i] = initial[i].copy(note = null)
                                }
                            }
                        }
                    },
                    onLongPress = {
                        if (rows.size > 1) {
                            app.confirm("Delete set ${i + 1}?", "Only this set is removed.", "Delete", danger = true) {
                                if (i < rows.size) rows.removeAt(i)
                                app.closeOverlay()
                            }
                        }
                    },
                )
                VSpace(8.dp)
            }
            item {
                VSpace(4.dp)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GlassButton("Add set", {
                        val lastRow = rows.lastOrNull()
                        rows.add(lastRow?.copy(note = null) ?: SetEntry(startingWeightKg(info.equipment, unit), 10).asPerSide(perSide))
                    }, Modifier.weight(1f), icon = IronIcons.Plus, style = ButtonStyle.SECONDARY, height = 50.dp)
                    GlassButton("Remove set", { if (rows.size > 1) rows.removeAt(rows.lastIndex) }, Modifier.weight(1f), icon = IronIcons.Minus, style = ButtonStyle.SECONDARY, height = 50.dp, enabled = rows.size > 1)
                }
                VSpace(14.dp)
                Row(
                    Modifier.fillMaxWidth().pressable({ app.sheet { StepSheet(app, exerciseId, step, unit) } }).glass(p, RoundedCornerShape(20.dp)).padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(IronIcons.Repeat, null, tint = p.accent2, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text("+/− moves ${formatNumber(step)} ${unit.label}", style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text)
                        Text("Tap to match your machine or dumbbells", style = Type.bodySmall, color = p.textMuted)
                    }
                    Icon(IronIcons.ChevronRight, null, tint = p.textFaint, modifier = Modifier.size(20.dp))
                }
                VSpace(10.dp)
                Row(
                    Modifier.fillMaxWidth().pressable({ app.setPerSide(exerciseId, !perSide) }, haptic = true).glass(p, RoundedCornerShape(20.dp)).padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("L·R", style = Type.label, color = p.accent2, modifier = Modifier.width(30.dp), textAlign = TextAlign.Center, maxLines = 1, softWrap = false)
                    Spacer(Modifier.width(6.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Left & right reps", style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text)
                        Text("Count each arm or leg separately", style = Type.bodySmall, color = p.textMuted)
                    }
                    GlassSwitch(perSide, { app.setPerSide(exerciseId, it) })
                }
                if (existing != null) {
                    VSpace(10.dp)
                    GlassButton(
                        if (sessionId == null) "Remove from today" else "Remove from this session",
                        { app.saveExercise(workoutId, exerciseId, emptyList(), sessionId) },
                        Modifier.fillMaxWidth(), icon = IronIcons.Trash, style = ButtonStyle.GHOST, accent = p.danger,
                    )
                }
                VSpace(4.dp)
                Text(
                    "Tip: tap a number to type it. Hold a set to delete it. Sets with 0 reps aren't saved.",
                    style = Type.bodySmall, color = p.textFaint, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                )
            }
        }
        BottomActions {
            GlassButton("SAVE", { save() }, Modifier.weight(1f), icon = IronIcons.Check)
        }
    }
}

@Composable
private fun SetRow(
    index: Int,
    weight: String,
    hasNote: Boolean,
    onWeightMinus: () -> Unit,
    onWeightPlus: () -> Unit,
    onWeightClick: () -> Unit,
    /** The reps counter (or left and right counters), given the modifier to lay itself out with. */
    reps: @Composable (Modifier) -> Unit,
    onNote: () -> Unit,
    onLongPress: () -> Unit,
) {
    val p = LocalPalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .pressable(onClick = null, onLongClick = onLongPress, scaleDown = 0.99f)
            .glass(p, RoundedCornerShape(22.dp))
            .padding(horizontal = 6.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(30.dp).clip(CircleShape).background(p.accent.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
            Text("${index + 1}", style = Type.label, color = p.accent)
        }
        Spacer(Modifier.width(6.dp))
        Stepper(weight, onWeightMinus, onWeightPlus, onWeightClick, Modifier.weight(1f))
        Spacer(Modifier.width(4.dp))
        reps(Modifier.weight(1f))
        Box(Modifier.size(44.dp).pressable(onNote, scaleDown = 0.85f, haptic = true), contentAlignment = Alignment.Center) {
            if (hasNote) NoteBadge(p.note) else Icon(IronIcons.NoteLines, "Add note", tint = p.textFaint, modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun NumberSheet(app: AppState, title: String, initial: String, suffix: String?, decimal: Boolean, apply: (Double) -> Unit) {
    val p = LocalPalette.current
    var text by remember { mutableStateOf(initial) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    fun done() {
        text.replace(',', '.').toDoubleOrNull()?.let(apply)
        app.closeOverlay()
    }
    Text(title, style = Type.title, color = p.text)
    VSpace(14.dp)
    GlassTextField(
        text, { s -> text = s.filter { it.isDigit() || (decimal && (it == '.' || it == ',')) } },
        Modifier.fillMaxWidth(),
        keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number,
        suffix = suffix, onDone = ::done, focusRequester = focus,
        textStyle = Type.number,
        minHeight = 66.dp,
        selectAll = true,
    )
    VSpace(16.dp)
    GlassButton("SET", ::done, Modifier.fillMaxWidth())
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SetNoteSheet(app: AppState, index: Int, current: String?, onChange: (String?) -> Unit) {
    val p = LocalPalette.current
    var text by remember { mutableStateOf(current.orEmpty()) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (!current.isNullOrBlank()) NoteBadge(p.note) else Icon(IronIcons.NoteLines, null, tint = p.textMuted, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(12.dp))
        Text("Note for set ${index + 1}", style = Type.title, color = p.text)
    }
    VSpace(6.dp)
    Text("It stays on this set next time too, until you delete it.", style = Type.bodySmall, color = p.textMuted)
    VSpace(14.dp)
    GlassTextField(text, { text = it }, Modifier.fillMaxWidth(), placeholder = "e.g. check form, rest 2 min…", singleLine = false, minHeight = 96.dp, maxLength = 300)
    VSpace(12.dp)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        QUICK_NOTES.forEach { q -> Chip(q, false, { text = if (text.isBlank()) q else text.trimEnd() + ". " + q }) }
    }
    VSpace(18.dp)
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!current.isNullOrBlank()) {
            GlassButton("Delete note", { onChange(null); app.closeOverlay() }, Modifier.weight(1f), icon = IronIcons.Trash, style = ButtonStyle.DANGER, height = 52.dp)
        }
        GlassButton(if (current.isNullOrBlank()) "Save note" else "Keep", {
            onChange(text.trim().ifEmpty { null }); app.closeOverlay()
        }, Modifier.weight(1f), icon = IronIcons.Check, height = 52.dp)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StepSheet(app: AppState, exerciseId: String, current: Double, unit: WeightUnit) {
    val p = LocalPalette.current
    var custom by remember { mutableStateOf("") }
    Text("Weight step", style = Type.title, color = p.text)
    VSpace(6.dp)
    Text(
        "How much + and − change the weight for this exercise. Machines often go up in 5 or 7 ${unit.label}; " +
            "the app also learns it from the weights you type.",
        style = Type.bodySmall, color = p.textMuted,
    )
    VSpace(14.dp)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        (if (unit == WeightUnit.KG) STEP_CHOICES_KG else STEP_CHOICES_LB).forEach { s ->
            Chip("${formatNumber(s)} ${unit.label}", s == current, { app.setStep(exerciseId, s); app.closeOverlay() })
        }
    }
    VSpace(14.dp)
    Row(verticalAlignment = Alignment.CenterVertically) {
        GlassTextField(custom, { s -> custom = s.filter { it.isDigit() || it == '.' || it == ',' } }, Modifier.weight(1f), placeholder = "Custom", keyboardType = KeyboardType.Decimal, suffix = unit.label)
        Spacer(Modifier.width(10.dp))
        GlassButton("Use", {
            custom.replace(',', '.').toDoubleOrNull()?.takeIf { it > 0 && it <= 100 }?.let { app.setStep(exerciseId, it) }
            app.closeOverlay()
        }, height = 54.dp)
    }
}
