package com.ironlog.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironlog.domain.Templates
import com.ironlog.domain.WeightUnit
import com.ironlog.ui.AppState
import com.ironlog.ui.Screen
import com.ironlog.ui.components.BottomActions
import com.ironlog.ui.components.ButtonStyle
import com.ironlog.ui.components.CircleIconButton
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.GlassCard
import com.ironlog.ui.components.IconTile
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.Page
import com.ironlog.ui.components.PillShape
import com.ironlog.ui.components.SectionLabel
import com.ironlog.ui.components.Segmented
import com.ironlog.ui.components.VSpace
import com.ironlog.ui.components.glow
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import com.ironlog.ui.platform.SystemBackHandler

private const val STEPS = 5

@Composable
fun OnboardingScreen(app: AppState) {
    val p = LocalPalette.current
    var step by rememberSaveable { mutableIntStateOf(0) }
    var forward by remember { mutableStateOf(true) }
    var unit by rememberSaveable { mutableStateOf(app.current.settings.unit) }
    var template by rememberSaveable { mutableStateOf<String?>("ppl") }
    val form = rememberSaveable(saver = ProfileFormSaver) { ProfileForm(app.current.profile, unit) }

    fun go(to: Int) { forward = to > step; step = to }
    // Back steps through setup instead of closing the app.
    SystemBackHandler(enabled = step > 0 && app.overlay == null) { go(step - 1) }
    fun finish() = app.finishOnboarding(form.toProfile(), unit, template)

    Box(Modifier.fillMaxSize()) {
        AnimatedContent(
            targetState = step,
            transitionSpec = {
                val d = if (forward) 1 else -1
                (slideInHorizontally(tween(320)) { it * d / 4 } + fadeIn(tween(260))) togetherWith (slideOutHorizontally(tween(320)) { -it * d / 6 } + fadeOut(tween(160)))
            },
            label = "onboarding",
        ) { s ->
            Page(bottomInset = 150.dp) {
                item {
                    if (s > 0) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircleIconButton(IronIcons.Back, { go(s - 1) }, contentDescription = "Back")
                            Spacer(Modifier.width(14.dp))
                            Dots(s)
                        }
                        VSpace(22.dp)
                    }
                    when (s) {
                        0 -> Welcome()
                        1 -> {
                            Title("About you", "So the app can cheer you on properly.")
                            ProfileFields(form, app.today(), showBody = false)
                        }
                        2 -> {
                            Title("Your body & units", "All optional except units. You can change these any time.")
                            SectionLabel("Lift in")
                            Segmented(listOf("KILOGRAMS (KG)", "POUNDS (LB)"), if (unit == WeightUnit.KG) 0 else 1, {
                                unit = if (it == 0) WeightUnit.KG else WeightUnit.LB
                                form.unit = unit
                            }, Modifier.fillMaxWidth())
                            VSpace(4.dp)
                            ProfileBody(form)
                        }
                        3 -> {
                            Title("Build your week", "Start from a plan, or make your own. Everything can be edited later.")
                            Templates.all.forEach { t ->
                                TemplateCard(t.emoji, t.name, t.description, t.workouts.joinToString(" · ") { it.name }, template == t.id) { template = t.id }
                                VSpace(10.dp)
                            }
                            TemplateCard("✍️", "Build my own", "Start empty and add your own workouts and days", null, template == null) { template = null }
                        }
                        else -> {
                            Title("Never skip a day", "On days you've planned a workout, IronLog nudges you 2–3 times until it's logged. No sounds — just a quiet notification.")
                            GlassCard(Modifier.fillMaxWidth()) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    IconTile(IronIcons.Bell, p.accent)
                                    Spacer(Modifier.width(14.dp))
                                    Column {
                                        Text("Leg day 🦵 today 💪 Don't skip it!", style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text)
                                        Text("IronLog · 18:00", style = Type.bodySmall, color = p.textMuted)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        BottomActions {
            Column(Modifier.weight(1f)) {
                when (step) {
                    0 -> {
                        GlassButton("GET STARTED", { go(1) }, Modifier.fillMaxWidth(), icon = IronIcons.Bolt)
                        VSpace(8.dp)
                        GlassButton("I have a backup code", { app.push(Screen.Backup) }, Modifier.fillMaxWidth(), style = ButtonStyle.GHOST, height = 46.dp)
                    }
                    STEPS - 1 -> {
                        GlassButton("ALLOW REMINDERS", {
                            app.platform.requestNotifications { granted ->
                                app.updateSettings { it.copy(remindersEnabled = granted) }
                                finish()
                            }
                        }, Modifier.fillMaxWidth(), icon = IronIcons.Bell)
                        VSpace(8.dp)
                        GlassButton("Not now", {
                            app.updateSettings { it.copy(remindersEnabled = false) }
                            finish()
                        }, Modifier.fillMaxWidth(), style = ButtonStyle.GHOST, height = 46.dp)
                    }
                    else -> GlassButton("NEXT", { go(step + 1) }, Modifier.fillMaxWidth(), icon = IronIcons.ChevronRight)
                }
            }
        }
    }
}

@Composable
private fun Welcome() {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(118.dp)
                .glow(p.accent, spread = 1.1f, alpha = 0.4f)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(p.accent.copy(alpha = 0.35f), p.accent2.copy(alpha = 0.18f))))
                .border(1.5.dp, Brush.linearGradient(listOf(Color.White.copy(alpha = 0.7f), Color.White.copy(alpha = 0.05f))), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(IronIcons.Barbell, null, tint = p.accent, modifier = Modifier.size(64.dp))
        }
        VSpace(26.dp)
        Text("IRONLOG", style = Type.display.copy(fontSize = 44.sp, letterSpacing = 4.sp), color = p.text)
        VSpace(6.dp)
        Text("Track every rep. Beat every week.", style = Type.body, color = p.textMuted, textAlign = TextAlign.Center)
        VSpace(34.dp)
        Feature(IronIcons.Dumbbell, p.accent, "Log in seconds", "Last time's weights are filled in. Just tap + or −.")
        Feature(IronIcons.Chart, p.accent2, "See yourself get stronger", "Clear graphs for every exercise, from 1 week to lifetime.")
        Feature(IronIcons.Flame, p.flame, "Stay hyped", "PR celebrations, challenges and reminders on gym days.")
    }
}

@Composable
private fun Feature(icon: ImageVector, color: Color, title: String, text: String) {
    val p = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconTile(icon, color, size = 46.dp)
        Spacer(Modifier.width(14.dp))
        Column {
            Text(title, style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text)
            Text(text, style = Type.bodySmall, color = p.textMuted)
        }
    }
}

@Composable
private fun Title(title: String, sub: String) {
    val p = LocalPalette.current
    Text(title, style = Type.display, color = p.text)
    VSpace(6.dp)
    Text(sub, style = Type.body, color = p.textMuted)
    VSpace(22.dp)
}

@Composable
private fun Dots(step: Int) {
    val p = LocalPalette.current
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        (1 until STEPS).forEach { i ->
            val w by animateDpAsState(if (i == step) 26.dp else 8.dp, label = "dot")
            val c by animateColorAsState(if (i <= step) p.accent else p.text.copy(alpha = 0.2f), label = "dotc")
            Box(Modifier.size(w, 8.dp).clip(PillShape).background(c))
        }
    }
}

@Composable
private fun TemplateCard(emoji: String, name: String, desc: String, days: String?, selected: Boolean, onClick: () -> Unit) {
    val p = LocalPalette.current
    GlassCard(
        Modifier.fillMaxWidth().then(if (selected) Modifier.border(2.dp, p.accent, com.ironlog.ui.components.CardShape) else Modifier),
        onClick = onClick, tint = if (selected) p.accent else Color.Transparent, tintAlpha = 0.14f, padding = PaddingValues(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(emoji, fontSize = 30.sp)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(name, style = Type.headline, color = p.text)
                Text(desc, style = Type.bodySmall, color = p.textMuted)
                if (days != null) {
                    VSpace(4.dp)
                    Text(days, style = Type.label, color = if (selected) p.accent else p.textFaint)
                }
            }
            Box(
                Modifier.size(26.dp).clip(CircleShape).background(if (selected) p.accent else p.field),
                contentAlignment = Alignment.Center,
            ) {
                if (selected) Icon(IronIcons.Check, null, tint = p.onAccent, modifier = Modifier.size(15.dp))
            }
        }
    }
}
