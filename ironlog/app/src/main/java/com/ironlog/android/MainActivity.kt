package com.ironlog.android

import android.Manifest
import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.ironlog.ui.AppState
import com.ironlog.ui.IronLogApp
import com.ironlog.ui.platform.Platform

/** Survives rotation and theme changes; the activity-bound platform is swapped in each time. */
class MainViewModel(app: Application) : AndroidViewModel(app) {
    val platform = PlatformProxy()
    val state = AppState(app.ironLog.store, platform, viewModelScope)

    // Picker and permission callbacks live here, not on the activity, so a rotation or a
    // theme change while the system picker is open doesn't lose them.
    var pendingSave: Pair<String, (Boolean) -> Unit>? = null
    var pendingOpen: ((String?) -> Unit)? = null
    var pendingPermission: ((Boolean) -> Unit)? = null
}

/** Forwards to whichever activity is currently alive. */
class PlatformProxy : Platform {
    var target: Platform? = null
    override val appVersion: String get() = target?.appVersion ?: ""
    override fun copyText(text: String) { target?.copyText(text) }
    override fun pasteText(): String? = target?.pasteText()
    override fun shareText(subject: String, text: String) { target?.shareText(subject, text) }
    override fun saveTextFile(suggestedName: String, text: String, onDone: (Boolean) -> Unit) {
        target?.saveTextFile(suggestedName, text, onDone) ?: onDone(false)
    }
    override fun openTextFile(onResult: (String?) -> Unit) { target?.openTextFile(onResult) ?: onResult(null) }
    override fun notificationsAllowed(): Boolean = target?.notificationsAllowed() ?: false
    override fun requestNotifications(onResult: (Boolean) -> Unit) { target?.requestNotifications(onResult) ?: onResult(false) }
    override fun setSystemBarsDark(dark: Boolean) { target?.setSystemBarsDark(dark) }
}

class MainActivity : ComponentActivity(), Platform {

    companion object {
        const val EXTRA_WORKOUT = "com.ironlog.WORKOUT"
    }

    private val vm: MainViewModel by viewModels()

    private val createDoc = registerForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri: Uri? ->
        val pending = vm.pendingSave
        vm.pendingSave = null
        if (uri == null) { pending?.second?.invoke(false); return@registerForActivityResult }
        // If the app was killed while the picker was open, the text is gone; the only thing
        // ever saved is the backup code, so write a fresh one rather than an empty file.
        val text = pending?.first ?: vm.state.backupCode()
        val ok = runCatching {
            contentResolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray(Charsets.UTF_8)) } != null
        }.getOrDefault(false)
        val done = pending?.second
        if (done != null) done(ok) else if (ok) vm.state.showToast("Backup saved ✓")
    }

    private val openDoc = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        val cb = vm.pendingOpen ?: return@registerForActivityResult
        vm.pendingOpen = null
        cb(uri?.let { u -> runCatching { contentResolver.openInputStream(u)?.use { it.readBytes().toString(Charsets.UTF_8) } }.getOrNull() })
    }

    private val askPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        vm.pendingPermission?.invoke(granted)
        vm.pendingPermission = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        vm.platform.target = this
        // Only a fresh launch carries a reminder/widget tap; a recreated activity or a
        // relaunch from Recents would replay the old one.
        if (savedInstanceState == null) handleIntent(intent)
        setContent { IronLogApp(vm.state) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** A tap on a reminder or widget opens that workout. */
    private fun handleIntent(intent: Intent?) {
        if (intent == null || (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return
        val id = intent.getStringExtra(EXTRA_WORKOUT) ?: return
        intent.removeExtra(EXTRA_WORKOUT)
        vm.state.openWorkout(id)
    }

    override fun onStop() {
        super.onStop()
        ironLog.store.flush()
    }

    override fun onDestroy() {
        if (vm.platform.target === this) vm.platform.target = null
        super.onDestroy()
    }

    // ------------------------------------------------------------ Platform

    override val appVersion: String
        get() = runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull() ?: ""

    override fun copyText(text: String) {
        getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("IronLog", text))
    }

    override fun pasteText(): String? =
        getSystemService(ClipboardManager::class.java)?.primaryClip?.takeIf { it.itemCount > 0 }
            ?.getItemAt(0)?.coerceToText(this)?.toString()

    override fun shareText(subject: String, text: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        startActivity(Intent.createChooser(send, subject))
    }

    override fun saveTextFile(suggestedName: String, text: String, onDone: (Boolean) -> Unit) {
        vm.pendingSave = text to onDone
        runCatching { createDoc.launch(suggestedName) }.onFailure { vm.pendingSave = null; onDone(false) }
    }

    override fun openTextFile(onResult: (String?) -> Unit) {
        vm.pendingOpen = onResult
        runCatching { openDoc.launch(arrayOf("text/*", "application/octet-stream")) }.onFailure { vm.pendingOpen = null; onResult(null) }
    }

    override fun notificationsAllowed(): Boolean = Notifications.allowed(this)

    override fun requestNotifications(onResult: (Boolean) -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || notificationsAllowed()) {
            onResult(true)
            return
        }
        vm.pendingPermission = onResult
        askPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun setSystemBarsDark(dark: Boolean) {
        val style = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(style, style)
    }
}
