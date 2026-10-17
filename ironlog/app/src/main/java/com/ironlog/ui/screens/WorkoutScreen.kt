package com.ironlog.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ironlog.domain.exercise
import com.ironlog.domain.formatSet
import com.ironlog.domain.history
import com.ironlog.domain.lastPoint
import com.ironlog.domain.activeSession
import com.ironlog.domain.workout
import com.ironlog.ui.AppState
import com.ironlog.ui.Screen
import com.ironlog.ui.components.BottomActions
import com.ironlog.ui.components.ButtonStyle
import com.ironlog.ui.components.CircleIconButton
import com.ironlog.ui.components.EmptyState
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.NoteBadge
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.PillShape
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.daysLabel
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import com.ironlog.ui.theme.contentOn
import com.ironlog.ui.theme.ink
import com.ironlog.ui.theme.workout

@Composable
fun WorkoutScreen(app: AppState, workoutId: String) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    val w = data.workout(workoutId)
    if (w == null) {
        Page { item { TopBar("Workout not found", { app.pop() }) } }
        return
    }
    val color = p.workout(w.color)
    val today = app.today()
    val session = data.activeSession(w.id, today, app.nowMillis())
    val doneIds = session?.entries?.map { it.exerciseId }?.toSet() ?: emptySet()
    val unit = data.settings.unit
    // Exercises logged today stay listed even if they were since removed from the workout.
    val shownIds = w.exerciseIds + doneIds.filter { it !in w.exerciseIds }
    val doneCount = shownIds.count { it in doneIds }

    Box(Modifier.fillMaxSize()) {
        Page(bottomInset = 110.dp) {
            item {
                TopBar("${w.name} ${w.emoji}".trim(), { app.pop() }, subtitle = daysLabel(w.days)) {
                    CircleIconButton(IronIcons.Edit, { app.startWorkoutEditor(w.id) }, contentDescription = "Edit")
                }
            }
            if (shownIds.isNotEmpty()) {
                item {
                    GlassCard(Modifier.fillMaxWidth(), tint = color, tintAlpha = 0.12f, padding = PaddingValues(18.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("TODAY", style = Type.label, color = p.ink(color), modifier = Modifier.weight(1f))
                            Text("$doneCount / ${shownIds.size} done", style = Type.label, color = p.text)
                        }
                        VSpace(12.dp)
                        Box(Modifier.fillMaxWidth().height(10.dp).clip(PillShape).background(p.field)) {
                            val frac = if (shownIds.isEmpty()) 0f else doneCount.toFloat() / shownIds.size
                            if (frac > 0f) {
                                Box(
                                    Modifier.fillMaxWidth(frac).fillMaxHeight().clip(PillShape)
                                        .background(Brush.horizontalGradient(listOf(color.copy(alpha = 0.6f), color))),
                                )
                            }
                        }
                        VSpace(10.dp)
                        Text(
                            if (doneCount == 0) "Tap an exercise to log it. Skip any you're not doing today."
                            else if (doneCount == shownIds.size) "All done! Hit FINISH to wrap it up 🏁"
                            else "Keep going — ${shownIds.size - doneCount} to go 💪",
                            style = Type.bodySmall, color = p.textMuted,
                        )
                    }
                    VSpace(18.dp)
                    SectionLabel("Exercises")
                }
            }
            if (shownIds.isEmpty()) {
                item {
                    EmptyState(IronIcons.Dumbbell, "No exercises yet", "Add the exercises you do on this day.") {
                        GlassButton("Add exercises", { app.push(Screen.Picker(w.id)) }, icon = IronIcons.Plus)
                    }
                }
            }
            itemsIndexed(shownIds, key = { _, id -> id }) { i, id ->
                val info = data.exercise(id)
                val done = id in doneIds
                val todaySets = session?.entries?.firstOrNull { it.exerciseId == id }?.sets
                val last = data.history(id, excludeSessionId = session?.id).lastPoint()
                val hasNote = (todaySets ?: last?.sets)?.any { !it.note.isNullOrBlank() } == true
                GlassCard(
                    Modifier.fillMaxWidth(),
                    onClick = { app.push(Screen.Logger(w.id, id)) },
                    onLongClick = {
                        app.confirm("Remove ${info.name}?", "It comes off this workout. Its history stays.", "Remove", danger = true) {
                            app.removeExerciseFromWorkout(w.id, id); app.closeOverlay()
                        }
                    },
                    tint = if (done) color else androidx.compose.ui.graphics.Color.Transparent,
                    tintAlpha = 0.1f,
                    padding = PaddingValues(16.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(38.dp).clip(CircleShape).background(if (done) color else p.field),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (done) Icon(IronIcons.Check, null, tint = contentOn(color), modifier = Modifier.size(20.dp))
                            else Text("${i + 1}", style = Type.label, color = p.textMuted)
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(info.name, style = Type.headline, color = p.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            VSpace(2.dp)
                            val line = when {
                                todaySets != null -> "Today: " + todaySets.joinToString("  ") { formatSet(it, unit, info.equipment) }
                                last != null -> "Last: " + last.sets.filter { it.reps > 0 }.joinToString("  ") { formatSet(it, unit, info.equipment) }
                                else -> "${info.muscle.label} · ${info.equipment.label} · new"
                            }
                            Text(line, style = Type.bodySmall, color = if (todaySets != null) p.ink(color) else p.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (hasNote) {
                            Spacer(Modifier.width(10.dp))
                            NoteBadge(p.note, size = 20.dp)
                        }
                        Spacer(Modifier.width(8.dp))
                        Icon(IronIcons.ChevronRight, null, tint = p.textFaint, modifier = Modifier.size(20.dp))
                    }
                }
                VSpace(10.dp)
            }
            if (shownIds.isNotEmpty()) {
                item {
                    GlassButton("Add exercise", { app.push(Screen.Picker(w.id)) }, Modifier.fillMaxWidth(), icon = IronIcons.Plus, style = ButtonStyle.SECONDARY)
                }
            }
        }
        if (shownIds.isNotEmpty()) {
            BottomActions {
                GlassButton(
                    "FINISH WORKOUT",
                    { app.finishWorkout(w.id) },
                    Modifier.weight(1f),
                    icon = IronIcons.Check,
                    enabled = session?.entries?.isNotEmpty() == true,
                    accent = color,
                )
            }
        }
    }
}
