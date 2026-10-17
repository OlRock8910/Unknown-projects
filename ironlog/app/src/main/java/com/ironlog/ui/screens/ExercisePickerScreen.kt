package com.ironlog.ui.screens

import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ironlog.domain.Equipment
import com.ironlog.domain.ExerciseLibrary
import com.ironlog.domain.Muscle
import com.ironlog.domain.allExercises
import com.ironlog.domain.workout
import com.ironlog.ui.AppState
import com.ironlog.ui.components.BottomActions
import com.ironlog.ui.components.Chip
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.GlassTextField
import com.ironlog.ui.components.IconTile
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.components.glass
import com.ironlog.ui.components.pressable
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type

@Composable
fun ExercisePickerScreen(app: AppState, targetWorkoutId: String?) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    var query by rememberSaveable { mutableStateOf("") }
    var muscle by rememberSaveable { mutableStateOf<String?>(null) }
    val selected = remember { mutableStateListOf<String>() }
    val already = if (targetWorkoutId == null) app.draft.exerciseIds.toSet()
    else data.workout(targetWorkoutId)?.exerciseIds?.toSet() ?: emptySet()
    val targetName = if (targetWorkoutId == null) app.draft.name.ifBlank { "your new workout" } else data.workout(targetWorkoutId)?.name ?: ""

    val pool = data.allExercises().filter { muscle == null || it.muscle.name == muscle }
    val results = remember(query, muscle, data.customExercises) { ExerciseLibrary.search(query, pool) }
    val exact = results.any { ExerciseLibrary.normalize(it.name) == ExerciseLibrary.normalize(query) }

    Box(Modifier.fillMaxSize()) {
        Page(bottomInset = 110.dp) {
            item {
                TopBar("Add exercises", { app.pop() }, subtitle = "to $targetName")
                GlassTextField(
                    query, { query = it }, Modifier.fillMaxWidth(),
                    placeholder = "Search: bench, db, legs, rdl…", leading = IronIcons.Search, imeAction = ImeAction.Search,
                )
                VSpace(12.dp)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip("ALL", muscle == null, { muscle = null })
                    Muscle.entries.forEach { m -> Chip(m.label.uppercase(), muscle == m.name, { muscle = if (muscle == m.name) null else m.name }) }
                }
                VSpace(14.dp)
                if (query.isNotBlank() && !exact) {
                    GlassCard(Modifier.fillMaxWidth(), onClick = {
                        app.sheet { CreateExerciseSheet(app, query.trim()) { id -> selected.add(id); query = "" } }
                    }, tint = p.accent, tintAlpha = 0.1f) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconTile(IronIcons.Plus, p.accent)
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Create “${query.trim()}”", style = Type.headline, color = p.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("Can't find it? Add it as your own exercise", style = Type.bodySmall, color = p.textMuted)
                            }
                        }
                    }
                    VSpace(12.dp)
                }
                SectionLabel(if (query.isBlank()) "All exercises" else "${results.size} results")
            }
            items(results, key = { it.id }) { e ->
                val added = e.id in already
                val on = e.id in selected
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp)
                        .pressable(if (added) null else ({ if (on) selected.remove(e.id) else selected.add(e.id) }), haptic = true)
                        .glass(p, RoundedCornerShape(20.dp), tint = if (on) p.accent else androidx.compose.ui.graphics.Color.Transparent, tintAlpha = 0.18f)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(e.name, style = Type.body.copy(fontWeight = FontWeight.Bold), color = if (added) p.textFaint else p.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            "${e.muscle.label} · ${e.equipment.label}" + if (e.custom) " · yours" else "",
                            style = Type.bodySmall, color = p.textMuted,
                        )
                    }
                    when {
                        added -> Text("ADDED", style = Type.label, color = p.textFaint)
                        else -> Box(
                            Modifier.size(28.dp).clip(CircleShape).background(if (on) p.accent else p.field),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (on) Icon(IronIcons.Check, null, tint = p.onAccent, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        }
        BottomActions {
            GlassButton(
                if (selected.isEmpty()) "SELECT EXERCISES" else "ADD ${selected.size}",
                { app.addExercises(targetWorkoutId, selected.toList()); app.pop() },
                Modifier.weight(1f), icon = IronIcons.Plus, enabled = selected.isNotEmpty(),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CreateExerciseSheet(app: AppState, initialName: String, onCreated: (String) -> Unit) {
    val p = LocalPalette.current
    var name by remember { mutableStateOf(initialName) }
    var equipment by remember { mutableStateOf(ExerciseLibrary.guessEquipment(initialName).takeIf { it != Equipment.OTHER } ?: Equipment.MACHINE) }
    var muscle by remember { mutableStateOf(Muscle.CHEST) }
    Text("New exercise", style = Type.title, color = p.text)
    VSpace(14.dp)
    GlassTextField(name, { name = it }, Modifier.fillMaxWidth(), placeholder = "Name", maxLength = 50)
    VSpace(16.dp)
    SectionLabel("Equipment")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Equipment.entries.forEach { e -> Chip(e.label.uppercase(), equipment == e, { equipment = e }) }
    }
    VSpace(16.dp)
    SectionLabel("Muscle")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Muscle.entries.forEach { m -> Chip(m.label.uppercase(), muscle == m, { muscle = m }) }
    }
    VSpace(20.dp)
    GlassButton("CREATE", {
        if (name.isNotBlank()) {
            val id = app.createCustomExercise(name, equipment, muscle)
            app.closeOverlay()
            onCreated(id)
        }
    }, Modifier.fillMaxWidth(), icon = IronIcons.Check, enabled = name.isNotBlank())
}
