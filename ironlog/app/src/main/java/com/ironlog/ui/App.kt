package com.ironlog.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironlog.ui.components.GlassBackground
import com.ironlog.ui.components.IronIcons
import com.ironlog.ui.components.PillShape
import com.ironlog.ui.components.glass
import com.ironlog.ui.components.pressable
import com.ironlog.ui.platform.SystemBackHandler
import com.ironlog.ui.platform.horizontalSafeArea
import com.ironlog.ui.platform.navigationBarHeight
import com.ironlog.ui.platform.statusBarHeight
import com.ironlog.ui.screens.BackupScreen
import com.ironlog.ui.screens.ExercisePickerScreen
import com.ironlog.ui.screens.ExerciseStatsScreen
import com.ironlog.ui.screens.HomeScreen
import com.ironlog.ui.screens.ImportScreen
import com.ironlog.ui.screens.LoggerScreen
import com.ironlog.ui.screens.NoteEditScreen
import com.ironlog.ui.screens.NotesScreen
import com.ironlog.ui.screens.OnboardingScreen
import com.ironlog.ui.screens.ProfileScreen
import com.ironlog.ui.screens.ProgressScreen
import com.ironlog.ui.screens.SessionScreen
import com.ironlog.ui.screens.SettingsScreen
import com.ironlog.ui.screens.WorkoutEditScreen
import com.ironlog.ui.screens.WorkoutScreen
import com.ironlog.ui.theme.IronTheme
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type

@Composable
fun IronLogApp(app: AppState) {
    val data by app.data.collectAsState()
    LaunchedEffect(data.settings.theme) {
        app.platform.setSystemBarsDark(data.settings.theme != com.ironlog.domain.ThemeMode.LIGHT)
    }
    IronTheme(data.settings.theme, data.settings.monoColor) {
        val p = LocalPalette.current
        SystemBackHandler(enabled = app.overlay != null || app.stack.size > 1 || app.stack.first() != Screen.Home && app.stack.first() != Screen.Onboarding) {
            app.pop()
        }
        Box(Modifier.fillMaxSize().background(p.background)) {
            GlassBackground()
            val holder = rememberSaveableStateHolder()
            // Forget a screen's saved state once it leaves the stack, so "New note" or the
            // importer open empty next time instead of showing what was typed before.
            val liveKeys = app.stack.map { it.toString() }.toSet()
            val known = remember { mutableSetOf<String>() }
            LaunchedEffect(liveKeys) {
                (known - liveKeys).forEach { holder.removeState(it) }
                known.clear()
                known.addAll(liveKeys)
            }
            AnimatedContent(
                targetState = app.screen,
                modifier = Modifier.horizontalSafeArea(),
                transitionSpec = {
                    val dir = if (app.forward) 1 else -1
                    (slideInHorizontally(tween(320)) { w -> dir * w / 5 } + fadeIn(tween(260)))
                        .togetherWith(slideOutHorizontally(tween(320)) { w -> -dir * w / 8 } + fadeOut(tween(180)))
                },
                label = "screens",
            ) { screen ->
                holder.SaveableStateProvider(screen.toString()) {
                    ScreenContent(app, screen)
                }
            }
            // Swallow touches while screens slide, so a double-tap can't hit the next screen.
            if (app.navBusy) {
                Box(Modifier.fillMaxSize().pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent() } })
            }
            // Content scrolls under the transparent status bar; fade it out so the clock stays readable.
            Box(
                Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .height(statusBarHeight() + 14.dp)
                    .background(Brush.verticalGradient(listOf(p.background.copy(alpha = 0.94f), p.background.copy(alpha = 0.7f), Color.Transparent))),
            )
            val showNav = app.stack.size == 1 && app.tab != null
            AnimatedVisibility(
                visible = showNav,
                enter = slideInVertically { it } + fadeIn(),
                exit = slideOutVertically { it } + fadeOut(),
                modifier = Modifier.align(Alignment.BottomCenter).horizontalSafeArea(),
            ) {
                BottomNav(app)
            }
            Overlays(app)
        }
    }
}

@Composable
private fun ScreenContent(app: AppState, screen: Screen) {
    when (screen) {
        Screen.Home -> HomeScreen(app)
        Screen.Progress -> ProgressScreen(app)
        Screen.Notes -> NotesScreen(app)
        is Screen.WorkoutView -> WorkoutScreen(app, screen.workoutId)
        is Screen.WorkoutEdit -> WorkoutEditScreen(app)
        is Screen.Picker -> ExercisePickerScreen(app, screen.targetWorkoutId)
        is Screen.Logger -> LoggerScreen(app, screen.workoutId, screen.exerciseId, screen.sessionId)
        is Screen.ExerciseStats -> ExerciseStatsScreen(app, screen.exerciseId)
        is Screen.SessionView -> SessionScreen(app, screen.sessionId)
        is Screen.NoteEdit -> NoteEditScreen(app, screen.noteId)
        Screen.Settings -> SettingsScreen(app)
        Screen.ProfileEdit -> ProfileScreen(app)
        Screen.Backup -> BackupScreen(app)
        Screen.ImportText -> ImportScreen(app)
        Screen.Onboarding -> OnboardingScreen(app)
    }
}

@Composable
private fun BottomNav(app: AppState) {
    val p = LocalPalette.current
    Box(Modifier.fillMaxWidth().padding(start = 22.dp, end = 22.dp, bottom = 14.dp + navigationBarHeight())) {
        Row(
            Modifier
                .fillMaxWidth()
                .height(70.dp)
                .background(p.background.copy(alpha = if (p.isDark) 0.86f else 0.94f), PillShape)
                .glass(p, PillShape)
                .padding(6.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            NavItem(app, Tab.HOME, IronIcons.Barbell, "HOME")
            NavItem(app, Tab.PROGRESS, IronIcons.Chart, "PROGRESS")
            NavItem(app, Tab.NOTES, IronIcons.Notes, "NOTES")
        }
    }
}

@Composable
private fun RowScope.NavItem(app: AppState, tab: Tab, icon: ImageVector, label: String) {
    val p = LocalPalette.current
    val on = app.tab == tab
    Box(
        Modifier
            .weight(1f)
            .fillMaxHeight()
            .clip(PillShape)
            .then(
                if (on) Modifier.background(
                    Brush.verticalGradient(listOf(p.accent.copy(alpha = 0.30f), p.accent.copy(alpha = 0.12f))),
                ) else Modifier,
            )
            .pressable({ app.selectTab(tab) }, scaleDown = 0.92f, haptic = true),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, label, tint = if (on) p.accent else p.textMuted, modifier = Modifier.size(25.dp))
            Spacer(Modifier.height(3.dp))
            Text(label, style = Type.label.copy(fontSize = 9.5.sp), color = if (on) p.accent else p.textMuted)
        }
    }
}
