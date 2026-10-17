package com.ironlog.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Palette
import com.ironlog.ui.theme.Type
import com.ironlog.ui.theme.contentOn
import com.ironlog.ui.theme.ink

val CardShape = RoundedCornerShape(26.dp)
val PillShape = RoundedCornerShape(50)

/**
 * Tinted glass: a translucent fill over the glowing background, a soft sheen on the top
 * half, and a light rim that is brightest at the top-left like light catching an edge.
 */
fun Modifier.glass(
    p: Palette,
    shape: Shape = CardShape,
    tint: Color = Color.Transparent,
    tintAlpha: Float = 0.12f,
    rim: Boolean = true,
): Modifier {
    // No elevation shadow here: under a translucent fill it would show through as a dark patch.
    return this
        .clip(shape)
        .background(Brush.verticalGradient(listOf(p.glassTop, p.glassBottom)))
        .then(
            if (tint != Color.Transparent) {
                Modifier.background(
                    Brush.linearGradient(
                        listOf(tint.copy(alpha = tintAlpha * p.glowScale), tint.copy(alpha = tintAlpha * p.glowScale * 0.25f)),
                        start = Offset.Zero, end = Offset.Infinite,
                    ),
                )
            } else Modifier,
        )
        .drawWithCache {
            val sheen = Brush.verticalGradient(
                0f to p.sheen, 1f to Color.Transparent, startY = 0f, endY = size.height * 0.55f,
            )
            onDrawBehind { drawRect(sheen, size = Size(size.width, size.height * 0.55f)) }
        }
        .then(
            if (rim) {
                Modifier.border(
                    1.dp,
                    Brush.linearGradient(
                        listOf(p.rimBright, p.rimDim, p.rimDim, p.rimBright.copy(alpha = p.rimBright.alpha * 0.45f)),
                        start = Offset.Zero, end = Offset.Infinite,
                    ),
                    shape,
                )
            } else Modifier,
        )
}

/** A soft coloured light behind an element, spilling past its edges. Drawn, not a shadow, so it never shows through glass. */
fun Modifier.glow(color: Color, spread: Float = 0.9f, alpha: Float = 0.35f): Modifier = drawBehind {
    val r = maxOf(size.width, size.height) * spread
    drawCircle(
        Brush.radialGradient(listOf(color.copy(alpha = alpha), color.copy(alpha = 0f)), center = center, radius = r),
        radius = r, center = center,
    )
}

/** Shrinks a touch while pressed, so every tappable surface feels physical. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun Modifier.pressable(
    onClick: (() -> Unit)?,
    onLongClick: (() -> Unit)? = null,
    enabled: Boolean = true,
    scaleDown: Float = 0.97f,
    haptic: Boolean = false,
): Modifier {
    if (onClick == null && onLongClick == null) return this
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (pressed && enabled) scaleDown else 1f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "press",
    )
    val hf = LocalHapticFeedback.current
    return this
        .graphicsLayer { scaleX = scale; scaleY = scale }
        .combinedClickable(
            interactionSource = source,
            indication = null,
            enabled = enabled,
            onLongClick = onLongClick?.let { l -> { hf.performHapticFeedback(HapticFeedbackType.LongPress); l() } },
            onClick = {
                if (haptic) hf.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick?.invoke()
            },
        )
}

@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    tint: Color = Color.Transparent,
    tintAlpha: Float = 0.12f,
    shape: Shape = CardShape,
    padding: PaddingValues = PaddingValues(18.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val p = LocalPalette.current
    Column(
        modifier
            .pressable(onClick, onLongClick)
            .glass(p, shape, tint, tintAlpha)
            .padding(padding),
        content = content,
    )
}

/** The soft light blobs everything floats on. */
@Composable
fun GlassBackground(modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    Canvas(modifier.fillMaxSize()) {
        drawRect(Brush.verticalGradient(listOf(p.background, p.backgroundEdge, p.background)))
        val w = size.width
        val h = size.height
        val spots = listOf(
            Triple(Offset(w * 0.12f, h * 0.06f), w * 0.85f, p.glows[0]),
            Triple(Offset(w * 1.02f, h * 0.42f), w * 0.75f, p.glows[1]),
            Triple(Offset(w * 0.05f, h * 0.92f), w * 0.9f, p.glows[2]),
        )
        for ((c, r, color) in spots) {
            drawCircle(Brush.radialGradient(listOf(color, color.copy(alpha = 0f)), center = c, radius = r), r, c)
        }
        // A faint diagonal light streak, like a reflection on glass.
        drawRect(
            Brush.linearGradient(
                0f to Color.Transparent, 0.45f to Color.Transparent,
                0.5f to Color.White.copy(alpha = if (p.isDark) 0.025f else 0.12f),
                0.55f to Color.Transparent, 1f to Color.Transparent,
                start = Offset(0f, 0f), end = Offset(w, h),
            ),
        )
    }
}

enum class ButtonStyle { PRIMARY, SECONDARY, DANGER, GHOST }

@Composable
fun GlassButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    style: ButtonStyle = ButtonStyle.PRIMARY,
    enabled: Boolean = true,
    height: Dp = 56.dp,
    accent: Color? = null,
) {
    val p = LocalPalette.current
    val a = accent ?: p.accent
    val shape = PillShape
    val content = when (style) {
        ButtonStyle.PRIMARY -> if (accent != null) contentOn(a) else p.onAccent
        ButtonStyle.DANGER -> contentOn(p.danger)
        ButtonStyle.SECONDARY -> p.text
        ButtonStyle.GHOST -> p.ink(a)
    }
    val bg: Modifier = when {
        // A disabled main button stays solid (so nothing shows through it) but goes flat and dim.
        style == ButtonStyle.PRIMARY && !enabled -> Modifier.clip(shape).background(lerp(p.background, a, 0.28f))
        else -> when (style) {
        ButtonStyle.PRIMARY -> Modifier
            .shadow(if (enabled) 18.dp else 0.dp, shape, ambientColor = a, spotColor = a)
            .clip(shape)
            .background(Brush.verticalGradient(listOf(lerp(a, Color.White, 0.18f), a)))
            .drawWithCache {
                val sheen = Brush.verticalGradient(0f to Color.White.copy(alpha = 0.35f), 1f to Color.Transparent, endY = size.height * 0.5f)
                onDrawBehind { drawRect(sheen, size = Size(size.width, size.height * 0.5f)) }
            }
        ButtonStyle.DANGER -> Modifier.clip(shape).background(Brush.verticalGradient(listOf(lerp(p.danger, Color.White, 0.12f), p.danger)))
        ButtonStyle.SECONDARY -> Modifier.glass(p, shape)
        ButtonStyle.GHOST -> Modifier.clip(shape)
        }
    }
    Row(
        modifier
            .height(height)
            .pressable(onClick, enabled = enabled, haptic = true)
            .graphicsLayer { alpha = if (enabled || style == ButtonStyle.PRIMARY) 1f else 0.4f }
            .then(bg)
            .padding(horizontal = 18.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, null, tint = if (enabled) content else p.textMuted, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, style = Type.button, color = if (enabled) content else p.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun CircleIconButton(
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 46.dp,
    tint: Color? = null,
    filled: Boolean = false,
    contentDescription: String? = null,
) {
    val p = LocalPalette.current
    Box(
        modifier
            .size(size)
            .pressable(onClick, scaleDown = 0.9f, haptic = true)
            .then(
                if (filled) {
                    Modifier
                        .shadow(14.dp, CircleShape, ambientColor = p.accent, spotColor = p.accent)
                        .clip(CircleShape)
                        .background(Brush.verticalGradient(listOf(lerp(p.accent, Color.White, 0.2f), p.accent)))
                } else Modifier.glass(p, CircleShape),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription, tint = tint ?: if (filled) p.onAccent else p.text, modifier = Modifier.size(size * 0.46f))
    }
}

@Composable
fun Chip(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Color? = null,
    leading: String? = null,
) {
    val p = LocalPalette.current
    val a = accent ?: p.accent
    val bg by animateColorAsState(if (selected) a else Color.Transparent, label = "chip")
    val fg = if (selected) (if (accent != null) contentOn(a) else p.onAccent) else p.textMuted
    Row(
        modifier
            .height(38.dp)
            .pressable(onClick, scaleDown = 0.93f, haptic = true)
            .then(if (selected) Modifier.clip(PillShape).background(bg) else Modifier.glass(p, PillShape))
            .padding(horizontal = 15.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (leading != null) {
            Text(leading, style = Type.bodySmall)
            Spacer(Modifier.width(6.dp))
        }
        Text(text, style = Type.label, color = fg, maxLines = 1)
    }
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, trailing: @Composable (() -> Unit)? = null) {
    val p = LocalPalette.current
    Row(modifier.fillMaxWidth().padding(top = 8.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text.uppercase(), style = Type.label, color = p.textMuted, modifier = Modifier.weight(1f))
        trailing?.invoke()
    }
}

@Composable
fun Hairline(modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    Box(modifier.fillMaxWidth().height(1.dp).background(p.text.copy(alpha = 0.08f)))
}

@Composable
fun GlassSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    val t by animateFloatAsState(if (checked) 1f else 0f, spring(dampingRatio = 0.7f, stiffness = 500f), label = "switch")
    Box(
        modifier
            .size(54.dp, 32.dp)
            .pressable({ onCheckedChange(!checked) }, scaleDown = 0.92f, haptic = true)
            .clip(PillShape)
            .background(lerp(p.field, p.accent, t))
            .border(1.dp, p.rimDim, PillShape),
    ) {
        Box(
            Modifier
                .padding(3.dp)
                .graphicsLayer { translationX = t * 22.dp.toPx() }
                .size(26.dp)
                .shadow(4.dp, CircleShape)
                .clip(CircleShape)
                .background(
                    when {
                        // A white accent (one-colour mode) needs a dark knob to stay visible.
                        checked && p.accent.luminance() > 0.9f -> Color(0xFF151515)
                        checked || !p.isDark -> Color.White
                        else -> Color(0xFFBFC6C0)
                    },
                ),
        )
    }
}

/** A row of equal options with the chosen one lit up, e.g. KG | LB. */
@Composable
fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    Row(modifier.height(46.dp).glass(p, PillShape).padding(4.dp)) {
        options.forEachIndexed { i, label ->
            val on = i == selected
            val bg by animateColorAsState(if (on) p.accent else Color.Transparent, label = "seg")
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxSize()
                    .clip(PillShape)
                    .background(bg)
                    .pressable({ onSelect(i) }, scaleDown = 0.95f, haptic = true),
                contentAlignment = Alignment.Center,
            ) {
                Text(label, style = Type.label, color = if (on) p.onAccent else p.textMuted, textAlign = TextAlign.Center, maxLines = 1)
            }
        }
    }
}

/** An icon sitting on a small glowing tile. */
@Composable
fun IconTile(icon: ImageVector, color: Color, modifier: Modifier = Modifier, size: Dp = 40.dp) {
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.32f))
            .background(Brush.linearGradient(listOf(color.copy(alpha = 0.32f), color.copy(alpha = 0.10f)), start = Offset.Zero, end = Offset.Infinite))
            .border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(size * 0.32f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = color, modifier = Modifier.size(size * 0.52f))
    }
}

/** Filled circle with a bar through it: the "this set has a note" marker. */
@Composable
fun NoteBadge(color: Color, modifier: Modifier = Modifier, size: Dp = 22.dp) {
    Box(
        modifier
            .size(size)
            .shadow(8.dp, CircleShape, ambientColor = color, spotColor = color)
            .clip(CircleShape)
            .background(Brush.verticalGradient(listOf(lerp(color, Color.White, 0.25f), color))),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(size * 0.55f, size * 0.14f).clip(PillShape).background(Color.White))
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, message: String, modifier: Modifier = Modifier, action: @Composable (() -> Unit)? = null) {
    val p = LocalPalette.current
    GlassCard(modifier.fillMaxWidth(), padding = PaddingValues(26.dp)) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            IconTile(icon, p.accent, size = 58.dp)
            Spacer(Modifier.height(16.dp))
            Text(title, style = Type.headline, color = p.text, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text(message, style = Type.bodySmall, color = p.textMuted, textAlign = TextAlign.Center)
            if (action != null) {
                Spacer(Modifier.height(18.dp))
                action()
            }
        }
    }
}
