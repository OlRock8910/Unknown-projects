package com.ironlog.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * The app's icon set: rounded 2px strokes on a 24 grid, drawn here rather than pulled
 * from a library so every glyph shares the same weight and cap style. Icons are tinted
 * at the call site, so the colour below is only a placeholder.
 */
object IronIcons {

    private fun icon(name: String, vararg strokes: String, fills: List<String> = emptyList(), width: Float = 2f): ImageVector {
        val b = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f)
        for (d in strokes) {
            b.addPath(
                pathData = addPathNodes(d),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = width,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        for (d in fills) b.addPath(pathData = addPathNodes(d), fill = SolidColor(Color.Black))
        return b.build()
    }

    private fun rr(x: Float, y: Float, w: Float, h: Float, r: Float): String =
        "M${x + r} $y H${x + w - r} A$r $r 0 0 1 ${x + w} ${y + r} V${y + h - r} A$r $r 0 0 1 ${x + w - r} ${y + h} " +
            "H${x + r} A$r $r 0 0 1 $x ${y + h - r} V${y + r} A$r $r 0 0 1 ${x + r} $y Z"

    private fun circle(cx: Float, cy: Float, r: Float): String =
        "M${cx - r} $cy A$r $r 0 1 0 ${cx + r} $cy A$r $r 0 1 0 ${cx - r} $cy Z"

    val Barbell = icon(
        "barbell",
        "M8.5 12 H15.5", "M1.8 12 H3.2", "M20.8 12 H22.2",
        rr(3.4f, 7.5f, 2.4f, 9f, 1.1f), rr(6.2f, 5f, 2.6f, 14f, 1.2f),
        rr(15.2f, 5f, 2.6f, 14f, 1.2f), rr(18.2f, 7.5f, 2.4f, 9f, 1.1f),
    )
    val Dumbbell = icon(
        "dumbbell",
        "M8 12 H16", "M3 10 V14", "M21 10 V14",
        rr(5f, 7f, 3f, 10f, 1.2f), rr(16f, 7f, 3f, 10f, 1.2f),
    )
    val Chart = icon("chart", "M4 4 V20 H20", "M7.5 15 L11 11.5 L14 13.5 L19.5 8", "M16 8 H19.5 V11.5")
    val Notes = icon("notes", rr(5f, 3f, 14f, 18f, 3f), "M9 8 H15", "M9 12 H15", "M9 16 H12.5")
    val Gear = icon(
        "gear",
        circle(12f, 12f, 3f), circle(12f, 12f, 6.8f),
        "M12 2.6 V4.4", "M12 19.6 V21.4", "M2.6 12 H4.4", "M19.6 12 H21.4",
        "M5.35 5.35 L6.6 6.6", "M17.4 17.4 L18.65 18.65", "M5.35 18.65 L6.6 17.4", "M17.4 6.6 L18.65 5.35",
        width = 2.1f,
    )
    val Plus = icon("plus", "M12 5 V19", "M5 12 H19", width = 2.4f)
    val Minus = icon("minus", "M5.5 12 H18.5", width = 2.6f)
    val Back = icon("back", "M15 5 L8 12 L15 19", width = 2.4f)
    val ChevronRight = icon("chevron", "M9.5 5.5 L16 12 L9.5 18.5")
    val ChevronDown = icon("chevron_down", "M6 9.5 L12 15.5 L18 9.5")
    val Check = icon("check", "M5 12.5 L10 17.5 L19 7", width = 2.6f)
    val Close = icon("close", "M6.5 6.5 L17.5 17.5", "M17.5 6.5 L6.5 17.5", width = 2.3f)
    val Trash = icon("trash", "M4 7 H20", "M9.5 7 V4.8 H14.5 V7", "M6.5 7 L7.4 19.2 A1.6 1.6 0 0 0 9 20.6 H15 A1.6 1.6 0 0 0 16.6 19.2 L17.5 7", "M10 11 V16.5", "M14 11 V16.5")
    val Edit = icon("edit", "M4.5 19.5 L5.2 15.6 L15.3 5.5 A2 2 0 0 1 18.5 8.7 L8.4 18.8 Z", "M13.6 7.2 L16.8 10.4")
    val Search = icon("search", circle(10.8f, 10.8f, 6.3f), "M15.6 15.6 L20.3 20.3", width = 2.2f)
    val NoteLines = icon("note_lines", "M5 7 H19", "M5 12 H19", "M5 17 H14", width = 2.3f)
    val Trophy = icon(
        "trophy",
        "M7.5 4 H16.5 V9.5 A4.5 4.5 0 0 1 7.5 9.5 Z",
        "M7.5 6 H4.5 V7 A3.5 3.5 0 0 0 8 10.5", "M16.5 6 H19.5 V7 A3.5 3.5 0 0 1 16 10.5",
        "M12 14 V17", "M8.5 20.5 H15.5", "M9.5 17 H14.5 V20.5 H9.5 Z",
    )
    val Flame = icon("flame", "M12 3 C13 6.5 17.5 8.5 17.5 13.8 A5.5 5.5 0 0 1 6.5 13.8 C6.5 11 8 9.6 9 8 C9.6 9.8 10.4 10.6 11.2 11 C11.6 8.3 11.2 5.6 12 3 Z")
    val Bell = icon("bell", "M6.2 16.5 V11 A5.8 5.8 0 0 1 17.8 11 V16.5 L19.5 18.5 H4.5 Z", "M10 21 H14")
    val Calendar = icon("calendar", rr(3.5f, 5f, 17f, 15.5f, 3f), "M3.5 10 H20.5", "M8 3 V7", "M16 3 V7")
    val Copy = icon("copy", rr(8.5f, 8.5f, 12f, 12f, 2.6f), "M15.5 8.5 V6 A2.5 2.5 0 0 0 13 3.5 H6 A2.5 2.5 0 0 0 3.5 6 V13 A2.5 2.5 0 0 0 6 15.5 H8.5")
    val Share = icon("share", circle(18f, 5.5f, 2.5f), circle(6f, 12f, 2.5f), circle(18f, 18.5f, 2.5f), "M8.3 10.8 L15.7 6.7", "M8.3 13.2 L15.7 17.3")
    val Download = icon("download", "M12 4 V15", "M7 10.5 L12 15.5 L17 10.5", "M5 20 H19")
    val Upload = icon("upload", "M12 15.5 V4.5", "M7 9 L12 4 L17 9", "M5 20 H19")
    val Paste = icon("paste", rr(5f, 4.5f, 14f, 16.5f, 3f), rr(9f, 2.5f, 6f, 4f, 1.4f))
    val Info = icon("info", circle(12f, 12f, 9f), "M12 11 V16.5", "M12 7.6 V7.7", width = 2.2f)
    val Clock = icon("clock", circle(12f, 12f, 9f), "M12 7 V12 L15.5 14")
    val Pin = icon("pin", "M9 3.5 H15 L14 9.5 L17.5 13 H6.5 L10 9.5 Z", "M12 13 V20.5")
    val History = icon("history", "M4.2 12 A7.8 7.8 0 1 0 6.5 6.5", "M3.8 4.2 V8.4 H8", "M12 8 V12 L14.8 14.4")
    val Bolt = icon("bolt", "M13.2 2.5 L4.8 13.5 H11.2 L10.2 21.5 L19.2 10 H12.8 Z")
    val Play = icon("play", fills = listOf("M8 5.2 C8 4.4 8.9 3.9 9.6 4.4 L19 10.9 C19.6 11.4 19.6 12.6 19 13.1 L9.6 19.6 C8.9 20.1 8 19.6 8 18.8 Z"))
    val ArrowUp = icon("arrow_up", "M12 19 V5", "M6.5 10.5 L12 5 L17.5 10.5")
    val ArrowDown = icon("arrow_down", "M12 5 V19", "M6.5 13.5 L12 19 L17.5 13.5")
    val Person = icon("person", circle(12f, 8f, 4f), "M4.5 20.5 C5.5 16.5 8.5 14.5 12 14.5 C15.5 14.5 18.5 16.5 19.5 20.5")
    val Moon = icon("moon", "M20 14.5 A8.5 8.5 0 1 1 9.5 4 A6.8 6.8 0 0 0 20 14.5 Z")
    val Kettlebell = icon("kettlebell", "M9 9 V7.5 A3 3 0 0 1 15 7.5 V9", "M7.3 9.5 H16.7 L18.6 18 A2.2 2.2 0 0 1 16.4 20.6 H7.6 A2.2 2.2 0 0 1 5.4 18 Z")
    val Key = icon("key", circle(8f, 15f, 4f), "M10.8 12.2 L19.5 3.5", "M16.2 6.8 L18.8 9.4", "M13.9 9.1 L15.9 11.1")
    val FileText = icon("file_text", "M6 3 H14 L19 8 V19.5 A1.5 1.5 0 0 1 17.5 21 H6.5 A1.5 1.5 0 0 1 5 19.5 V4 A1 1 0 0 1 6 3 Z", "M14 3 V8 H19", "M8.5 12.5 H15.5", "M8.5 16.5 H13.5")
    val Warning = icon("warning", "M10.3 4.3 A2 2 0 0 1 13.7 4.3 L21.2 17.6 A2 2 0 0 1 19.5 20.5 H4.5 A2 2 0 0 1 2.8 17.6 Z", "M12 9.5 V13.5", "M12 16.8 V16.9", width = 2.1f)
    val Sparkle = icon("sparkle", "M12 3 L13.8 10.2 L21 12 L13.8 13.8 L12 21 L10.2 13.8 L3 12 L10.2 10.2 Z")
    val Target = icon("target", circle(12f, 12f, 8.5f), circle(12f, 12f, 4.5f), "M12 11.9 V12.1", width = 2.1f)
    val Repeat = icon("repeat", "M17 3.5 L20.5 7 L17 10.5", "M3.5 12 V10 A3 3 0 0 1 6.5 7 H20.5", "M7 20.5 L3.5 17 L7 13.5", "M20.5 12 V14 A3 3 0 0 1 17.5 17 H3.5")
    val Layers = icon("layers", "M12 3.5 L21 8.5 L12 13.5 L3 8.5 Z", "M3 12.5 L12 17.5 L21 12.5", "M3 16.5 L12 21.5 L21 16.5")
}
