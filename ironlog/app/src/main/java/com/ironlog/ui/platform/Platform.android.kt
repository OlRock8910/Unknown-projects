package com.ironlog.ui.platform

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp

// Android versions of the few platform hooks the shared UI calls. The desktop
// verification build supplies its own file with the same functions.

@Composable
fun SystemBackHandler(enabled: Boolean, onBack: () -> Unit) = BackHandler(enabled, onBack)

@Composable
fun statusBarHeight(): Dp = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()

@Composable
fun navigationBarHeight(): Dp = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

@Composable
fun imeHeight(): Dp = WindowInsets.ime.asPaddingValues().calculateBottomPadding()

/** Keeps content clear of a side navigation bar or a display cutout in landscape. */
@Composable
fun Modifier.horizontalSafeArea(): Modifier = windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))
