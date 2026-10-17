package com.ironlog.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironlog.domain.niceAxis
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max

private val dayMonth = DateTimeFormatter.ofPattern("d MMM", Locale.UK)
private val monthYear = DateTimeFormatter.ofPattern("MMM ''yy", Locale.UK)
private val fullDate = DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.UK)

/**
 * The progress graph. X is real time (so a three-week gap looks like one), Y is rounded
 * to clean steps. Touch and drag to read any point.
 */
@OptIn(ExperimentalTextApi::class)
@Composable
fun LineChart(
    points: List<Pair<LocalDate, Double>>,
    color: Color,
    formatValue: (Double) -> String,
    modifier: Modifier = Modifier,
    height: Dp = 230.dp,
    emptyText: String = "No sessions in this range yet",
) {
    val p = LocalPalette.current
    val measurer = rememberTextMeasurer()
    var selected by remember(points) { mutableStateOf<Int?>(null) }
    val reveal = remember { Animatable(0f) }
    LaunchedEffect(points) {
        reveal.snapTo(0f)
        reveal.animateTo(1f, tween(700, easing = FastOutSlowInEasing))
    }
    if (points.isEmpty()) {
        Box(modifier.fillMaxWidth().height(height), contentAlignment = Alignment.Center) {
            Text(emptyText, style = Type.bodySmall, color = p.textMuted)
        }
        return
    }
    val labelStyle = TextStyle(fontSize = 10.sp, fontWeight = FontWeight.Bold, color = p.textFaint)
    val minV = points.minOf { it.second }
    val maxV = points.maxOf { it.second }
    val (axisLo, axisHi, axisStep) = remember(points) { niceAxis(minV - (maxV - minV) * 0.08, maxV + (maxV - minV) * 0.08) }
    val firstDay = points.first().first
    val lastDay = points.last().first
    val spanDays = max(1L, ChronoUnit.DAYS.between(firstDay, lastDay))
    val dateFmt = if (spanDays > 200) monthYear else dayMonth

    Canvas(
        modifier
            .fillMaxWidth()
            .height(height)
            .pointerInput(points) {
                awaitEachGesture {
                    val down = awaitFirstDown()
                    fun pick(x: Float) {
                        val left = 44.dp.toPx()
                        val right = size.width - 12.dp.toPx()
                        val xs = points.map { (d, _) -> xFor(d, firstDay, spanDays, left, right, points.size) }
                        selected = xs.withIndex().minByOrNull { abs(it.value - x) }?.index
                    }
                    pick(down.position.x)
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull() ?: break
                        if (!change.pressed) break
                        pick(change.position.x)
                        change.consume()
                    }
                }
            },
    ) {
        val left = 44.dp.toPx()
        val right = size.width - 12.dp.toPx()
        val top = 14.dp.toPx()
        val bottom = size.height - 26.dp.toPx()
        fun yFor(v: Double): Float = (bottom - (v - axisLo) / (axisHi - axisLo) * (bottom - top)).toFloat()

        // Grid and Y labels.
        var tick = axisLo
        var guard = 0
        while (tick <= axisHi + 1e-9 && guard++ < 12) {
            val y = yFor(tick)
            drawLine(
                p.text.copy(alpha = 0.07f), Offset(left, y), Offset(right, y), 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 8f)),
            )
            val label = measurer.measure(formatValue(tick), labelStyle)
            drawText(label, topLeft = Offset(left - label.size.width - 8.dp.toPx(), y - label.size.height / 2f))
            tick += axisStep
        }
        // X labels: first, middle, last.
        val idxs = when {
            points.size == 1 -> listOf(0)
            points.size == 2 -> listOf(0, 1)
            else -> listOf(0, points.size / 2, points.size - 1)
        }
        for (i in idxs) {
            val x = xFor(points[i].first, firstDay, spanDays, left, right, points.size)
            val label = measurer.measure(points[i].first.format(dateFmt), labelStyle)
            val lx = (x - label.size.width / 2f).coerceIn(left - 6.dp.toPx(), size.width - label.size.width.toFloat())
            drawText(label, topLeft = Offset(lx, bottom + 8.dp.toPx()))
        }

        val pts = points.map { (d, v) -> Offset(xFor(d, firstDay, spanDays, left, right, points.size), yFor(v)) }
        val line = smoothPath(pts)
        val revealX = left + (size.width - left) * reveal.value
        clipRect(right = revealX) {
            if (pts.size > 1) {
                val fill = Path().apply {
                    addPath(line)
                    lineTo(pts.last().x, bottom)
                    lineTo(pts.first().x, bottom)
                    close()
                }
                drawPath(fill, Brush.verticalGradient(listOf(color.copy(alpha = 0.38f), color.copy(alpha = 0f)), startY = top, endY = bottom))
                // Glow under the line, then the line itself.
                drawPath(line, color.copy(alpha = 0.12f), style = Stroke(12.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                drawPath(line, color.copy(alpha = 0.22f), style = Stroke(6.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                drawPath(line, color, style = Stroke(2.8.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
            pts.forEachIndexed { i, o ->
                val last = i == pts.lastIndex
                if (last) drawCircle(color.copy(alpha = 0.25f), 10.dp.toPx(), o)
                drawCircle(color, if (last) 5.5.dp.toPx() else 3.6.dp.toPx(), o)
                drawCircle(p.background, if (last) 2.5.dp.toPx() else 1.6.dp.toPx(), o)
            }
        }

        selected?.let { i -> if (i in pts.indices) drawTooltip(pts[i], points[i], formatValue, color, top, bottom, measurer) }
    }
}

@OptIn(ExperimentalTextApi::class)
private fun DrawScope.drawTooltip(
    o: Offset,
    point: Pair<LocalDate, Double>,
    formatValue: (Double) -> String,
    color: Color,
    top: Float,
    bottom: Float,
    measurer: androidx.compose.ui.text.TextMeasurer,
) {
    drawLine(color.copy(alpha = 0.6f), Offset(o.x, top), Offset(o.x, bottom), 1.5.dp.toPx())
    drawCircle(color, 7.dp.toPx(), o)
    drawCircle(Color.White, 3.dp.toPx(), o)
    val v = measurer.measure(formatValue(point.second), TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color.White))
    val d = measurer.measure(point.first.format(fullDate), TextStyle(fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.75f)))
    val padH = 10.dp.toPx()
    val padV = 7.dp.toPx()
    val w = max(v.size.width, d.size.width) + padH * 2
    val h = v.size.height + d.size.height + padV * 2
    val x = (o.x - w / 2).coerceIn(0f, size.width - w)
    val y = if (o.y - h - 14.dp.toPx() > 0) o.y - h - 14.dp.toPx() else o.y + 14.dp.toPx()
    drawRoundRect(Color(0xE6101410), Offset(x, y), Size(w, h), CornerRadius(12.dp.toPx()))
    drawRoundRect(color.copy(alpha = 0.7f), Offset(x, y), Size(w, h), CornerRadius(12.dp.toPx()), style = Stroke(1.dp.toPx()))
    drawText(v, topLeft = Offset(x + padH, y + padV))
    drawText(d, topLeft = Offset(x + padH, y + padV + v.size.height))
}

private fun xFor(d: LocalDate, first: LocalDate, spanDays: Long, left: Float, right: Float, count: Int): Float {
    if (count == 1) return (left + right) / 2
    val t = ChronoUnit.DAYS.between(first, d).toFloat() / spanDays
    return left + (right - left) * t
}

/** Monotone cubic through the points: smooth, but never overshoots a real value. */
private fun smoothPath(pts: List<Offset>): Path {
    val path = Path()
    if (pts.isEmpty()) return path
    path.moveTo(pts[0].x, pts[0].y)
    if (pts.size == 1) return path
    val n = pts.size
    val dx = FloatArray(n - 1) { pts[it + 1].x - pts[it].x }
    val slope = FloatArray(n - 1) { if (dx[it] == 0f) 0f else (pts[it + 1].y - pts[it].y) / dx[it] }
    val m = FloatArray(n)
    m[0] = slope[0]
    m[n - 1] = slope[n - 2]
    for (i in 1 until n - 1) {
        m[i] = if (slope[i - 1] * slope[i] <= 0f) 0f else {
            val w1 = 2 * dx[i] + dx[i - 1]
            val w2 = dx[i] + 2 * dx[i - 1]
            (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i])
        }
    }
    for (i in 0 until n - 1) {
        val h = dx[i] / 3f
        path.cubicTo(pts[i].x + h, pts[i].y + m[i] * h, pts[i + 1].x - h, pts[i + 1].y - m[i + 1] * h, pts[i + 1].x, pts[i + 1].y)
    }
    return path
}

/** A tiny trend line for list rows. */
@Composable
fun Sparkline(values: List<Double>, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        if (values.size < 2) {
            drawLine(color.copy(alpha = 0.4f), Offset(0f, size.height / 2), Offset(size.width, size.height / 2), 2.dp.toPx(), cap = StrokeCap.Round)
            return@Canvas
        }
        val lo = values.min()
        val hi = values.max()
        val range = if (hi - lo < 1e-9) 1.0 else hi - lo
        val pts = values.mapIndexed { i, v ->
            Offset(size.width * i / (values.size - 1), (size.height - 3.dp.toPx() - ((v - lo) / range) * (size.height - 6.dp.toPx())).toFloat())
        }
        val path = smoothPath(pts)
        drawPath(path, color.copy(alpha = 0.25f), style = Stroke(6.dp.toPx(), cap = StrokeCap.Round))
        drawPath(path, color, style = Stroke(2.2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        drawCircle(color, 3.dp.toPx(), pts.last())
    }
}
