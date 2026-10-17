package com.ironlog.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ironlog.domain.ProgressImport
import com.ironlog.domain.allExercises
import com.ironlog.domain.formatSet
import com.ironlog.ui.AppState
import com.ironlog.ui.components.BottomActions
import com.ironlog.ui.components.ButtonStyle
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.GlassTextField
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.PillShape
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import java.time.format.DateTimeFormatter
import java.util.Locale

private const val EXAMPLE = """Bench press 60kg x 12, 10, 8
Squat 5x5 @ 80kg
Pull ups 3x10

12/09/2026
Leg press 120 x 12
Lat pulldown 3 sets of 10 at 55"""

@Composable
fun ImportScreen(app: AppState) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    var text by rememberSaveable { mutableStateOf("") }
    var preview by remember { mutableStateOf<List<ProgressImport.Line>?>(null) }
    val good = preview?.count { it.ok } ?: 0

    Box(Modifier.fillMaxSize()) {
        Page(bottomInset = 110.dp) {
            item {
                TopBar("Add past progress", { app.pop() })
                GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(16.dp)) {
                    Text("HOW IT WORKS", style = Type.label, color = p.accent)
                    VSpace(6.dp)
                    Text(
                        "One exercise per line: name, then weight × reps. A date on its own line applies to the lines under it.\n\n" +
                            "Lines with no date are kept in your history and records, but left off graphs — so old lifts never look like a sudden jump.",
                        style = Type.bodySmall, color = p.textMuted,
                    )
                    VSpace(10.dp)
                    Text(
                        EXAMPLE,
                        style = Type.bodySmall.copy(fontFamily = FontFamily.Monospace),
                        color = p.text,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.field).padding(12.dp),
                    )
                }
                VSpace(14.dp)
                GlassTextField(
                    text, { text = it; preview = null }, Modifier.fillMaxWidth(),
                    placeholder = "Paste or type your lifts here…", singleLine = false, minHeight = 180.dp, maxLength = 200_000,
                    imeAction = androidx.compose.ui.text.input.ImeAction.Default,
                )
                VSpace(10.dp)
                Row {
                    GlassButton("Paste", { app.platform.pasteText()?.let { text = it; preview = null } }, Modifier.weight(1f), icon = IronIcons.Paste, style = ButtonStyle.SECONDARY, height = 50.dp)
                    Spacer(Modifier.width(10.dp))
                    GlassButton("Preview", {
                        preview = ProgressImport.parse(text, data.settings.unit, app.today(), data.allExercises())
                    }, Modifier.weight(1f), icon = IronIcons.Search, height = 50.dp, enabled = text.isNotBlank())
                }
                if (preview != null) {
                    VSpace(18.dp)
                    SectionLabel("$good of ${preview!!.size} lines understood")
                }
            }
            preview?.let { lines ->
                items(lines, key = { it.lineNo }) { l -> PreviewRow(l, data.settings.unit) }
            }
        }
        BottomActions {
            GlassButton(
                if (good == 0) "PREVIEW FIRST" else "ADD $good LINE" + if (good == 1) "" else "S",
                { preview?.let { app.applyImport(it) } },
                Modifier.weight(1f), icon = IronIcons.Check, enabled = good > 0,
            )
        }
    }
}

@Composable
private fun PreviewRow(l: ProgressImport.Line, unit: com.ironlog.domain.WeightUnit) {
    val p = LocalPalette.current
    GlassCard(Modifier.fillMaxWidth().padding(bottom = 8.dp), padding = PaddingValues(14.dp), tint = if (l.ok) androidx.compose.ui.graphics.Color.Transparent else p.danger, tintAlpha = 0.12f) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(if (l.ok) IronIcons.Check else IronIcons.Warning, null, tint = if (l.ok) p.success else p.danger, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                if (l.ok) {
                    Text(
                        l.exercise?.name ?: "New: ${l.name.replaceFirstChar { it.uppercase() }}",
                        style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    Text(l.sets.joinToString("  ") { formatSet(it, unit, l.exercise?.equipment) }, style = Type.bodySmall, color = p.textMuted, maxLines = 2)
                } else {
                    Text("Line ${l.lineNo}: ${l.raw.trim()}", style = Type.bodySmall, color = p.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(l.problem ?: "", style = Type.bodySmall, color = p.danger)
                }
            }
            Spacer(Modifier.width(8.dp))
            Text(
                l.date?.format(DateTimeFormatter.ofPattern("d MMM yy", Locale.UK))?.uppercase() ?: "NO DATE",
                style = Type.label, color = if (l.date != null) p.accent2 else p.textFaint,
                modifier = Modifier.clip(PillShape).background(p.field).padding(horizontal = 9.dp, vertical = 5.dp),
            )
        }
    }
}
