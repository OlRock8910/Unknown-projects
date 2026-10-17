package com.ironlog.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.unit.dp
import com.ironlog.domain.BackupCodec
import com.ironlog.ui.AppState
import com.ironlog.ui.Screen
import com.ironlog.ui.components.ButtonStyle
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.GlassTextField
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import java.time.LocalDate

@Composable
fun BackupScreen(app: AppState) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    val code = remember(data) { BackupCodec.encode(data) }
    var paste by rememberSaveable { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val sessions = data.sessions.count { it.date != null }
    // A fresh install has nothing worth backing up; lead with restoring instead, so the
    // big COPY button can't overwrite the real code sitting in the clipboard.
    val hasData = data.workouts.isNotEmpty() || data.sessions.isNotEmpty() || data.notes.isNotEmpty()

    Page(bottomInset = 40.dp) {
        item {
            TopBar("Backup & restore", { app.pop() })
            if (!hasData) {
                GlassCard(Modifier.fillMaxWidth(), tint = p.accent2, tintAlpha = 0.12f) {
                    Text("GOT A CODE?", style = Type.label, color = p.accent2)
                    VSpace(6.dp)
                    Text("Paste your IronLog backup code below and tap RESTORE to bring back your workouts, history and notes.", style = Type.bodySmall, color = p.textMuted)
                }
            }
            if (hasData) {
            GlassCard(Modifier.fillMaxWidth(), tint = p.accent2, tintAlpha = 0.12f) {
                Text("YOUR BACKUP CODE", style = Type.label, color = p.accent2)
                VSpace(8.dp)
                Text(
                    "One line of text with everything in it: ${data.workouts.size} workouts, $sessions sessions, ${data.notes.size} notes and your settings. " +
                        "Copy it into your notes app or email it to yourself. On a new phone, paste it below and it all comes back.",
                    style = Type.bodySmall, color = p.textMuted,
                )
                VSpace(14.dp)
                Text(
                    code.take(64) + if (code.length > 64) "…" else "",
                    style = Type.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = p.text,
                    maxLines = 2,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(p.field).padding(12.dp),
                )
                VSpace(6.dp)
                Text("${code.length} characters", style = Type.label, color = p.textFaint)
                VSpace(14.dp)
                GlassButton("COPY CODE", { app.platform.copyText(code); app.showToast("Backup code copied ✓") }, Modifier.fillMaxWidth(), icon = IronIcons.Copy)
                VSpace(10.dp)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GlassButton("Share", { app.platform.shareText("IronLog backup", code) }, Modifier.weight(1f), icon = IronIcons.Share, style = ButtonStyle.SECONDARY, height = 50.dp)
                    GlassButton("Save", {
                        app.platform.saveTextFile("ironlog-backup-${LocalDate.now()}.txt", code) { ok -> if (ok) app.showToast("Backup saved ✓") }
                    }, Modifier.weight(1f), icon = IronIcons.Download, style = ButtonStyle.SECONDARY, height = 50.dp)
                }
            }
            VSpace(8.dp)
            Row(Modifier.padding(horizontal = 6.dp), verticalAlignment = Alignment.Top) {
                Icon(IronIcons.Info, null, tint = p.textFaint, modifier = Modifier.size(16.dp).padding(top = 2.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    "The code is scrambled so it can't be read at a glance, but it has no password — anyone with the code and this app can open it.",
                    style = Type.bodySmall, color = p.textFaint,
                )
            }
            }

            VSpace(24.dp)
            SectionLabel("Restore")
            GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(16.dp)) {
                GlassTextField(
                    paste, { paste = it; error = null }, Modifier.fillMaxWidth(),
                    placeholder = "Paste a code that starts with ${BackupCodec.PREFIX}", singleLine = false, minHeight = 110.dp, maxLength = 20_000_000,
                    maxLines = 5,
                    textStyle = Type.bodySmall.copy(fontFamily = FontFamily.Monospace),
                )
                VSpace(10.dp)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GlassButton("Paste", { app.platform.pasteText()?.let { paste = it; error = null } }, Modifier.weight(1f), icon = IronIcons.Paste, style = ButtonStyle.SECONDARY, height = 50.dp)
                    GlassButton("Open", { app.platform.openTextFile { t -> if (t != null) { paste = t; error = null } } }, Modifier.weight(1f), icon = IronIcons.Upload, style = ButtonStyle.SECONDARY, height = 50.dp)
                }
                if (error != null) {
                    VSpace(10.dp)
                    Text(error!!, style = Type.bodySmall, color = p.danger)
                }
                VSpace(12.dp)
                GlassButton("RESTORE", { error = app.restore(paste) }, Modifier.fillMaxWidth(), icon = IronIcons.Repeat, enabled = paste.isNotBlank())
            }

            VSpace(24.dp)
            SectionLabel("From another app")
            GlassCard(Modifier.fillMaxWidth(), onClick = { app.push(Screen.ImportText) }, padding = PaddingValues(16.dp)) {
                Text("Add past progress as text", style = Type.headline, color = p.text)
                VSpace(4.dp)
                Text("Type or paste lines like “Bench press 60kg x 12, 10, 8”. Lines without a date are kept but left off your graphs.", style = Type.bodySmall, color = p.textMuted)
            }
        }
    }
}
