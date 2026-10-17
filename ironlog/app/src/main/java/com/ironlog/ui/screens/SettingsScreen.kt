package com.ironlog.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.ironlog.domain.Reminders
import com.ironlog.domain.ThemeMode
import com.ironlog.domain.WeightUnit
import com.ironlog.domain.ageOn
import com.ironlog.domain.formatWeight
import com.ironlog.ui.AppState
import com.ironlog.ui.MenuRow
import com.ironlog.ui.Screen
import com.ironlog.ui.components.ButtonStyle
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.GlassSwitch
import com.ironlog.ui.components.IconTile
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.Segmented
import com.ironlog.ui.components.TopBar
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.components.WheelPicker
import com.ironlog.ui.components.glass
import com.ironlog.ui.components.pressable
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import com.ironlog.ui.theme.MonoColors
import com.ironlog.ui.theme.contentOn
import com.ironlog.ui.theme.paletteFor

@Composable
fun SettingsScreen(app: AppState) {
    val data by app.data.collectAsState()
    val p = LocalPalette.current
    val s = data.settings
    val prof = data.profile
    Page(bottomInset = 40.dp) {
        item {
            TopBar("Settings", { app.pop() })
            GlassCard(Modifier.fillMaxWidth(), onClick = { app.push(Screen.ProfileEdit) }, padding = PaddingValues(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(54.dp).clip(CircleShape).background(Brush.linearGradient(listOf(p.accent, p.accent2))),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(prof.name.trim().take(1).uppercase().ifEmpty { "💪" }, style = Type.title, color = p.onAccent)
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(prof.name.ifBlank { "Your profile" }, style = Type.headline, color = p.text)
                        val parts = listOfNotNull(
                            prof.ageOn(app.today())?.let { "$it years" },
                            prof.heightCm?.let { "${it.toInt()} cm" },
                            prof.bodyweightKg?.let { formatWeight(it, s.unit) },
                        )
                        Text(parts.joinToString(" · ").ifEmpty { "Add your age, height and weight" }, style = Type.bodySmall, color = p.textMuted)
                    }
                    Icon(IronIcons.ChevronRight, null, tint = p.textFaint, modifier = Modifier.size(20.dp))
                }
            }

            VSpace(22.dp)
            SectionLabel("Units")
            Segmented(listOf("KILOGRAMS (KG)", "POUNDS (LB)"), if (s.unit == WeightUnit.KG) 0 else 1, { i ->
                app.updateSettings { it.copy(unit = if (i == 0) WeightUnit.KG else WeightUnit.LB) }
            }, Modifier.fillMaxWidth())

            VSpace(22.dp)
            SectionLabel("Look")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ThemeTile(ThemeMode.GYM, "Gym mode", s, Modifier.weight(1f)) { app.updateSettings { it.copy(theme = ThemeMode.GYM) } }
                ThemeTile(ThemeMode.DARK, "Dark glass", s, Modifier.weight(1f)) { app.updateSettings { it.copy(theme = ThemeMode.DARK) } }
            }
            VSpace(10.dp)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ThemeTile(ThemeMode.LIGHT, "Light glass", s, Modifier.weight(1f)) { app.updateSettings { it.copy(theme = ThemeMode.LIGHT) } }
                ThemeTile(ThemeMode.MONO, "Black", s, Modifier.weight(1f)) { app.updateSettings { it.copy(theme = ThemeMode.MONO) } }
            }
            if (s.theme == ThemeMode.MONO) {
                VSpace(14.dp)
                Text("ADD ONE COLOUR (OPTIONAL)", style = Type.label, color = p.textMuted)
                VSpace(10.dp)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MonoColors.forEachIndexed { i, c ->
                        val on = i == Math.floorMod(s.monoColor, MonoColors.size)
                        // The first choice is "none": shown as a black dot, it keeps the app pure black and white.
                        val swatch = if (i == 0) Color(0xFF0A0A0A) else c
                        Box(
                            Modifier
                                .weight(1f)
                                .aspectRatio(1f)
                                .pressable({ app.updateSettings { it.copy(monoColor = i) } }, scaleDown = 0.85f, haptic = true)
                                .clip(CircleShape)
                                .background(Brush.verticalGradient(listOf(lerp(swatch, Color.White, 0.25f), swatch)))
                                .border(if (on) 3.dp else 1.dp, if (on) p.text else Color.White.copy(alpha = if (i == 0) 0.6f else 0.25f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (on) Icon(IronIcons.Check, null, tint = contentOn(swatch), modifier = Modifier.size(16.dp))
                        }
                    }
                }
                VSpace(6.dp)
                Text(
                    if (Math.floorMod(s.monoColor, MonoColors.size) == 0) "Pure black and white — no colour anywhere."
                    else "Black, with just this one colour for buttons, graphs and icons.",
                    style = Type.bodySmall, color = p.textMuted,
                )
            }

            VSpace(22.dp)
            SectionLabel("Reminders")
            GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(16.dp)) {
                ToggleRow(IronIcons.Bell, p.accent, "Workout reminders", "On days with a planned workout, until it's logged", s.remindersEnabled) { on ->
                    if (on && !app.platform.notificationsAllowed()) {
                        app.platform.requestNotifications { granted ->
                            app.updateSettings { it.copy(remindersEnabled = granted) }
                            if (!granted) app.showToast("Notifications are blocked — allow them in Android settings")
                        }
                    } else {
                        app.updateSettings { it.copy(remindersEnabled = on) }
                    }
                }
                if (s.remindersEnabled) {
                    VSpace(14.dp)
                    Text("PER DAY", style = Type.label, color = p.textMuted)
                    VSpace(8.dp)
                    Segmented(listOf("2 TIMES", "3 TIMES"), if (s.reminderTimes.size <= 2) 0 else 1, { i ->
                        app.updateSettings {
                            it.copy(reminderTimes = if (i == 0) listOf(9 * 60, 18 * 60) else listOf(8 * 60 + 30, 13 * 60, 18 * 60))
                        }
                    }, Modifier.fillMaxWidth())
                    VSpace(12.dp)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        s.reminderTimes.forEachIndexed { i, t ->
                            Box(
                                Modifier.weight(1f).height(50.dp).pressable({ app.sheet { TimeSheet(app, i, t) } }).glass(p, RoundedCornerShape(16.dp)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(IronIcons.Clock, null, tint = p.accent, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text(Reminders.formatTime(t), style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text)
                                }
                            }
                        }
                    }
                }
            }

            VSpace(22.dp)
            SectionLabel("Motivation")
            GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(16.dp)) {
                ToggleRow(IronIcons.Bolt, p.flame, "Motivation pop-ups", "“Last week you got 60kg × 12r. TRY 62.5KG!”", s.motivationPopups) { on ->
                    app.updateSettings { it.copy(motivationPopups = on) }
                }
                VSpace(14.dp)
                ToggleRow(IronIcons.Trophy, p.gold, "Strength comparisons", "“Only 5% of lifters your age can do this” (estimate)", s.strengthComparisons) { on ->
                    app.updateSettings { it.copy(strengthComparisons = on) }
                }
            }

            VSpace(22.dp)
            SectionLabel("Your data")
            MenuRow(IronIcons.Key, p.accent2, "Backup & restore", "Copy a code with all your data, paste it back on a new phone") { app.push(Screen.Backup) }
            MenuRow(IronIcons.FileText, p.pink, "Add past progress", "Paste lifts from another app or your notes") { app.push(Screen.ImportText) }

            VSpace(22.dp)
            SectionLabel("About")
            GlassCard(Modifier.fillMaxWidth(), padding = PaddingValues(16.dp)) {
                Text("IronLog ${app.platform.appVersion}", style = Type.headline, color = p.text)
                VSpace(4.dp)
                Text(
                    "No sounds, no ads, no account. Everything stays on this phone — the only way data leaves it is a backup code you copy yourself.",
                    style = Type.bodySmall, color = p.textMuted,
                )
            }
            VSpace(18.dp)
            GlassButton("Delete all data", { app.deleteEverything() }, Modifier.fillMaxWidth(), icon = IronIcons.Trash, style = ButtonStyle.GHOST, accent = p.danger)
        }
    }
}

@Composable
private fun ThemeTile(mode: ThemeMode, label: String, settings: com.ironlog.domain.Settings, modifier: Modifier, onClick: () -> Unit) {
    val p = LocalPalette.current
    val t = paletteFor(mode, settings.monoColor)
    val on = mode == settings.theme
    Column(
        modifier
            .pressable(onClick, haptic = true)
            .clip(RoundedCornerShape(22.dp))
            .background(Brush.linearGradient(listOf(t.glows[0].copy(alpha = 0.9f), t.background, t.glows[1].copy(alpha = 0.7f))))
            .border(if (on) 2.5.dp else 1.dp, if (on) p.accent else p.rimDim, RoundedCornerShape(22.dp))
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp))
                .background(Brush.verticalGradient(listOf(t.glassTop, t.glassBottom)))
                .border(1.dp, t.rimBright, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(width = 40.dp, height = 12.dp).clip(RoundedCornerShape(6.dp)).background(t.accent))
        }
        VSpace(8.dp)
        Text(label.uppercase(), style = Type.label, color = t.text, textAlign = TextAlign.Center, maxLines = 1)
    }
}

@Composable
private fun ToggleRow(icon: ImageVector, color: Color, title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    val p = LocalPalette.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconTile(icon, color, size = 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text)
            Text(subtitle, style = Type.bodySmall, color = p.textMuted)
        }
        Spacer(Modifier.width(10.dp))
        GlassSwitch(checked, onChange)
    }
}

@Composable
private fun TimeSheet(app: AppState, index: Int, minutes: Int) {
    val p = LocalPalette.current
    var hour by remember { mutableIntStateOf(minutes / 60) }
    var minute by remember { mutableIntStateOf((minutes % 60) / 5) }
    Text("Reminder ${index + 1}", style = Type.title, color = p.text)
    VSpace(14.dp)
    Row(verticalAlignment = Alignment.CenterVertically) {
        WheelPicker((0..23).map { "%02d".format(it) }, hour, { hour = it }, Modifier.weight(1f))
        Text(":", style = Type.title, color = p.text, modifier = Modifier.padding(horizontal = 8.dp))
        WheelPicker((0..11).map { "%02d".format(it * 5) }, minute, { minute = it }, Modifier.weight(1f))
    }
    VSpace(16.dp)
    GlassButton("SET TIME", {
        app.updateSettings { s ->
            val list = s.reminderTimes.toMutableList()
            if (index in list.indices) list[index] = hour * 60 + minute * 5
            s.copy(reminderTimes = list.sorted())
        }
        app.closeOverlay()
    }, Modifier.fillMaxWidth(), icon = IronIcons.Check)
}
