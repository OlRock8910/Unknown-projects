package com.gymcam.app

import android.Manifest
import android.animation.ValueAnimator
import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.AttributeSet
import android.widget.FrameLayout
import android.view.View
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.min

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("gymcam", Context.MODE_PRIVATE)

    var onboarded: Boolean
        get() = sp.getBoolean("onboarded", false)
        set(v) = sp.edit().putBoolean("onboarded", v).apply()
    var songInVideo: Boolean
        get() = sp.getBoolean("song", false)
        set(v) = sp.edit().putBoolean("song", v).apply()
    var songVolume: Int
        get() = sp.getInt("songVol", 80)
        set(v) = sp.edit().putInt("songVol", v).apply()
    /** Exposure compensation index (0 = camera default). */
    var exposure: Int
        get() = sp.getInt("exposure", 0)
        set(v) = sp.edit().putInt("exposure", v).apply()
    var frontCamera: Boolean
        get() = sp.getBoolean("front", false)
        set(v) = sp.edit().putBoolean("front", v).apply()
    var photoMode: Boolean
        get() = sp.getBoolean("photo", false)
        set(v) = sp.edit().putBoolean("photo", v).apply()
}

fun Context.has(permission: String) =
    ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

fun Context.hasMediaRead(): Boolean = if (Build.VERSION.SDK_INT >= 33) {
    has(Manifest.permission.READ_MEDIA_IMAGES) || has(Manifest.permission.READ_MEDIA_VIDEO) ||
        (Build.VERSION.SDK_INT >= 34 && has(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED))
} else has(Manifest.permission.READ_EXTERNAL_STORAGE)

fun Context.hasNotifications(): Boolean =
    Build.VERSION.SDK_INT < 33 || has(Manifest.permission.POST_NOTIFICATIONS)

/** The first page won't let you past until every one of these is allowed. */
fun Context.allPermissionsGranted(): Boolean =
    has(Manifest.permission.CAMERA) && has(Manifest.permission.RECORD_AUDIO) &&
        hasMediaRead() && hasNotifications()

fun Context.dp(v: Int) = (v * resources.displayMetrics.density).toInt()

fun formatDuration(ms: Long): String {
    val s = ms / 1000
    return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60)
    else "%d:%02d".format(s / 60, s % 60)
}

data class MediaItem(val id: Long, val uri: Uri, val isVideo: Boolean, val durationMs: Long)

/** Everything lands in DCIM/GymCam so it shows up in the phone's gallery / Google Photos. */
object GymMedia {
    const val FOLDER = "DCIM/GymCam"

    private fun stamp() = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())

    fun photoValues() = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, "GymCam_${stamp()}.jpg")
        put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
        put(MediaStore.MediaColumns.RELATIVE_PATH, FOLDER)
    }

    fun createPendingVideo(cr: ContentResolver): Uri? {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "GymCam_${stamp()}.mp4")
            put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
            put(MediaStore.MediaColumns.RELATIVE_PATH, FOLDER)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        return cr.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
    }

    fun publish(cr: ContentResolver, uri: Uri) {
        cr.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
    }

    fun query(context: Context, limit: Int = 0): List<MediaItem> {
        val items = ArrayList<MediaItem>()
        val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL)
        val projection = arrayOf(
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.MEDIA_TYPE,
            MediaStore.MediaColumns.DURATION,
        )
        val selection = "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ? AND " +
            "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (?, ?)"
        val args = arrayOf(
            "$FOLDER%",
            MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(),
            MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString(),
        )
        val sort = "${MediaStore.MediaColumns.DATE_ADDED} DESC"
        runCatching {
            context.contentResolver.query(collection, projection, selection, args, sort)?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getLong(0)
                    val video = c.getInt(1) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
                    val base = if (video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                    items += MediaItem(id, ContentUris.withAppendedId(base, id), video, c.getLong(2))
                    if (limit > 0 && items.size >= limit) break
                }
            }
        }
        return items
    }
}

/** Big round shutter: white for photo, red for video, morphs into a stop square while recording. */
class ShutterButton @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null,
) : View(context, attrs) {

    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = 0xFFFFFFFF.toInt()
    }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private var t = 0f
    private var anim: ValueAnimator? = null

    var videoMode = false
        set(v) { field = v; invalidate() }

    var recording = false
        set(v) {
            if (field == v) return
            field = v
            anim?.cancel()
            anim = ValueAnimator.ofFloat(t, if (v) 1f else 0f).apply {
                duration = 220
                addUpdateListener { t = it.animatedValue as Float; invalidate() }
                start()
            }
        }

    init {
        isClickable = true
        isFocusable = true
    }

    override fun drawableStateChanged() {
        super.drawableStateChanged()
        val s = if (isPressed) 0.92f else 1f
        animate().scaleX(s).scaleY(s).setDuration(90).start()
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        val r = min(width, height) / 2f
        val stroke = r * 0.08f
        ring.strokeWidth = stroke
        canvas.drawCircle(cx, cy, r - stroke / 2, ring)
        fill.color = if (videoMode) 0xFFFF3B30.toInt() else 0xFFFFFFFF.toInt()
        val full = r - stroke * 2.2f
        val half = full + (full * 0.48f - full) * t
        val corner = half + (half * 0.28f - half) * t
        canvas.drawRoundRect(cx - half, cy - half, cx + half, cy + half, corner, corner, fill)
    }
}

class SquareFrameLayout @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null,
) : FrameLayout(context, attrs) {
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        super.onMeasure(widthMeasureSpec, widthMeasureSpec)
    }
}
