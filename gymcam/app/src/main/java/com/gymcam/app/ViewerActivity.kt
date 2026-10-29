package com.gymcam.app

import android.content.Intent
import android.graphics.ImageDecoder
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.SeekBar
import android.widget.TextView
import android.widget.VideoView
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateLayoutParams
import androidx.core.view.updatePadding
import java.util.concurrent.Executors
import kotlin.math.max

/** Full-screen photo or video. Playback never takes audio focus, so your music keeps going. */
class ViewerActivity : ComponentActivity() {

    companion object {
        const val EXTRA_URI = "uri"
        const val EXTRA_VIDEO = "video"
    }

    private lateinit var video: VideoView
    private lateinit var bigPlay: ImageView
    private lateinit var btnPlayPause: ImageButton
    private lateinit var seek: SeekBar
    private lateinit var tvTime: TextView
    private val handler = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()

    private val tick = object : Runnable {
        override fun run() {
            if (video.duration > 0) {
                seek.max = video.duration
                seek.progress = video.currentPosition
                tvTime.text = "${formatDuration(video.currentPosition.toLong())} / ${formatDuration(video.duration.toLong())}"
            }
            handler.postDelayed(this, 250)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_viewer)
        val uri = Uri.parse(intent.getStringExtra(EXTRA_URI) ?: return finish())
        val isVideo = intent.getBooleanExtra(EXTRA_VIDEO, false)

        val header = findViewById<View>(R.id.header)
        val controls = findViewById<View>(R.id.controls)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            header.updatePadding(top = bars.top + dp(8))
            controls.updateLayoutParams<ViewGroup.MarginLayoutParams> { bottomMargin = bars.bottom + dp(16) }
            insets
        }
        findViewById<View>(R.id.btnBack).setOnClickListener { finish() }
        findViewById<View>(R.id.btnShare).setOnClickListener {
            val send = Intent(Intent.ACTION_SEND)
                .setType(if (isVideo) "video/mp4" else "image/jpeg")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            startActivity(Intent.createChooser(send, "Share"))
        }

        video = findViewById(R.id.video)
        bigPlay = findViewById(R.id.bigPlay)
        btnPlayPause = findViewById(R.id.btnPlayPause)
        seek = findViewById(R.id.seek)
        tvTime = findViewById(R.id.tvTime)

        if (isVideo) showVideo(uri, controls) else showPhoto(uri)
    }

    private fun showPhoto(uri: Uri) {
        val photo = findViewById<ImageView>(R.id.photo)
        photo.visibility = View.VISIBLE
        val maxSide = max(resources.displayMetrics.widthPixels, resources.displayMetrics.heightPixels)
        io.execute {
            val bmp = runCatching {
                ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, uri)) { decoder, info, _ ->
                    val s = info.size
                    val scale = maxSide.toFloat() / max(s.width, s.height)
                    if (scale < 1f) decoder.setTargetSize((s.width * scale).toInt(), (s.height * scale).toInt())
                }
            }.getOrNull()
            runOnUiThread { photo.setImageBitmap(bmp) }
        }
    }

    private fun showVideo(uri: Uri, controls: View) {
        video.visibility = View.VISIBLE
        controls.visibility = View.VISIBLE
        bigPlay.visibility = View.VISIBLE
        video.setAudioFocusRequest(AudioManager.AUDIOFOCUS_NONE)
        video.setVideoURI(uri)
        video.setOnPreparedListener { mp ->
            mp.isLooping = true
            video.seekTo(1)
            handler.post(tick)
        }
        val toggle = View.OnClickListener { if (video.isPlaying) pause() else play() }
        bigPlay.setOnClickListener(toggle)
        btnPlayPause.setOnClickListener(toggle)
        video.setOnClickListener(toggle)
        seek.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) {
                if (fromUser) video.seekTo(p)
            }
            override fun onStartTrackingTouch(sb: SeekBar) {}
            override fun onStopTrackingTouch(sb: SeekBar) {}
        })
    }

    private fun play() {
        video.start()
        bigPlay.animate().alpha(0f).setDuration(150).withEndAction { bigPlay.visibility = View.GONE }.start()
        btnPlayPause.setImageResource(R.drawable.ic_pause)
    }

    private fun pause() {
        video.pause()
        bigPlay.visibility = View.VISIBLE
        bigPlay.animate().alpha(1f).setDuration(150).start()
        btnPlayPause.setImageResource(R.drawable.ic_play)
    }

    override fun onPause() {
        super.onPause()
        if (::video.isInitialized && video.isPlaying) pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
        io.shutdownNow()
    }
}
