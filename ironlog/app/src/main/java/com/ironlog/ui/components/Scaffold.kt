package com.ironlog.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ironlog.ui.platform.imeHeight
import com.ironlog.ui.platform.navigationBarHeight
import com.ironlog.ui.platform.statusBarHeight
import com.ironlog.ui.theme.LocalPalette
import com.ironlog.ui.theme.Type

@Composable
fun TopBar(
    title: String,
    onBack: (() -> Unit)?,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val p = LocalPalette.current
    Row(modifier.fillMaxWidth().padding(top = 6.dp, bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) {
            CircleIconButton(IronIcons.Back, onBack, contentDescription = "Back")
            Spacer(Modifier.width(14.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = Type.title, color = p.text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) {
                Text(subtitle, style = Type.bodySmall, color = p.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, content = actions)
    }
}

/**
 * A scrolling page that starts below the status bar. [bottomInset] leaves room for the
 * floating nav bar or a pinned button.
 */
@Composable
fun Page(
    modifier: Modifier = Modifier,
    state: LazyListState = rememberLazyListState(),
    bottomInset: Dp = 120.dp,
    content: LazyListScope.() -> Unit,
) {
    val top = statusBarHeight()
    // The keyboard shrinks the list itself (not just its padding), so a focused field near
    // the bottom is scrolled into the part of the screen that is still visible.
    val ime = imeHeight()
    LazyColumn(
        modifier.fillMaxSize().padding(bottom = ime),
        state = state,
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = top + 10.dp, bottom = bottomInset + if (ime > 0.dp) 0.dp else navigationBarHeight()),
        content = content,
    )
}

/** Buttons pinned to the bottom of a screen, over a fade so content scrolls under them. */
@Composable
fun BoxScope.BottomActions(content: @Composable RowScope.() -> Unit) {
    val p = LocalPalette.current
    Box(
        Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, p.background.copy(alpha = 0.92f), p.background)))
            .padding(start = 16.dp, end = 16.dp, top = 28.dp, bottom = 14.dp + maxOf(navigationBarHeight(), imeHeight())),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, content = content)
    }
}

@Composable
fun VSpace(h: Dp) = Spacer(Modifier.height(h))
