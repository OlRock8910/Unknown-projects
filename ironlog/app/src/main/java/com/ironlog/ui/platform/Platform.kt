package com.ironlog.ui.platform

/** What the UI needs from the operating system, so the screens stay free of Android calls. */
interface Platform {
    val appVersion: String
    fun copyText(text: String)
    fun pasteText(): String?
    fun shareText(subject: String, text: String)
    /** Opens the system "save as" picker and writes [text] to the chosen file. */
    fun saveTextFile(suggestedName: String, text: String, onDone: (Boolean) -> Unit)
    /** Opens the system file picker and reads the chosen file as text (null if cancelled). */
    fun openTextFile(onResult: (String?) -> Unit)
    fun notificationsAllowed(): Boolean
    fun requestNotifications(onResult: (Boolean) -> Unit)
    fun setSystemBarsDark(dark: Boolean)
}
