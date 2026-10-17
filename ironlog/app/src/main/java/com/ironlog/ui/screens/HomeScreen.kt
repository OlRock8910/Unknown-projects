package com.ironlog.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironlog.domain.AppData
import com.ironlog.domain.Motivation
import com.ironlog.domain.Workout
import com.ironlog.domain.activeSession
import com.ironlog.domain.overview
import com.ironlog.domain.sessionFor
import com.ironlog.domain.workoutsOn
import com.ironlog.ui.AppState
import com.ironlog.ui.DAY_LONG
import com.ironlog.ui.MenuRow
import com.ironlog.ui.Overlay
import com.ironlog.ui.Screen
import com.ironlog.ui.components.CircleIconButton
import com.ironlog.ui.components.EmptyState
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.PillShape
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.daysLabel
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import com.ironlog.ui.theme.ink
import com.ironlog.ui.theme.workout
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

@Composable
fun HomeScreen(app: AppState) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    val today = app.today()
    val hour = app.now().hour
    val greeting = when (hour) { in 5..11 -> "Good morning"; in 12..17 -> "Good afternoon"; else -> "Good evening" }
    val name = data.profile.name.trim().split(" ").firstOrNull().orEmpty()
    val workouts = data.workouts.sortedWith(compareBy({ it.days.minOrNull() ?: 8 }, { data.workouts.indexOf(it) }))
    val ov = data.overview(today)

    Page {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(if (name.isNotEmpty()) "$greeting, $name 👋" else "$greeting 👋", style = Type.bodySmall, color = p.textMuted)
                    Text("LET'S LIFT", style = Type.display, color = p.text)
                }
                CircleIconButton(IronIcons.Plus, { app.overlay = Overlay.AddMenu }, filled = true, contentDescription = "Add")
                Spacer(Modifier.width(10.dp))
                CircleIconButton(IronIcons.Gear, { app.push(Screen.Settings) }, contentDescription = "Settings")
            }
            VSpace(20.dp)
        }
        item {
            NotificationsBlockedCard(app, data)
            TodayCard(app, data, today)
            VSpace(14.dp)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MiniStat(IronIcons.Flame, p.flame, ov.weekStreak.toString(), "WEEK STREAK", Modifier.weight(1f))
                MiniStat(IronIcons.Calendar, p.accent2, ov.thisWeek.toString(), "THIS WEEK", Modifier.weight(1f))
                MiniStat(IronIcons.Trophy, p.gold, ov.lifetimeSessions.toString(), if (ov.lifetimeSessions == 1) "SESSION" else "SESSIONS", Modifier.weight(1f))
            }
            VSpace(14.dp)
        }
        item {
            GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(18.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("“", style = Type.display.copy(fontSize = 44.sp), color = p.accent)
                    Spacer(Modifier.width(10.dp))
                    Text(Motivation.quoteFor(today, hour / 6), style = Type.body.copy(fontWeight = FontWeight.SemiBold), color = p.text)
                }
            }
            VSpace(22.dp)
        }
        item {
            SectionLabel("Your workouts") {
                if (workouts.isNotEmpty()) {
                    Text("${workouts.size}", style = Type.label, color = p.textFaint)
                }
            }
        }
        if (workouts.isEmpty()) {
            item {
                EmptyState(
                    IronIcons.Barbell,
                    "No workouts yet",
                    "Make your first one — like Leg day 🦵 on Mondays. Tap below or the + at the top.",
                ) {
                    GlassButton("Create workout", { app.startWorkoutEditor(null) }, icon = IronIcons.Plus)
                }
            }
        } else {
            items(workouts, key = { it.id }) { w ->
                WorkoutRow(app, data, w, today)
                VSpace(10.dp)
            }
        }
    }
}

/** Reminders are switched on but Android is blocking notifications (e.g. after a restore). */
@Composable
private fun NotificationsBlockedCard(app: AppState, data: AppData) {
    val p = LocalPalette.current
    var allowed by remember { mutableStateOf(app.platform.notificationsAllowed()) }
    val wanted = data.settings.remindersEnabled && data.workouts.any { it.days.isNotEmpty() }
    if (!wanted || allowed) return
    GlassCard(Modifier.fillMaxWidth().padding(bottom = 14.dp), tint = p.flame, tintAlpha = 0.14f, padding = PaddingValues(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(IronIcons.Bell, null, tint = p.flame, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(12.dp))
            Text("Reminders can't reach you — notifications are blocked.", style = Type.bodySmall, color = p.text, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(10.dp))
            GlassButton("Allow", {
                app.platform.requestNotifications { granted ->
                    allowed = granted
                    if (!granted) app.showToast("Turn them on in Android Settings → Apps → IronLog → Notifications")
                }
            }, height = 42.dp, accent = p.flame)
        }
    }
}

@Composable
private fun TodayCard(app: AppState, data: AppData, today: LocalDate) {
    val p = LocalPalette.current
    val dateText = today.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.UK)).uppercase()
    val planned = data.workoutsOn(today)
    val focus = planned.firstOrNull { w -> data.sessionFor(w.id, today) == null } ?: planned.firstOrNull()
    if (focus == null) {
        val next = (1..7).asSequence().map { today.plusDays(it.toLong()) }
            .mapNotNull { d -> data.workoutsOn(d).firstOrNull()?.let { d to it } }.firstOrNull()
        GlassCard(Modifier.fillMaxWidth(), tint = p.accent2, tintAlpha = 0.14f, padding = PaddingValues(22.dp)) {
            Text("TODAY · $dateText", style = Type.label, color = p.ink(p.accent2))
            VSpace(8.dp)
            Text("Rest day 😴", style = Type.title, color = p.text)
            VSpace(4.dp)
            Text(Motivation.restDayLines[Math.floorMod(today.toEpochDay(), Motivation.restDayLines.size.toLong()).toInt()], style = Type.bodySmall, color = p.textMuted)
            if (next != null) {
                VSpace(14.dp)
                Text(
                    "Next up: ${next.second.name} ${next.second.emoji} on ${DAY_LONG[next.first.dayOfWeek.value - 1]}",
                    style = Type.bodySmall.copy(fontWeight = FontWeight.Bold),
                    color = p.text,
                    modifier = Modifier.clip(PillShape).background(p.field).padding(horizontal = 14.dp, vertical = 9.dp),
                )
            }
        }
        return
    }
    val color = p.workout(focus.color)
    val doneToday = data.activeSession(focus.id, today, app.nowMillis())?.entries?.size ?: 0
    val last = lastDone(data, focus, today)
    GlassCard(
        Modifier.fillMaxWidth().drawBehind {
            val c = Offset(size.width * 0.9f, 0f)
            val r = size.width * 0.7f
            drawCircle(Brush.radialGradient(listOf(color.copy(alpha = 0.35f * p.glowScale), Color.Transparent), center = c, radius = r), radius = r, center = c)
        },
        onClick = { app.push(Screen.WorkoutView(focus.id)) },
        tint = color,
        tintAlpha = 0.16f,
        padding = PaddingValues(22.dp),
    ) {
        Text("TODAY · $dateText", style = Type.label, color = p.ink(color))
        VSpace(8.dp)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(focus.name, style = Type.display.copy(fontSize = 30.sp), color = p.text, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (focus.emoji.isNotBlank()) Text(focus.emoji, fontSize = 40.sp)
        }
        VSpace(6.dp)
        val sub = buildString {
            append("${focus.exerciseIds.size} exercises")
            if (doneToday > 0) append(" · $doneToday done today") else if (last != null) append(" · last done $last")
        }
        Text(sub, style = Type.bodySmall, color = p.textMuted)
        VSpace(18.dp)
        GlassButton(
            if (doneToday > 0) "CONTINUE WORKOUT" else "START WORKOUT",
            { app.push(Screen.WorkoutView(focus.id)) },
            Modifier.fillMaxWidth(),
            icon = IronIcons.Play,
            accent = color,
        )
        if (planned.size > 1) {
            VSpace(10.dp)
            Text("+ ${planned.size - 1} more planned today", style = Type.bodySmall, color = p.textMuted)
        }
    }
}

fun lastDone(data: AppData, w: Workout, today: LocalDate): String? {
    val last = data.sessions.filter { it.workoutId == w.id && it.localDate != null && it.localDate!! < today }
        .maxByOrNull { it.date!! }?.localDate ?: return null
    val days = ChronoUnit.DAYS.between(last, today)
    return when (days) {
        1L -> "yesterday"
        in 2..13 -> "$days days ago"
        in 14..60 -> "${days / 7} weeks ago"
        else -> "a while ago"
    }
}

@Composable
private fun MiniStat(icon: ImageVector, color: Color, value: String, label: String, modifier: Modifier) {
    val p = LocalPalette.current
    GlassCard(modifier, padding = PaddingValues(horizontal = 14.dp, vertical = 14.dp)) {
        Icon(icon, null, tint = color, modifier = Modifier.size(22.dp))
        VSpace(8.dp)
        Text(value, style = Type.number, color = p.text)
        Text(label, style = Type.label.copy(fontSize = 9.sp), color = p.textMuted, maxLines = 1)
    }
}

@Composable
private fun WorkoutRow(app: AppState, data: AppData, w: Workout, today: LocalDate) {
    val p = LocalPalette.current
    val color = p.workout(w.color)
    val isToday = today.dayOfWeek.value in w.days
    val done = data.sessionFor(w.id, today) != null
    GlassCard(
        Modifier.fillMaxWidth(),
        onClick = { app.push(Screen.WorkoutView(w.id)) },
        onLongClick = { app.sheet { WorkoutActions(app, w) } },
        tint = color,
        tintAlpha = if (isToday) 0.14f else 0.06f,
        padding = PaddingValues(start = 0.dp, end = 18.dp, top = 16.dp, bottom = 16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .padding(start = 10.dp)
                    .size(5.dp, 44.dp)
                    .clip(PillShape)
                    .background(Brush.verticalGradient(listOf(color, color.copy(alpha = 0.3f)))),
            )
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(daysLabel(w.days), style = Type.label, color = if (isToday) p.ink(color) else p.textMuted)
                VSpace(3.dp)
                Text(w.name, style = Type.headline, color = p.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                VSpace(2.dp)
                val last = lastDone(data, w, today)
                Text(
                    buildString {
                        append("${w.exerciseIds.size} exercise" + if (w.exerciseIds.size == 1) "" else "s")
                        if (done) append(" · done today ✅") else if (last != null) append(" · $last")
                    },
                    style = Type.bodySmall,
                    color = p.textMuted,
                )
            }
            if (w.emoji.isNotBlank()) {
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier.size(54.dp).clip(RoundedCornerShape(18.dp)).background(color.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center,
                ) { Text(w.emoji, fontSize = 30.sp) }
            }
        }
    }
}

@Composable
fun WorkoutActions(app: AppState, w: Workout) {
    val p = LocalPalette.current
    Text("${w.name} ${w.emoji}".trim(), style = Type.title, color = p.text)
    VSpace(14.dp)
    MenuRow(IronIcons.Edit, p.accent, "Edit workout", "Name, emoji, days, exercises") {
        app.closeOverlay(); app.startWorkoutEditor(w.id)
    }
    MenuRow(IronIcons.Trash, p.danger, "Delete workout", "History stays") { app.deleteWorkout(w.id) }
}
