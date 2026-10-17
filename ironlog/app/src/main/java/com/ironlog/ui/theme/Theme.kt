package com.ironlog.ui.theme

import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.ironlog.domain.ThemeMode

@Immutable
data class Palette(
    val isDark: Boolean,
    val background: Color,
    val backgroundEdge: Color,
    /** Soft light blobs behind the glass: (colour, alpha already applied). */
    val glows: List<Color>,
    val accent: Color,
    val accent2: Color,
    val onAccent: Color,
    val text: Color,
    val textMuted: Color,
    val textFaint: Color,
    val glassTop: Color,
    val glassBottom: Color,
    val rimBright: Color,
    val rimDim: Color,
    val sheen: Color,
    val field: Color,
    val danger: Color,
    val success: Color,
    val note: Color,
    val scrim: Color,
    // Extra hues for icons and stats; all collapse to the accent in one-colour mode.
    val flame: Color = Color(0xFFFF9F3D),
    val gold: Color = Color(0xFFFFD447),
    val pink: Color = Color(0xFFFF5CA8),
    val mono: Boolean = false,
    /** Scales coloured tints and glows; pure black mode turns them right down. */
    val glowScale: Float = 1f,
)

private val GymPalette = Palette(
    isDark = true,
    background = Color(0xFF000000),
    backgroundEdge = Color(0xFF060A07),
    glows = listOf(Color(0x40B8FF2C), Color(0x2E00D1FF), Color(0x1F7B5CFF)),
    accent = Color(0xFFC6FF3D),
    accent2 = Color(0xFF3DDCFF),
    onAccent = Color(0xFF0B1200),
    text = Color(0xFFF4F7F1),
    textMuted = Color(0xFFA2ABA3),
    textFaint = Color(0xFF6A726B),
    glassTop = Color(0x1FFFFFFF),
    glassBottom = Color(0x0AFFFFFF),
    rimBright = Color(0x59FFFFFF),
    rimDim = Color(0x0FFFFFFF),
    sheen = Color(0x17FFFFFF),
    field = Color(0x14FFFFFF),
    danger = Color(0xFFFF5A5F),
    success = Color(0xFF5CFF9D),
    note = Color(0xFFFF9F3D),
    scrim = Color(0xB3000000),
)

private val DarkPalette = Palette(
    isDark = true,
    background = Color(0xFF060914),
    backgroundEdge = Color(0xFF0C1124),
    glows = listOf(Color(0x597061FF), Color(0x4000C2FF), Color(0x26FF4FA3)),
    accent = Color(0xFF6FE6FF),
    accent2 = Color(0xFFA68CFF),
    onAccent = Color(0xFF00141C),
    text = Color(0xFFF2F4FF),
    textMuted = Color(0xFFA3A9C4),
    textFaint = Color(0xFF6C7290),
    glassTop = Color(0x24FFFFFF),
    glassBottom = Color(0x0DFFFFFF),
    rimBright = Color(0x66FFFFFF),
    rimDim = Color(0x12FFFFFF),
    sheen = Color(0x1AFFFFFF),
    field = Color(0x17FFFFFF),
    danger = Color(0xFFFF5C7A),
    success = Color(0xFF5CF2B0),
    note = Color(0xFFFFB84D),
    scrim = Color(0xB3050712),
)

private val LightPalette = Palette(
    isDark = false,
    background = Color(0xFFE9EEF6),
    backgroundEdge = Color(0xFFF6F8FC),
    glows = listOf(Color(0x667AA7FF), Color(0x4DFF9CCB), Color(0x4D7FF0C4)),
    accent = Color(0xFF2F6BFF),
    accent2 = Color(0xFFFF4F9A),
    onAccent = Color(0xFFFFFFFF),
    text = Color(0xFF0E1322),
    textMuted = Color(0xFF586178),
    textFaint = Color(0xFF8D95A8),
    glassTop = Color(0xE6FFFFFF),
    glassBottom = Color(0xA6FFFFFF),
    rimBright = Color(0xFFFFFFFF),
    rimDim = Color(0x1A0E1322),
    sheen = Color(0x80FFFFFF),
    field = Color(0x99FFFFFF),
    danger = Color(0xFFE5394B),
    success = Color(0xFF14B86A),
    note = Color(0xFFF08A00),
    scrim = Color(0x99101828),
)

/** Black mode's colours: the first (white) is pure black and white, the rest add one accent. */
val MonoColors = listOf(
    Color(0xFFFFFFFF), Color(0xFFC6FF3D), Color(0xFF3DDCFF), Color(0xFFFF4D5E),
    Color(0xFFFF9F3D), Color(0xFFFF5CA8), Color(0xFF9D7BFF), Color(0xFFFFE14D),
)

fun monoColor(index: Int): Color = MonoColors[Math.floorMod(index, MonoColors.size)]

/**
 * Black mode: black glass where every accent (buttons, icons, graphs, workouts, notes) is
 * the one chosen colour. With white it is pure black and white, with only a faint light
 * behind the glass so it stays properly black.
 */
fun monoPalette(c: Color): Palette {
    val plain = c.luminance() > 0.9f
    return GymPalette.copy(
    background = Color(0xFF000000),
    backgroundEdge = if (plain) Color(0xFF050505) else lerp(Color(0xFF000000), c, 0.05f),
    glows = if (plain) listOf(c.copy(alpha = 0.07f), c.copy(alpha = 0.045f), c.copy(alpha = 0.03f))
    else listOf(c.copy(alpha = 0.24f), c.copy(alpha = 0.15f), c.copy(alpha = 0.09f)),
    accent = c,
    accent2 = c,
    onAccent = contentOn(c),
    danger = c,
    success = c,
    note = c,
    flame = c,
    gold = c,
    pink = c,
    mono = true,
    glowScale = if (plain) 0.35f else 1f,
    )
}

fun paletteFor(mode: ThemeMode, monoIndex: Int = 0): Palette = when (mode) {
    ThemeMode.GYM -> GymPalette
    ThemeMode.DARK -> DarkPalette
    ThemeMode.LIGHT -> LightPalette
    ThemeMode.MONO -> monoPalette(monoColor(monoIndex))
}

/** Bright accents a workout can wear. Index is stored on the workout. */
val WorkoutColors = listOf(
    Color(0xFFC6FF3D), Color(0xFF3DDCFF), Color(0xFFFF5CA8), Color(0xFFFF9F3D),
    Color(0xFF9D7BFF), Color(0xFFFFE14D), Color(0xFF3DFFB0), Color(0xFFFF5A5A),
)

fun workoutColor(index: Int): Color = WorkoutColors[Math.floorMod(index, WorkoutColors.size)]

/** A workout's colour in the current theme (always the accent in one-colour mode). */
fun Palette.workout(index: Int): Color = if (mono) accent else workoutColor(index)

val LocalPalette = staticCompositionLocalOf { GymPalette }

/** A bright accent used as text: kept as-is on dark themes, deepened on light glass so it stays readable. */
fun Palette.ink(c: Color): Color = if (isDark) c else lerp(c, Color.Black, 0.45f)

/** Text/icon colour that reads on top of a filled [background]. */
fun contentOn(background: Color): Color = if (background.luminance() > 0.45f) Color(0xFF0A0F05) else Color.White

object Type {
    val display = TextStyle(fontSize = 34.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp, lineHeight = 38.sp)
    val title = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.3).sp, lineHeight = 28.sp)
    val headline = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Bold, lineHeight = 23.sp)
    val body = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Medium, lineHeight = 21.sp)
    val bodySmall = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Medium, lineHeight = 18.sp)
    val label = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.4.sp)
    val number = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp)
    val button = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.6.sp)
}

@Composable
fun IronTheme(mode: ThemeMode, monoIndex: Int = 0, content: @Composable () -> Unit) {
    val p = paletteFor(mode, monoIndex)
    val scheme = if (p.isDark) {
        darkColorScheme(primary = p.accent, onPrimary = p.onAccent, background = p.background, surface = p.background, onSurface = p.text, onBackground = p.text)
    } else {
        lightColorScheme(primary = p.accent, onPrimary = p.onAccent, background = p.background, surface = p.background, onSurface = p.text, onBackground = p.text)
    }
    MaterialTheme(colorScheme = scheme) {
        CompositionLocalProvider(
            LocalPalette provides p,
            LocalTextSelectionColors provides TextSelectionColors(p.accent, p.accent.copy(alpha = 0.35f)),
            content = content,
        )
    }
}
