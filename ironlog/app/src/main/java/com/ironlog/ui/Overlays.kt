package com.ironlog.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironlog.ui.components.ButtonStyle
import com.ironlog.ui.components.CardShape
import com.ironlog.ui.components.GlassButton
import com.ironlog.ui.components.IconTile
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.PillShape
import com.ironlog.ui.components.glass
import com.ironlog.ui.components.glow
import com.ironlog.ui.components.pressable
import com.ironlog.ui.platform.imeHeight
import com.ironlog.ui.platform.navigationBarHeight
import com.ironlog.ui.platform.statusBarHeight
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import com.ironlog.ui.theme.contentOn
import com.ironlog.ui.theme.ink
import com.ironlog.ui.theme.workout
import androidx.compose.ui.graphics.lerp

@Composable
fun BoxScope.Overlays(app: AppState) {
    val p = LocalPalette.current
    val overlay = app.overlay
    // Keep the last sheet and the last dialog around separately while they animate out,
    // so a sheet replaced by a confirm dialog still has its content as it slides away.
    var lastSheet by remember { mutableStateOf<Overlay?>(null) }
    var lastDialog by remember { mutableStateOf<Overlay?>(null) }
    val isSheet = overlay is Overlay.Sheet || overlay is Overlay.AddMenu
    if (overlay != null) {
        if (isSheet) lastSheet = overlay else lastDialog = overlay
    }

    AnimatedVisibility(overlay != null, enter = fadeIn(tween(180)), exit = fadeOut(tween(200))) {
        Box(
            Modifier
                .fillMaxSize()
                .background(p.scrim)
                .clickable(remember { MutableInteractionSource() }, indication = null) {
                    if (overlay !is Overlay.Record && overlay !is Overlay.Finish) app.closeOverlay()
                },
        )
    }

    AnimatedVisibility(
        overlay != null && isSheet,
        enter = slideInVertically(spring(dampingRatio = 0.85f, stiffness = Spring.StiffnessMediumLow)) { it } + fadeIn(),
        exit = slideOutVertically(tween(220)) { it } + fadeOut(tween(220)),
        modifier = Modifier.align(Alignment.BottomCenter),
    ) {
        BottomSheet {
            when (val o = lastSheet) {
                is Overlay.Sheet -> o.content()
                Overlay.AddMenu -> AddMenu(app)
                else -> {}
            }
        }
    }

    AnimatedVisibility(
        overlay != null && !isSheet,
        enter = scaleIn(spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMediumLow), initialScale = 0.85f) + fadeIn(),
        exit = scaleOut(targetScale = 0.92f) + fadeOut(tween(150)),
        modifier = Modifier.align(Alignment.Center),
    ) {
        Box(Modifier.padding(22.dp).widthIn(max = 460.dp)) {
            when (val o = lastDialog) {
                is Overlay.Confirm -> ConfirmCard(app, o)
                is Overlay.Record -> RecordCard(app, o)
                is Overlay.Finish -> FinishCard(app, o)
                else -> {}
            }
        }
    }

    // Motivation banner at the top.
    val banner = app.banner
    var lastBanner by remember { mutableStateOf<Banner?>(null) }
    if (banner != null) lastBanner = banner
    AnimatedVisibility(
        banner != null,
        enter = slideInVertically(spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessMediumLow)) { -it * 2 } + fadeIn(),
        exit = slideOutVertically(tween(260)) { -it * 2 } + fadeOut(),
        modifier = Modifier.align(Alignment.TopCenter),
    ) {
        lastBanner?.let { b -> BannerCard(b) { app.dismissBanner() } }
    }

    // Toast at the bottom.
    val toast = app.toast
    var lastToast by remember { mutableStateOf("") }
    if (toast != null) lastToast = toast
    AnimatedVisibility(
        toast != null,
        enter = slideInVertically { it } + fadeIn(),
        exit = slideOutVertically { it } + fadeOut(),
        modifier = Modifier.align(Alignment.BottomCenter),
    ) {
        Box(Modifier.padding(bottom = 104.dp + navigationBarHeight(), start = 24.dp, end = 24.dp)) {
            Text(
                lastToast,
                style = Type.bodySmall,
                color = p.text,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .background(p.background.copy(alpha = 0.92f), PillShape)
                    .glass(p, PillShape)
                    .padding(horizontal = 20.dp, vertical = 13.dp),
            )
        }
    }
}

@Composable
private fun BottomSheet(content: @Composable ColumnScope.() -> Unit) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(max = 640.dp)
            .clickable(remember { MutableInteractionSource() }, indication = null) {}
            .background(p.background.copy(alpha = 0.94f), shape)
            .glass(p, shape)
            .padding(horizontal = 20.dp)
            .padding(top = 10.dp, bottom = 18.dp + maxOf(navigationBarHeight(), imeHeight())),
    ) {
        Box(Modifier.align(Alignment.CenterHorizontally).size(42.dp, 5.dp).clip(PillShape).background(p.text.copy(alpha = 0.2f)))
        Spacer(Modifier.height(16.dp))
        Column(Modifier.verticalScroll(rememberScrollState()), content = content)
    }
}

@Composable
private fun ConfirmCard(app: AppState, o: Overlay.Confirm) {
    val p = LocalPalette.current
    Column(
        Modifier.fillMaxWidth().background(p.background.copy(alpha = 0.94f), CardShape).glass(p, CardShape).padding(24.dp),
    ) {
        Text(o.title, style = Type.title, color = p.text)
        Spacer(Modifier.height(10.dp))
        Text(o.message, style = Type.body, color = p.textMuted)
        Spacer(Modifier.height(24.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            GlassButton(o.cancelText, { o.onCancel?.invoke() ?: app.closeOverlay() }, Modifier.weight(1f), style = ButtonStyle.SECONDARY, height = 52.dp)
            GlassButton(o.confirmText, { o.onConfirm() }, Modifier.weight(1f), style = if (o.danger) ButtonStyle.DANGER else ButtonStyle.PRIMARY, height = 52.dp)
        }
    }
}

@Composable
private fun RecordCard(app: AppState, o: Overlay.Record) {
    val p = LocalPalette.current
    val gold = p.gold
    Column(
        Modifier
            .fillMaxWidth()
            .glow(gold, spread = 0.75f, alpha = 0.28f)
            .background(p.background.copy(alpha = 0.94f), CardShape)
            .glass(p, CardShape, tint = gold, tintAlpha = 0.18f)
            .padding(26.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(92.dp)
                .shadow(30.dp, CircleShape, ambientColor = gold, spotColor = gold)
                .clip(CircleShape)
                .background(Brush.radialGradient(listOf(lerp(gold, Color.White, 0.45f), gold, lerp(gold, Color.Black, 0.12f))))
                .border(2.dp, Color.White.copy(alpha = 0.6f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(IronIcons.Trophy, null, tint = lerp(contentOn(gold), gold, 0.25f), modifier = Modifier.size(48.dp))
        }
        Spacer(Modifier.height(18.dp))
        Text(o.headline, style = Type.headline, color = p.text, textAlign = TextAlign.Center)
        Spacer(Modifier.height(14.dp))
        Text(o.exerciseName.uppercase(), style = Type.label, color = p.textMuted)
        Spacer(Modifier.height(4.dp))
        Text(o.setText, style = Type.display, color = p.ink(gold), textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(o.detail, style = Type.bodySmall, color = p.textMuted, textAlign = TextAlign.Center)
        if (o.brag != null) {
            Spacer(Modifier.height(16.dp))
            Text(
                o.brag,
                style = Type.body,
                color = p.text,
                textAlign = TextAlign.Center,
                modifier = Modifier.clip(RoundedCornerShape(18.dp)).background(gold.copy(alpha = 0.16f)).padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
        Spacer(Modifier.height(22.dp))
        GlassButton("LET'S GO 🔥", { app.closeOverlay() }, Modifier.fillMaxWidth(), accent = gold)
    }
}

@Composable
private fun FinishCard(app: AppState, o: Overlay.Finish) {
    val p = LocalPalette.current
    Column(
        Modifier
            .fillMaxWidth()
            .glow(p.accent, spread = 0.75f, alpha = 0.22f)
            .background(p.background.copy(alpha = 0.94f), CardShape)
            .glass(p, CardShape, tint = p.accent, tintAlpha = 0.14f)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        IconTile(IronIcons.Check, p.accent, size = 64.dp)
        Spacer(Modifier.height(14.dp))
        Text("WORKOUT DONE", style = Type.label, color = p.accent)
        Spacer(Modifier.height(4.dp))
        Text(o.title, style = Type.title, color = p.text, textAlign = TextAlign.Center)
        Spacer(Modifier.height(18.dp))
        o.stats.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { (label, value) ->
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(p.field).padding(vertical = 12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(value, style = Type.number, color = p.text)
                        Text(label.uppercase(), style = Type.label, color = p.textMuted)
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(o.message, style = Type.body, color = p.textMuted, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        GlassButton("DONE", { app.closeOverlay() }, Modifier.fillMaxWidth())
    }
}

@Composable
private fun BannerCard(b: Banner, onTap: () -> Unit) {
    val p = LocalPalette.current
    Row(
        Modifier
            // Below the top bar, so the back and graph buttons stay tappable.
            .padding(top = statusBarHeight() + 74.dp, start = 14.dp, end = 14.dp)
            .fillMaxWidth()
            .pressable(onTap)
            .background(p.background.copy(alpha = 0.94f), CardShape)
            .glass(p, CardShape, tint = p.accent, tintAlpha = 0.2f)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconTile(IronIcons.Bolt, p.accent, size = 44.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(b.headline, style = Type.label, color = p.ink(p.accent))
            Spacer(Modifier.height(4.dp))
            Text(b.body, style = Type.body.copy(fontWeight = FontWeight.Bold), color = p.text)
        }
    }
}

@Composable
private fun AddMenu(app: AppState) {
    val p = LocalPalette.current
    Text("Add", style = Type.title, color = p.text)
    Spacer(Modifier.height(14.dp))
    MenuRow(IronIcons.Layers, p.accent, "New workout", "Build a routine and pick its days") {
        app.closeOverlay(); app.startWorkoutEditor(null)
    }
    MenuRow(IronIcons.Dumbbell, p.accent2, "Add exercises to a workout", "Pick a workout, then search the library") {
        val workouts = app.current.workouts
        if (workouts.isEmpty()) {
            app.closeOverlay(); app.startWorkoutEditor(null)
        } else {
            app.sheet { ChooseWorkoutSheet(app) }
        }
    }
    MenuRow(IronIcons.Notes, p.flame, "New note", "PRs, goals, anything") {
        app.closeOverlay(); app.selectTab(Tab.NOTES); app.push(Screen.NoteEdit(null))
    }
    MenuRow(IronIcons.FileText, p.pink, "Add past progress", "Paste lifts from another app or notes") {
        app.closeOverlay(); app.push(Screen.ImportText)
    }
}

@Composable
private fun ChooseWorkoutSheet(app: AppState) {
    val p = LocalPalette.current
    Text("Add to which workout?", style = Type.title, color = p.text)
    Spacer(Modifier.height(14.dp))
    app.current.workouts.forEach { w ->
        MenuRow(IronIcons.Barbell, p.workout(w.color), "${w.name} ${w.emoji}".trim(), daysLabel(w.days)) {
            app.closeOverlay()
            app.push(Screen.Picker(w.id))
        }
    }
}

@Composable
fun MenuRow(icon: ImageVector, color: Color, title: String, subtitle: String?, onClick: () -> Unit) {
    val p = LocalPalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
            .pressable(onClick)
            .glass(p, RoundedCornerShape(22.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconTile(icon, color, size = 42.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = Type.headline.copy(fontSize = 16.sp), color = p.text)
            if (subtitle != null) Text(subtitle, style = Type.bodySmall, color = p.textMuted)
        }
        Icon(IronIcons.ChevronRight, null, tint = p.textFaint, modifier = Modifier.size(20.dp))
    }
}
