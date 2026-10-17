package com.ironlog.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironlog.domain.AppData
import com.ironlog.domain.Range
import com.ironlog.domain.Session
import com.ironlog.domain.changeSinceLastMonth
import com.ironlog.domain.defaultMetric
import com.ironlog.domain.exercise
import com.ironlog.domain.formatCompact
import com.ironlog.domain.formatSet
import com.ironlog.domain.formatVolume
import com.ironlog.domain.history
import com.ironlog.domain.kgTo
import com.ironlog.domain.label
import com.ironlog.domain.overview
import com.ironlog.domain.records
import com.ironlog.domain.series
import com.ironlog.domain.timesDone
import com.ironlog.domain.ExerciseLibrary
import com.ironlog.ui.AppState
import com.ironlog.ui.Screen
import com.ironlog.ui.components.CircleIconButton
import com.ironlog.ui.components.EmptyState
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.GlassTextField
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.PillShape
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.Segmented
import com.ironlog.ui.components.Sparkline
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

@Composable
fun ProgressScreen(app: AppState) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    val today = app.today()
    val ov = remember(data) { data.overview(today) }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var query by rememberSaveable { mutableStateOf("") }
    val unit = data.settings.unit

    val exerciseIds = remember(data) {
        data.sessions.filter { it.localDate != null || it.imported }
            .sortedByDescending { it.date ?: "" }
            .flatMap { s -> s.entries.map { it.exerciseId } }
            .distinct()
    }

    Page {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("PROGRESS", style = Type.display, color = p.text, modifier = Modifier.weight(1f))
                CircleIconButton(IronIcons.Gear, { app.push(Screen.Settings) }, contentDescription = "Settings")
            }
            VSpace(18.dp)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BigStat(IronIcons.Trophy, p.gold, ov.lifetimeSessions.toString(), "Lifetime sessions", Modifier.weight(1f))
                BigStat(IronIcons.Calendar, p.accent2, ov.thisMonth.toString(), "This month", Modifier.weight(1f))
            }
            VSpace(10.dp)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BigStat(IronIcons.Flame, p.flame, "${ov.weekStreak}", "Week streak", Modifier.weight(1f))
                BigStat(IronIcons.Barbell, p.accent, formatVolume(ov.totalVolumeKg, unit), "Total lifted", Modifier.weight(1f))
            }
            VSpace(14.dp)
            WeeksCard(data, today)
            VSpace(20.dp)
            Segmented(listOf("EXERCISES", "HISTORY"), tab, { tab = it }, Modifier.fillMaxWidth())
            VSpace(16.dp)
        }
        if (tab == 0) {
            if (exerciseIds.isEmpty()) {
                item {
                    EmptyState(IronIcons.Chart, "No graphs yet", "Log a workout and every exercise you do gets its own graph here.")
                }
            } else {
                item {
                    GlassTextField(query, { query = it }, Modifier.fillMaxWidth(), placeholder = "Find an exercise", leading = IronIcons.Search)
                    VSpace(12.dp)
                }
                val shown = if (query.isBlank()) exerciseIds else {
                    val matches = ExerciseLibrary.search(query, exerciseIds.map { data.exercise(it) }).map { it.id }.toSet()
                    exerciseIds.filter { it in matches }
                }
                items(shown, key = { it }) { id -> ExerciseRow(app, data, id, today) }
            }
        } else {
            val dated = data.sessions.filter { it.localDate != null && it.entries.isNotEmpty() }.sortedWith(compareByDescending<Session> { it.date }.thenByDescending { it.startedAt })
            val undated = data.sessions.filter { it.localDate == null && it.entries.isNotEmpty() }
            if (dated.isEmpty() && undated.isEmpty()) {
                item { EmptyState(IronIcons.History, "No sessions yet", "Every workout you save shows up here.") }
            }
            val byMonth = dated.groupBy { it.localDate!!.withDayOfMonth(1) }
            byMonth.forEach { (month, list) ->
                item(key = "m$month") {
                    SectionLabel(month.format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.UK))) {
                        Text("${list.size} sessions", style = Type.label, color = p.textFaint)
                    }
                }
                items(list, key = { it.id }) { s -> SessionRow(app, data, s) }
            }
            if (undated.isNotEmpty()) {
                item(key = "undated") {
                    SectionLabel("Imported — no date")
                    Text("Kept in your records, left off graphs.", style = Type.bodySmall, color = p.textMuted, modifier = Modifier.padding(bottom = 10.dp))
                }
                items(undated, key = { it.id }) { s -> SessionRow(app, data, s) }
            }
        }
    }
}

@Composable
private fun BigStat(icon: ImageVector, color: Color, value: String, label: String, modifier: Modifier) {
    val p = LocalPalette.current
    GlassCard(modifier, padding = PaddingValues(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = color, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text(label.uppercase(), style = Type.label, color = p.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        VSpace(10.dp)
        Text(value, style = Type.number, color = p.text, maxLines = 1)
    }
}

/** Sessions per week for the last 10 weeks, as glowing bars. */
@Composable
private fun WeeksCard(data: AppData, today: LocalDate) {
    val p = LocalPalette.current
    val weekStart = today.minusDays((today.dayOfWeek.value - 1).toLong())
    val counts = (9 downTo 0).map { back ->
        val start = weekStart.minusWeeks(back.toLong())
        val end = start.plusDays(6)
        data.sessions.count { s -> s.localDate?.let { !it.isBefore(start) && !it.isAfter(end) } == true && s.entries.isNotEmpty() }
    }
    val max = (counts.maxOrNull() ?: 0).coerceAtLeast(3)
    GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(18.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("LAST 10 WEEKS", style = Type.label, color = p.textMuted, modifier = Modifier.weight(1f))
            Text("${counts.sum()} sessions", style = Type.label, color = p.text)
        }
        VSpace(14.dp)
        val accent = p.accent
        val field = p.field
        Canvas(Modifier.fillMaxWidth().height(92.dp)) {
            val gap = 8.dp.toPx()
            val bw = (size.width - gap * (counts.size - 1)) / counts.size
            counts.forEachIndexed { i, c ->
                val x = i * (bw + gap)
                drawRoundRect(field, Offset(x, 0f), Size(bw, size.height), CornerRadius(bw / 2))
                if (c > 0) {
                    val h = size.height * c / max
                    val current = i == counts.lastIndex
                    drawRoundRect(
                        Brush.verticalGradient(listOf(accent, accent.copy(alpha = if (current) 0.8f else 0.45f)), startY = size.height - h, endY = size.height),
                        Offset(x, size.height - h), Size(bw, h), CornerRadius(bw / 2),
                    )
                }
            }
        }
        VSpace(8.dp)
        Row {
            Text("10 wks ago", style = Type.label, color = p.textFaint, modifier = Modifier.weight(1f))
            Text("This week", style = Type.label, color = p.textFaint)
        }
    }
}

@Composable
private fun ExerciseRow(app: AppState, data: AppData, id: String, today: LocalDate) {
    val p = LocalPalette.current
    val info = data.exercise(id)
    val h = remember(data, id) { data.history(id) }
    val metric = h.defaultMetric()
    val spark = remember(h) { h.series(metric, Range.ALL, today).takeLast(12).map { it.second } }
    val change = remember(h) { h.changeSinceLastMonth(metric, today) }
    val best = h.records().heaviest
    GlassCard(Modifier.fillMaxWidth().padding(bottom = 10.dp), onClick = { app.push(Screen.ExerciseStats(id)) }, padding = PaddingValues(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(info.name, style = Type.headline, color = p.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                VSpace(2.dp)
                Text(
                    buildString {
                        append("${h.timesDone()}×")
                        if (best != null) append(" · best ${formatSet(best, data.settings.unit, info.equipment)}")
                    },
                    style = Type.bodySmall, color = p.textMuted, maxLines = 1,
                )
            }
            Spacer(Modifier.width(10.dp))
            Sparkline(spark, p.accent, Modifier.size(70.dp, 34.dp))
            if (change != null) {
                Spacer(Modifier.width(10.dp))
                ChangeChip(change.percent)
            }
        }
    }
}

@Composable
fun ChangeChip(percent: Double) {
    val p = LocalPalette.current
    val up = percent >= 0.5
    val down = percent <= -0.5
    val color = when { up -> p.success; down -> p.danger; else -> p.textMuted }
    val text = when { up -> "▲ ${percent.roundToInt()}%"; down -> "▼ ${(-percent).roundToInt()}%"; else -> "= 0%" }
    Text(
        text,
        style = Type.label,
        color = color,
        modifier = Modifier.clip(PillShape).background(color.copy(alpha = 0.14f)).padding(horizontal = 9.dp, vertical = 6.dp),
    )
}

@Composable
private fun SessionRow(app: AppState, data: AppData, s: Session) {
    val p = LocalPalette.current
    val d = s.localDate
    val sets = s.entries.sumOf { e -> e.sets.count { it.reps > 0 } }
    val volume = s.entries.sumOf { e -> e.sets.sumOf { it.weightKg * it.reps } }
    GlassCard(Modifier.fillMaxWidth().padding(bottom = 10.dp), onClick = { app.push(Screen.SessionView(s.id)) }, padding = PaddingValues(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(
                Modifier.size(54.dp).clip(RoundedCornerShape(16.dp)).background(p.field),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                if (d != null) {
                    Text(d.dayOfMonth.toString(), style = Type.headline.copy(fontWeight = FontWeight.Black), color = p.text)
                    Text(d.format(DateTimeFormatter.ofPattern("EEE", Locale.UK)).uppercase(), style = Type.label.copy(fontSize = 9.sp), color = p.textMuted)
                } else {
                    Text("📥", style = Type.headline)
                }
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("${s.workoutName} ${s.workoutEmoji}".trim(), style = Type.headline, color = p.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${s.entries.size} exercises · $sets sets · ${formatVolume(volume, data.settings.unit)}",
                    style = Type.bodySmall, color = p.textMuted,
                )
            }
            Icon(IronIcons.ChevronRight, null, tint = p.textFaint, modifier = Modifier.size(20.dp))
        }
    }
}
