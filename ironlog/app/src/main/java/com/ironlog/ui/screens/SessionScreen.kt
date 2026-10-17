package com.ironlog.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.ironlog.domain.exercise
import com.ironlog.domain.formatCompact
import com.ironlog.domain.formatSet
import com.ironlog.domain.formatVolume
import com.ironlog.domain.kgTo
import com.ironlog.domain.label
import com.ironlog.ui.AppState
import com.ironlog.ui.Screen
import com.ironlog.ui.components.CircleIconButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.NoteBadge
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.StatLine
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun SessionScreen(app: AppState, sessionId: String) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    val s = data.sessions.firstOrNull { it.id == sessionId }
    if (s == null) {
        // Its last exercise was removed (or it was deleted): nothing left to show.
        LaunchedEffect(Unit) { if (app.screen == Screen.SessionView(sessionId)) app.pop() }
        Page { item { TopBar("Session removed", { app.pop() }) } }
        return
    }
    val unit = data.settings.unit
    val sets = s.entries.flatMap { e -> e.sets.filter { it.reps > 0 } }
    Page {
        item {
            TopBar(
                "${s.workoutName} ${s.workoutEmoji}".trim(), { app.pop() },
                subtitle = s.localDate?.format(DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", Locale.UK)) ?: "Imported — no date",
            ) {
                CircleIconButton(IronIcons.Trash, { app.deleteSession(s.id) }, tint = p.danger, contentDescription = "Delete session")
            }
            GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(horizontal = 18.dp, vertical = 10.dp)) {
                StatLine("Exercises", s.entries.size.toString())
                StatLine("Sets", sets.size.toString())
                StatLine("Reps", sets.sumOf { it.reps }.toString())
                StatLine("Volume", formatVolume(sets.sumOf { it.weightKg * it.reps }, unit))
            }
            VSpace(12.dp)
            Text("Tap an exercise to fix its numbers.", style = Type.bodySmall, color = p.textMuted, modifier = Modifier.padding(bottom = 10.dp, start = 4.dp))
        }
        // Keyed by position: an imported session can hold the same exercise more than once.
        itemsIndexed(s.entries, key = { i, e -> "$i:${e.exerciseId}" }) { _, e ->
            val info = data.exercise(e.exerciseId)
            GlassCard(
                Modifier.fillMaxWidth().padding(bottom = 10.dp),
                onClick = { app.push(Screen.Logger(s.workoutId, e.exerciseId, s.id)) },
                padding = PaddingValues(16.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(info.name, style = Type.headline, color = p.text, modifier = Modifier.weight(1f))
                    Icon(IronIcons.Edit, null, tint = p.textFaint, modifier = Modifier.size(18.dp))
                }
                VSpace(8.dp)
                e.sets.filter { it.reps > 0 }.forEachIndexed { i, set ->
                    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Start) {
                        Text("${i + 1}", style = Type.label, color = p.textFaint, modifier = Modifier.width(22.dp))
                        Text(formatSet(set, unit, info.equipment), style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text)
                        if (!set.note.isNullOrBlank()) {
                            Spacer(Modifier.width(10.dp))
                            NoteBadge(p.note, size = 14.dp)
                            Spacer(Modifier.width(6.dp))
                            Text(set.note, style = Type.bodySmall, color = p.textMuted, maxLines = 1)
                        }
                    }
                }
            }
        }
    }
}
