package com.ironlog.ui.platform

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// Desktop stand-ins for Platform.android.kt, used only by the verification build.

@Composable
fun SystemBackHandler(enabled: Boolean, onBack: () -> Unit) {}

@Composable
fun statusBarHeight(): Dp = 28.dp

@Composable
fun navigationBarHeight(): Dp = 16.dp

@Composable
fun imeHeight(): Dp = 0.dp

@Composable
fun Modifier.horizontalSafeArea(): Modifier = this
