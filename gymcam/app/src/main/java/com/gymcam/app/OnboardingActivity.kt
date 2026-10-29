package com.gymcam.app

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

/**
 * First launch: tap each card to allow it. Continue stays locked until every one is allowed.
 */
class OnboardingActivity : ComponentActivity() {

    private class Row(val viewId: Int, val permissions: Array<String>, val granted: () -> Boolean)

    private lateinit var btn: TextView
    private lateinit var rows: List<Row>
    private val asked = HashSet<String>()

    private val request =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_onboarding)
        val content = findViewById<View>(R.id.content)
        ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.updatePadding(top = bars.top + dp(32), bottom = bars.bottom + dp(24))
            insets
        }

        val photos = if (Build.VERSION.SDK_INT >= 33) {
            arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO)
        } else arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)

        rows = buildList {
            add(Row(R.id.permCamera, arrayOf(Manifest.permission.CAMERA)) { has(Manifest.permission.CAMERA) })
            add(Row(R.id.permMic, arrayOf(Manifest.permission.RECORD_AUDIO)) { has(Manifest.permission.RECORD_AUDIO) })
            add(Row(R.id.permPhotos, photos) { hasMediaRead() })
            if (Build.VERSION.SDK_INT >= 33) {
                add(Row(R.id.permNotif, arrayOf(Manifest.permission.POST_NOTIFICATIONS)) { hasNotifications() })
            }
        }

        setup(R.id.permCamera, R.drawable.ic_camera, "Camera", "To film your sets and snap pics")
        setup(R.id.permMic, R.drawable.ic_music, "Record audio", "Android needs this to put your song in the video. Your voice is never recorded.")
        setup(R.id.permPhotos, R.drawable.ic_photos, "Photos & videos", "Saves to your gallery and shows your library")
        setup(R.id.permNotif, R.drawable.ic_bell, "Notifications", "Shows when your song is being recorded")
        if (Build.VERSION.SDK_INT < 33) findViewById<View>(R.id.permNotif).visibility = View.GONE

        for (row in rows) {
            findViewById<View>(row.viewId).setOnClickListener { ask(row) }
        }

        btn = findViewById(R.id.btnContinue)
        btn.setOnClickListener {
            if (allPermissionsGranted()) {
                Prefs(this).onboarded = true
                startActivity(Intent(this, MainActivity::class.java))
                finish()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun ask(row: Row) {
        if (row.granted()) return
        // Once Android stops showing its popup ("don't ask again"), the only way is Settings.
        val blocked = row.permissions.all { it in asked && !shouldShowRequestPermissionRationale(it) }
        if (blocked) {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
            )
            return
        }
        asked += row.permissions
        request.launch(row.permissions)
    }

    private fun setup(id: Int, icon: Int, title: String, sub: String) {
        val v = findViewById<View>(id)
        v.findViewById<ImageView>(R.id.permIcon).setImageResource(icon)
        v.findViewById<TextView>(R.id.permTitle).text = title
        v.findViewById<TextView>(R.id.permSub).text = sub
    }

    private fun refresh() {
        var allowed = 0
        for (row in rows) {
            val ok = row.granted()
            if (ok) allowed++
            val v = findViewById<View>(row.viewId)
            v.findViewById<View>(R.id.permCheck).visibility = if (ok) View.VISIBLE else View.GONE
            v.findViewById<TextView>(R.id.permAction).visibility = if (ok) View.GONE else View.VISIBLE
            v.alpha = if (ok) 0.75f else 1f
        }
        val done = allowed == rows.size
        btn.isEnabled = done
        btn.alpha = if (done) 1f else 0.4f
        btn.text = if (done) "Continue" else "Allow all ${rows.size} to continue ($allowed/${rows.size})"
    }
}
