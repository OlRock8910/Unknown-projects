package com.ironlog.ui.screens

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironlog.domain.ExercisePoint
import com.ironlog.domain.Metric
import com.ironlog.domain.Range
import com.ironlog.domain.Strength
import com.ironlog.domain.changeSinceLastMonth
import com.ironlog.domain.defaultMetric
import com.ironlog.domain.exercise
import com.ironlog.domain.formatCompact
import com.ironlog.domain.formatNumber
import com.ironlog.domain.formatSet
import com.ironlog.domain.formatVolume
import com.ironlog.domain.formatWeight
import com.ironlog.domain.history
import com.ironlog.domain.kgTo
import com.ironlog.domain.label
import com.ironlog.domain.overview
import com.ironlog.domain.rangeChange
import com.ironlog.domain.records
import com.ironlog.domain.series
import com.ironlog.domain.timesDone
import com.ironlog.ui.AppState
import com.ironlog.ui.Screen
import com.ironlog.ui.components.Chip
import com.ironlog.ui.components.EmptyState
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.LineChart
import com.ironlog.ui.components.NoteBadge
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.StatLine
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import com.ironlog.ui.theme.ink
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExerciseStatsScreen(app: AppState, exerciseId: String) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    val info = data.exercise(exerciseId)
    val unit = data.settings.unit
    val today = app.today()
    val h = remember(data) { data.history(exerciseId) }
    var range by rememberSaveable { mutableStateOf(Range.M3) }
    var metric by rememberSaveable { mutableStateOf(h.defaultMetric()) }
    val series = remember(h, range, metric) { h.series(metric, range, today) }
    val rec = remember(h) { h.records() }

    fun fmt(v: Double): String = when (metric) {
        Metric.REPS -> v.roundToInt().toString()
        Metric.VOLUME -> formatCompact(v.kgTo(unit))
        else -> formatNumber(Math.round(v.kgTo(unit) * 10) / 10.0)
    }
    val suffix = when (metric) { Metric.REPS -> " reps"; else -> unit.label }

    Page {
        item {
            TopBar(info.name, { app.pop() }, subtitle = "${info.muscle.label} · ${info.equipment.label}")
        }
        if (h.isEmpty) {
            item { EmptyState(IronIcons.Chart, "Nothing logged yet", "Save this exercise once and its graph starts here.") }
            return@Page
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Range.entries.forEach { r -> Chip(r.label, r == range, { range = r }, Modifier.weight(1f)) }
            }
            VSpace(10.dp)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Metric.entries.forEach { m -> Chip(m.short.uppercase(), m == metric, { metric = m }, Modifier.weight(1f), accent = p.accent2) }
            }
            VSpace(14.dp)
            GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(start = 12.dp, end = 12.dp, top = 18.dp, bottom = 12.dp)) {
                Row(Modifier.padding(horizontal = 6.dp), verticalAlignment = Alignment.Bottom) {
                    Column(Modifier.weight(1f)) {
                        Text(metric.label.uppercase(), style = Type.label, color = p.textMuted)
                        VSpace(4.dp)
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(series.lastOrNull()?.let { fmt(it.second) } ?: "—", style = Type.display, color = p.text)
                            Text(suffix, style = Type.headline, color = p.textMuted, modifier = Modifier.padding(start = 4.dp, bottom = 5.dp))
                        }
                    }
                    rangeChange(series, range)?.let { ChangeChip(it.percent) }
                }
                VSpace(10.dp)
                LineChart(series, p.accent, { v -> fmt(v) }, emptyText = "No sessions in the ${range.longLabel}. Try a longer range.")
            }
            VSpace(14.dp)
        }
        item {
            val change = h.changeSinceLastMonth(metric, today)
            val lastDone = h.dated.lastOrNull()?.date
            val stale = lastDone != null && lastDone.isBefore(today.minusDays(30))
            Insight(
                when {
                    change == null && stale -> "⏰"
                    change == null -> "📊"
                    change.percent >= 0.5 -> "📈"
                    change.percent <= -0.5 -> "📉"
                    else -> "➖"
                },
                when {
                    change == null && stale -> "Not done in the last month — time to get back on it!"
                    change == null -> "Log it a couple more times to see your trend."
                    change.percent >= 0.5 -> "You've increased ${change.percent.roundToInt()}% on this ${change.sinceLabel}! 🔥"
                    change.percent <= -0.5 -> "Down ${abs(change.percent).roundToInt()}% ${change.sinceLabel}. Off weeks happen — keep showing up."
                    else -> "Holding steady ${change.sinceLabel}. Time to push a little harder?"
                },
                if (change != null) "${fmt(change.from)}$suffix → ${fmt(change.to)}$suffix (${metric.short.lowercase()})" else null,
            )
            val times = h.timesDone()
            Insight(
                "🔁",
                "You've done ${info.name} $times time" + (if (times == 1) "" else "s"),
                if (h.undated.isNotEmpty()) "+ ${h.undated.size} imported without a date" else null,
            )
            val ov = data.overview(today)
            Insight("🏋️", "${ov.lifetimeSessions} sessions lifetime", "${ov.totalSets} sets · ${formatVolume(ov.totalVolumeKg, unit)} lifted in total")
            VSpace(8.dp)
        }
        item {
            SectionLabel("Personal records")
            GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 18.dp, vertical = 10.dp)) {
                rec.heaviest?.let { StatLine("Heaviest set", formatSet(it, unit, info.equipment), valueColor = p.ink(p.gold)) }
                if (rec.bestE1rmKg > 0) StatLine("Best est. 1-rep max", formatWeight(rec.bestE1rmKg, unit))
                rec.mostReps?.let { StatLine("Most reps", "${it.reps} @ " + formatSet(it, unit, info.equipment).substringBefore(" ×")) }
                if (rec.bestVolumeKg > 0) StatLine("Best session volume", formatVolume(rec.bestVolumeKg, unit))
            }
            if (data.settings.strengthComparisons && Strength.hasStandard(exerciseId)) {
                val set = rec.bestE1rmSet ?: rec.mostReps
                val brag = set?.let { Strength.brag(exerciseId, it, data.profile, today) }
                if (brag != null) {
                    VSpace(10.dp)
                    GlassCard(Modifier.fillMaxWidth(), tint = p.gold, tintAlpha = 0.12f, padding = PaddingValues(16.dp)) {
                        Text("HOW YOU STACK UP", style = Type.label, color = p.ink(p.gold))
                        VSpace(6.dp)
                        Text(brag, style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text)
                        VSpace(4.dp)
                        Text(
                            "Rough estimate from common lifting standards, your age" +
                                (if (data.profile.bodyweightKg != null) " and bodyweight." else ". Add your bodyweight in Settings for a closer number."),
                            style = Type.bodySmall, color = p.textMuted,
                        )
                    }
                }
            }
            VSpace(16.dp)
            SectionLabel("History")
        }
        // Keyed by position: one imported session can hold several entries for this exercise.
        itemsIndexed(h.dated.reversed(), key = { i, pt -> "d$i:${pt.sessionId}" }) { _, pt -> HistoryRow(app, pt, unit, info.equipment) }
        if (h.undated.isNotEmpty()) {
            item { SectionLabel("Imported — no date") }
            itemsIndexed(h.undated, key = { i, pt -> "u$i:${pt.sessionId}" }) { _, pt -> HistoryRow(app, pt, unit, info.equipment) }
        }
    }
}

@Composable
private fun Insight(emoji: String, text: String, sub: String?) {
    val p = LocalPalette.current
    GlassCard(Modifier.fillMaxWidth().padding(bottom = 10.dp), padding = PaddingValues(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(emoji, fontSize = 26.sp)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(text, style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text)
                if (sub != null) Text(sub, style = Type.bodySmall, color = p.textMuted)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HistoryRow(app: AppState, pt: ExercisePoint, unit: com.ironlog.domain.WeightUnit, equipment: com.ironlog.domain.Equipment) {
    val p = LocalPalette.current
    GlassCard(Modifier.fillMaxWidth().padding(bottom = 8.dp), onClick = { app.push(Screen.SessionView(pt.sessionId)) }, padding = PaddingValues(14.dp)) {
        Text(
            pt.date?.format(DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.UK))?.uppercase() ?: "IMPORTED",
            style = Type.label, color = p.textMuted,
        )
        VSpace(8.dp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            pt.sets.filter { it.reps > 0 }.forEach { s ->
                Row(
                    Modifier.clip(RoundedCornerShape(12.dp)).background(p.field).padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(formatSet(s, unit, equipment), style = Type.bodySmall.copy(fontWeight = FontWeight.Bold), color = p.text)
                    if (!s.note.isNullOrBlank()) {
                        Spacer(Modifier.width(6.dp))
                        NoteBadge(p.note, size = 14.dp)
                    }
                }
            }
        }
    }
}
