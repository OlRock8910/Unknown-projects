package com.ironlog.ui.screens

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironlog.domain.ExerciseLibrary
import com.ironlog.domain.exercise
import com.ironlog.domain.isPerSide
import com.ironlog.ui.AppState
import com.ironlog.ui.DAY_SHORT
import com.ironlog.ui.Screen
import com.ironlog.ui.components.BottomActions
import com.ironlog.ui.components.ButtonStyle
import com.ironlog.ui.components.CircleIconButton
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.GlassTextField
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.PillShape
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.components.glass
import com.ironlog.ui.components.pressable
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import com.ironlog.ui.theme.contentOn
import com.ironlog.ui.theme.ink
import com.ironlog.ui.theme.WorkoutColors
import com.ironlog.ui.theme.workout

val WORKOUT_EMOJIS = listOf(
    "🦵", "💪", "🔥", "🏋️", "🦍", "🍑", "⚡", "🏆", "😤", "🥥", "🛡️", "🎯",
    "🚀", "💥", "👊", "🦾", "🐐", "🦁", "🐻", "⭐", "🧠", "🥵", "🏃", "🤸",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WorkoutEditScreen(app: AppState) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    val d = app.draft
    val color = p.workout(d.color)

    Box(Modifier.fillMaxSize()) {
        Page(bottomInset = 110.dp) {
            item {
                TopBar(if (d.id == null) "New workout" else "Edit workout", { app.pop() }) {
                    if (d.id != null) CircleIconButton(IronIcons.Trash, { app.deleteWorkout(d.id) }, tint = p.danger, contentDescription = "Delete")
                }
            }
            item {
                // Live preview of how it will look on the home screen.
                GlassCard(Modifier.fillMaxWidth(), tint = color, tintAlpha = 0.16f, padding = PaddingValues(20.dp)) {
                    Text(
                        if (d.days.isEmpty()) "ANY DAY" else d.days.sorted().joinToString(" · ") { DAY_SHORT[it - 1] },
                        style = Type.label, color = p.ink(color),
                    )
                    VSpace(6.dp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(d.name.ifBlank { "Workout name" }, style = Type.title, color = if (d.name.isBlank()) p.textFaint else p.text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(d.emoji.ifBlank { " " }, fontSize = 34.sp)
                    }
                }
                VSpace(20.dp)
                SectionLabel("Name")
                GlassTextField(d.name, { app.draft = app.draft.copy(name = it) }, Modifier.fillMaxWidth(), placeholder = "e.g. Leg day", maxLength = 40)
                VSpace(20.dp)
                SectionLabel("Emoji")
                WORKOUT_EMOJIS.chunked(8).forEach { row ->
                  Row(Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    row.forEach { e ->
                        val on = d.emoji == e
                        Box(
                            Modifier
                                .weight(1f)
                                .aspectRatio(1f)
                                .pressable({ app.draft = app.draft.copy(emoji = if (on) "" else e) }, scaleDown = 0.88f, haptic = true)
                                .then(if (on) Modifier.clip(RoundedCornerShape(16.dp)).background(color.copy(alpha = 0.3f)).border(2.dp, color, RoundedCornerShape(16.dp)) else Modifier.glass(p, RoundedCornerShape(16.dp))),
                            contentAlignment = Alignment.Center,
                        ) { Text(e, fontSize = 22.sp) }
                    }
                  }
                }
                VSpace(10.dp)
                GlassTextField(
                    if (d.emoji in WORKOUT_EMOJIS) "" else d.emoji,
                    { s -> app.draft = app.draft.copy(emoji = s.trim().take(8)) },
                    Modifier.fillMaxWidth(), placeholder = "…or type any emoji", maxLength = 8,
                )
                VSpace(20.dp)
                SectionLabel("Days")
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (1..7).forEach { day ->
                        val on = day in d.days
                        Box(
                            Modifier
                                .weight(1f)
                                .height(48.dp)
                                .pressable({
                                    app.draft = app.draft.copy(days = if (on) app.draft.days - day else app.draft.days + day)
                                }, scaleDown = 0.9f, haptic = true)
                                .then(if (on) Modifier.clip(RoundedCornerShape(16.dp)).background(color) else Modifier.glass(p, RoundedCornerShape(16.dp))),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(DAY_SHORT[day - 1].take(2), style = Type.label, color = if (on) contentOn(color) else p.textMuted)
                        }
                    }
                }
                VSpace(8.dp)
                Text(
                    if (d.days.isEmpty()) "Pick the days you train this. You'll get reminders on those days."
                    else "You'll get reminders on these days until it's logged.",
                    style = Type.bodySmall, color = p.textMuted,
                )
                // One-colour mode paints every workout the same, so there is nothing to pick.
                if (!p.mono) {
                VSpace(20.dp)
                SectionLabel("Colour")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    WorkoutColors.forEachIndexed { i, c ->
                        val on = i == d.color % WorkoutColors.size
                        Box(
                            Modifier
                                .size(34.dp)
                                .pressable({ app.draft = app.draft.copy(color = i) }, scaleDown = 0.85f, haptic = true)
                                .clip(CircleShape)
                                .background(c)
                                .then(if (on) Modifier.border(3.dp, p.text, CircleShape) else Modifier),
                        )
                    }
                }
                }
                VSpace(24.dp)
                SectionLabel("Exercises") { Text("${d.exerciseIds.size}", style = Type.label, color = p.textFaint) }
            }
            itemsIndexed(d.exerciseIds, key = { _, id -> id }) { i, id ->
                val info = data.exercise(id)
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 8.dp).glass(p, RoundedCornerShape(20.dp)).padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("${i + 1}", style = Type.label, color = p.textFaint, modifier = Modifier.width(22.dp))
                    Column(Modifier.weight(1f)) {
                        Text(info.name, style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${info.muscle.label} · ${info.equipment.label}", style = Type.bodySmall, color = p.textMuted)
                    }
                    // Left & right reps for this exercise (one arm or one leg at a time).
                    val sides = data.isPerSide(info)
                    Box(
                        Modifier
                            .padding(end = 2.dp)
                            .height(30.dp)
                            .pressable({ app.setPerSide(id, !sides) }, scaleDown = 0.88f, haptic = true)
                            .clip(PillShape)
                            .background(if (sides) p.accent2.copy(alpha = 0.22f) else p.field)
                            .padding(horizontal = 9.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("L·R", style = Type.label, color = if (sides) p.accent2 else p.textFaint)
                    }
                    SmallIcon(IronIcons.ArrowUp, enabled = i > 0) {
                        val l = app.draft.exerciseIds.toMutableList(); l.add(i - 1, l.removeAt(i)); app.draft = app.draft.copy(exerciseIds = l)
                    }
                    SmallIcon(IronIcons.ArrowDown, enabled = i < d.exerciseIds.lastIndex) {
                        val l = app.draft.exerciseIds.toMutableList(); l.add(i + 1, l.removeAt(i)); app.draft = app.draft.copy(exerciseIds = l)
                    }
                    SmallIcon(IronIcons.Close, tint = p.danger) {
                        app.draft = app.draft.copy(exerciseIds = app.draft.exerciseIds - id)
                    }
                }
            }
            item {
                GlassButton("Add exercises", { app.push(Screen.Picker(null)) }, Modifier.fillMaxWidth(), icon = IronIcons.Search, style = ButtonStyle.SECONDARY)
                if (d.exerciseIds.isNotEmpty()) {
                    VSpace(10.dp)
                    Text("Tap L·R to count left and right reps separately.", style = Type.bodySmall, color = p.textFaint, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
                if (d.exerciseIds.isEmpty()) {
                    VSpace(10.dp)
                    Text("Search ${ExerciseLibrary.all.size} exercises, or make your own.", style = Type.bodySmall, color = p.textMuted, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
            }
        }
        BottomActions {
            GlassButton("SAVE WORKOUT", { app.saveDraft() }, Modifier.weight(1f), icon = IronIcons.Check, enabled = d.name.isNotBlank())
        }
    }
}

@Composable
private fun SmallIcon(icon: ImageVector, enabled: Boolean = true, tint: Color? = null, onClick: () -> Unit) {
    val p = LocalPalette.current
    Box(
        Modifier.size(40.dp).pressable(if (enabled) onClick else null, scaleDown = 0.85f, haptic = true),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = (tint ?: p.textMuted).copy(alpha = if (enabled) 1f else 0.25f), modifier = Modifier.size(20.dp))
    }
}
