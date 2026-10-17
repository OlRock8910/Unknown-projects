package com.ironlog.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlin.math.abs

/** − value + . Tapping the value lets you type an exact number. */
@Composable
fun Stepper(
    value: String,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    onValueClick: () -> Unit,
    modifier: Modifier = Modifier,
    dim: Boolean = false,
    buttonSize: Dp = 34.dp,
) {
    val p = LocalPalette.current
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        StepButton(IronIcons.Minus, onMinus, buttonSize)
        Box(
            Modifier.weight(1f).height(buttonSize + 6.dp).pressable(onValueClick, scaleDown = 0.92f),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                value,
                style = TextStyle(fontSize = 19.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Black),
                color = if (dim) p.textFaint else p.text,
                maxLines = 1,
                textAlign = TextAlign.Center,
            )
        }
        StepButton(IronIcons.Plus, onPlus, buttonSize)
    }
}

@Composable
private fun StepButton(icon: ImageVector, onClick: () -> Unit, size: Dp) {
    val p = LocalPalette.current
    Box(
        Modifier
            .size(size)
            .pressable(onClick, scaleDown = 0.85f, haptic = true)
            .clip(CircleShape)
            .background(p.field),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = p.accent, modifier = Modifier.size(size * 0.5f))
    }
}

@Composable
fun GlassTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    singleLine: Boolean = true,
    minHeight: Dp = 54.dp,
    keyboardType: KeyboardType = KeyboardType.Text,
    capitalization: KeyboardCapitalization = KeyboardCapitalization.Sentences,
    imeAction: ImeAction = ImeAction.Done,
    onDone: (() -> Unit)? = null,
    textStyle: TextStyle = Type.body,
    leading: ImageVector? = null,
    suffix: String? = null,
    focusRequester: FocusRequester? = null,
    maxLength: Int = 5000,
    maxLines: Int = Int.MAX_VALUE,
    /** Start with the whole value selected, so typing replaces it (number entry). */
    selectAll: Boolean = false,
) {
    val p = LocalPalette.current
    // Track the cursor ourselves: a plain String field starts with the cursor at the front,
    // so typing into "60" would give "560". Start at the end, or with everything selected.
    var field by remember {
        mutableStateOf(TextFieldValue(value, if (selectAll) TextRange(0, value.length) else TextRange(value.length)))
    }
    if (field.text != value) field = TextFieldValue(value, TextRange(value.length))
    BasicTextField(
        value = field,
        onValueChange = { new ->
            if (new.text.length <= maxLength) {
                field = new
                if (new.text != value) onValueChange(new.text)
            }
        },
        modifier = modifier
            .heightIn(min = minHeight)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier),
        singleLine = singleLine,
        maxLines = if (singleLine) 1 else maxLines,
        textStyle = textStyle.copy(color = p.text),
        cursorBrush = SolidColor(p.accent),
        keyboardOptions = KeyboardOptions(capitalization = capitalization, keyboardType = keyboardType, imeAction = imeAction),
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }, onSearch = { onDone?.invoke() }),
        decorationBox = { inner ->
            Row(
                Modifier
                    .heightIn(min = minHeight)
                    .clip(RoundedCornerShape(18.dp))
                    .background(p.field)
                    .padding(horizontal = 16.dp, vertical = if (singleLine) 0.dp else 14.dp),
                verticalAlignment = if (singleLine) Alignment.CenterVertically else Alignment.Top,
            ) {
                if (leading != null) {
                    Icon(leading, null, tint = p.textMuted, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                }
                Box(Modifier.weight(1f)) {
                    if (field.text.isEmpty()) Text(placeholder, style = textStyle, color = p.textFaint)
                    inner()
                }
                if (suffix != null) {
                    Spacer(Modifier.width(8.dp))
                    Text(suffix, style = Type.label, color = p.textMuted)
                }
            }
        },
    )
}

/**
 * An iOS-style scrolling wheel. The middle row is the selection; flinging snaps to a row.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun WheelPicker(
    items: List<String>,
    selected: Int,
    onSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
    rowHeight: Dp = 42.dp,
    visibleRows: Int = 5,
) {
    val p = LocalPalette.current
    val state = rememberLazyListState(initialFirstVisibleItemIndex = selected.coerceIn(0, (items.size - 1).coerceAtLeast(0)))
    val fling = rememberSnapFlingBehavior(state)
    val pad = rowHeight * (visibleRows / 2)
    val current by remember {
        derivedStateOf {
            val info = state.layoutInfo
            val center = (info.viewportStartOffset + info.viewportEndOffset) / 2f
            info.visibleItemsInfo.minByOrNull { abs(it.offset + it.size / 2f - center) }?.index
                ?: state.firstVisibleItemIndex
        }
    }
    val latest by rememberUpdatedState(onSelected)
    LaunchedEffect(state) {
        snapshotFlow { state.isScrollInProgress to current }
            .distinctUntilChanged()
            .collect { (scrolling, idx) -> if (!scrolling && idx in items.indices) latest(idx) }
    }
    LaunchedEffect(selected) {
        if (!state.isScrollInProgress && selected != current && selected in items.indices) state.scrollToItem(selected)
    }
    BoxWithConstraints(modifier.height(rowHeight * visibleRows)) {
        Box(
            Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .height(rowHeight)
                .clip(RoundedCornerShape(14.dp))
                .background(p.accent.copy(alpha = 0.16f)),
        )
        LazyColumn(
            state = state,
            flingBehavior = fling,
            contentPadding = PaddingValues(vertical = pad),
            modifier = Modifier.fillMaxWidth(),
        ) {
            itemsIndexed(items) { i, label ->
                val distance = abs(i - current)
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(rowHeight)
                        .graphicsLayer {
                            alpha = when (distance) { 0 -> 1f; 1 -> 0.55f; else -> 0.25f }
                            val s = if (distance == 0) 1f else 0.9f
                            scaleX = s; scaleY = s
                        }
                        .pressable({ latest(i) }, scaleDown = 0.95f),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label,
                        style = if (distance == 0) Type.headline else Type.body,
                        color = if (distance == 0) p.text else p.textMuted,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/** Small key/value line used on detail cards. */
@Composable
fun StatLine(label: String, value: String, modifier: Modifier = Modifier, valueColor: Color? = null) {
    val p = LocalPalette.current
    Row(modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = Type.bodySmall, color = p.textMuted)
        Spacer(Modifier.width(12.dp))
        Text(value, style = Type.body.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = valueColor ?: p.text, textAlign = TextAlign.End)
    }
}
