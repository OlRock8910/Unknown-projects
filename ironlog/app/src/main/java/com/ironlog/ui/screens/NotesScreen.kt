package com.ironlog.ui.screens

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironlog.domain.ExerciseLibrary
import com.ironlog.ui.AppState
import com.ironlog.ui.Screen
import com.ironlog.ui.components.BottomActions
import com.ironlog.ui.components.CircleIconButton
import com.ironlog.ui.components.EmptyState
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.GlassTextField
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun NotesScreen(app: AppState) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    var query by rememberSaveable { mutableStateOf("") }
    val notes = data.notes
        .filter { n ->
            query.isBlank() || ExerciseLibrary.normalize(n.title + " " + n.body).contains(ExerciseLibrary.normalize(query))
        }
        .sortedWith(compareByDescending<com.ironlog.domain.Note> { it.pinned }.thenByDescending { it.updatedAt })
    Page {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Your PRs, goals, anything", style = Type.bodySmall, color = p.textMuted)
                    Text("NOTES", style = Type.display, color = p.text)
                }
                CircleIconButton(IronIcons.Plus, { app.push(Screen.NoteEdit(null)) }, filled = true, contentDescription = "New note")
                Spacer(Modifier.width(10.dp))
                CircleIconButton(IronIcons.Gear, { app.push(Screen.Settings) }, contentDescription = "Settings")
            }
            VSpace(18.dp)
            if (data.notes.isNotEmpty()) {
                GlassTextField(query, { query = it }, Modifier.fillMaxWidth(), placeholder = "Search notes", leading = IronIcons.Search)
                VSpace(14.dp)
            }
        }
        if (data.notes.isEmpty()) {
            item {
                EmptyState(IronIcons.Notes, "No notes yet", "Write down PRs like “Bench PR 80kg × 3”, goals, or anything you want to remember.") {
                    GlassButton("Add note", { app.push(Screen.NoteEdit(null)) }, icon = IronIcons.Plus)
                }
            }
        }
        items(notes, key = { it.id }) { n ->
            GlassCard(Modifier.fillMaxWidth().padding(bottom = 10.dp), onClick = { app.push(Screen.NoteEdit(n.id)) }, padding = PaddingValues(18.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(n.title.ifBlank { "Untitled" }, style = Type.headline, color = p.text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (n.pinned) Icon(IronIcons.Pin, "Pinned", tint = p.accent, modifier = Modifier.size(18.dp))
                }
                if (n.body.isNotBlank()) {
                    VSpace(4.dp)
                    Text(n.body, style = Type.bodySmall, color = p.textMuted, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
                VSpace(8.dp)
                Text(formatStamp(n.updatedAt), style = Type.label, color = p.textFaint)
            }
        }
    }
}

private fun formatStamp(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("d MMM yyyy · HH:mm", Locale.UK)).uppercase()

@Composable
fun NoteEditScreen(app: AppState, noteId: String?) {
    val p = LocalPalette.current
    val existing = remember { app.current.notes.firstOrNull { it.id == noteId } }
    var title by rememberSaveable { mutableStateOf(existing?.title.orEmpty()) }
    var body by rememberSaveable { mutableStateOf(existing?.body.orEmpty()) }
    var pinned by rememberSaveable { mutableStateOf(existing?.pinned ?: false) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { if (existing == null) runCatching { focus.requestFocus() } }
    Box(Modifier.fillMaxSize()) {
        Page(bottomInset = 110.dp) {
            item {
                TopBar(if (existing == null) "New note" else "Edit note", { app.pop() }) {
                    CircleIconButton(IronIcons.Pin, { pinned = !pinned }, tint = if (pinned) p.accent else p.textMuted, contentDescription = "Pin")
                    if (existing != null) {
                        Spacer(Modifier.width(10.dp))
                        CircleIconButton(IronIcons.Trash, { app.deleteNote(existing.id) }, tint = p.danger, contentDescription = "Delete")
                    }
                }
                GlassTextField(
                    title, { title = it }, Modifier.fillMaxWidth(), placeholder = "Title — e.g. Bench press PR",
                    textStyle = Type.headline.copy(fontSize = 20.sp, fontWeight = FontWeight.ExtraBold), focusRequester = focus, maxLength = 80,
                    minHeight = 60.dp,
                )
                VSpace(12.dp)
                GlassTextField(
                    body, { body = it }, Modifier.fillMaxWidth(), placeholder = "Write anything…\n\n80kg × 3 on 12 Oct 💪\nNext goal: 90kg",
                    singleLine = false, minHeight = 320.dp, imeAction = androidx.compose.ui.text.input.ImeAction.Default,
                )
            }
        }
        BottomActions {
            GlassButton("SAVE NOTE", { app.saveNote(existing?.id, title, body, pinned) }, Modifier.weight(1f), icon = IronIcons.Check, enabled = title.isNotBlank() || body.isNotBlank())
        }
    }
}
