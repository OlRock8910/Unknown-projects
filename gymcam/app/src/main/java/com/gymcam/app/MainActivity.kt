package com.gymcam.app

import android.annotation.SuppressLint
import android.content.Intent
import android.content.res.ColorStateList
import android.media.AudioManager
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Size
import android.view.GestureDetector
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.OrientationEventListener
import android.view.ScaleGestureDetector
import android.view.Surface
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.MirrorMode
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {

    /** One video recording: CameraX writes silent video, AudioEngine writes the song. */
    private class Session(val dir: File, val engine: AudioEngine?) {
        val videoFile = File(dir, "video.mp4")
        val audioFile = File(dir, "audio.m4a")
        @Volatile var videoStartNanos = Long.MAX_VALUE
        @Volatile var startEventNanos = 0L
        @Volatile var warnedBlocked = false
    }

    companion object {
        /** CameraX reports durations once frames are encoded; that lags capture by roughly this much. */
        private const val VIDEO_PIPELINE_LATENCY_NS = 40_000_000L
    }

    private lateinit var prefs: Prefs
    private lateinit var audioManager: AudioManager

    private lateinit var previewView: PreviewView
    private lateinit var topArea: LinearLayout
    private lateinit var bottomArea: LinearLayout
    private lateinit var btnAudio: View
    private lateinit var icSongChip: ImageView
    private lateinit var tvAudioLabel: TextView
    private lateinit var audioPanel: View
    private lateinit var switchSong: Switch
    private lateinit var seekSong: SeekBar
    private lateinit var tvSongVol: TextView
    private lateinit var rowSongVol: View
    private lateinit var tvAudioHint: TextView
    private lateinit var timerPill: View
    private lateinit var recDot: View
    private lateinit var tvTimer: TextView
    private lateinit var btnFlash: ImageButton
    private lateinit var btnExposure: ImageButton
    private lateinit var exposureBar: View
    private lateinit var seekExposure: SeekBar
    private lateinit var tvExposure: TextView
    private lateinit var btnFlip: ImageButton
    private lateinit var shutter: ShutterButton
    private lateinit var modeSwitch: View
    private lateinit var tvModePhoto: TextView
    private lateinit var tvModeVideo: TextView
    private lateinit var libraryThumb: ImageView
    private lateinit var libraryIcon: ImageView
    private lateinit var focusRing: View
    private lateinit var tvZoom: TextView
    private lateinit var flashOverlay: View

    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var recording: Recording? = null
    private var session: Session? = null
    private var flashOn = false
    private var rotation = Surface.ROTATION_0
    private var recordAfterConsent = false
    private var updatingUi = false
    private var orientationListener: OrientationEventListener? = null

    private val eventExecutor = Executors.newSingleThreadExecutor()
    private val io = Executors.newSingleThreadExecutor()

    private val songConsent =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
            val data = res.data
            if (res.resultCode == RESULT_OK && data != null) {
                val i = Intent(this, SongCaptureService::class.java)
                    .putExtra(SongCaptureService.EXTRA_CODE, res.resultCode)
                    .putExtra(SongCaptureService.EXTRA_DATA, data)
                ContextCompat.startForegroundService(this, i)
            } else {
                recordAfterConsent = false
                prefs.songInVideo = false
                toast("Song in video needs that permission. Turned it off.")
            }
            refreshAudioUi()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        if (!prefs.onboarded || !allPermissionsGranted()) {
            startActivity(Intent(this, OnboardingActivity::class.java))
            finish()
            return
        }
        audioManager = getSystemService(AudioManager::class.java)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)
        bindViews()
        applyInsets()
        setupAudioPanel()
        setupExposure()
        setupControls()
        setupGestures()
        setupOrientation()
        cleanOldSessions()

        SongCapture.onChanged = {
            refreshAudioUi()
            if (recordAfterConsent && SongCapture.isReady) {
                recordAfterConsent = false
                startRecording()
            }
        }

        ProcessCameraProvider.getInstance(this).also { f ->
            f.addListener({
                cameraProvider = f.get()
                bindCamera()
            }, ContextCompat.getMainExecutor(this))
        }
        refreshAudioUi()
        refreshModeUi()
    }

    override fun onResume() {
        super.onResume()
        if (!::shutter.isInitialized) return
        orientationListener?.enable()
        refreshAudioUi()
        loadLatestThumb()
    }

    override fun onPause() {
        super.onPause()
        orientationListener?.disable()
    }

    override fun onStop() {
        super.onStop()
        recording?.stop()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::prefs.isInitialized && isFinishing) {
            SongCapture.onChanged = null
            SongCapture.stop(this)
        }
    }

    // ---------------------------------------------------------------- setup

    private fun bindViews() {
        previewView = findViewById(R.id.previewView)
        topArea = findViewById(R.id.topArea)
        bottomArea = findViewById(R.id.bottomArea)
        btnAudio = findViewById(R.id.btnAudio)
        icSongChip = findViewById(R.id.icSongChip)
        tvAudioLabel = findViewById(R.id.tvAudioLabel)
        audioPanel = findViewById(R.id.audioPanel)
        switchSong = findViewById(R.id.switchSong)
        seekSong = findViewById(R.id.seekSong)
        tvSongVol = findViewById(R.id.tvSongVol)
        rowSongVol = findViewById(R.id.rowSongVol)
        tvAudioHint = findViewById(R.id.tvAudioHint)
        timerPill = findViewById(R.id.timerPill)
        recDot = findViewById(R.id.recDot)
        tvTimer = findViewById(R.id.tvTimer)
        btnFlash = findViewById(R.id.btnFlash)
        btnExposure = findViewById(R.id.btnExposure)
        exposureBar = findViewById(R.id.exposureBar)
        seekExposure = findViewById(R.id.seekExposure)
        tvExposure = findViewById(R.id.tvExposure)
        btnFlip = findViewById(R.id.btnFlip)
        shutter = findViewById(R.id.shutter)
        modeSwitch = findViewById(R.id.modeSwitch)
        tvModePhoto = findViewById(R.id.tvModePhoto)
        tvModeVideo = findViewById(R.id.tvModeVideo)
        libraryThumb = findViewById(R.id.libraryThumb)
        libraryIcon = findViewById(R.id.libraryIcon)
        focusRing = findViewById(R.id.focusRing)
        tvZoom = findViewById(R.id.tvZoom)
        flashOverlay = findViewById(R.id.flashOverlay)
        libraryThumb.clipToOutline = true
        findViewById<View>(R.id.btnLibrary).clipToOutline = true
    }

    private fun applyInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root)) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            topArea.updatePadding(top = bars.top + dp(10))
            bottomArea.updatePadding(bottom = bars.bottom + dp(20))
            insets
        }
    }

    private fun setupAudioPanel() {
        btnAudio.setOnClickListener { toggleAudioPanel() }

        switchSong.setOnCheckedChangeListener { _, on ->
            if (updatingUi) return@setOnCheckedChangeListener
            prefs.songInVideo = on
            if (on && !SongCapture.isReady) requestSongConsent()
            if (!on) SongCapture.stop(this)
            refreshAudioUi()
        }

        seekSong.progress = prefs.songVolume
        seekSong.setOnSeekBarChangeListener(seekListener { p ->
            prefs.songVolume = p
            session?.engine?.songGain = p / 100f
            tvSongVol.text = "$p%"
        })
    }

    private fun seekListener(onChange: (Int) -> Unit) = object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) {
            if (fromUser) onChange(p)
        }
        override fun onStartTrackingTouch(sb: SeekBar) {}
        override fun onStopTrackingTouch(sb: SeekBar) {}
    }

    private fun setupControls() {
        shutter.setOnClickListener {
            it.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            when {
                prefs.photoMode -> takePhoto()
                recording != null -> recording?.stop()
                else -> startRecording()
            }
        }
        tvModePhoto.setOnClickListener { setPhotoMode(true) }
        tvModeVideo.setOnClickListener { setPhotoMode(false) }
        btnFlip.setOnClickListener {
            prefs.frontCamera = !prefs.frontCamera
            btnFlip.animate().rotationBy(180f).setDuration(250).start()
            bindCamera()
        }
        btnFlash.setOnClickListener {
            flashOn = !flashOn
            applyFlash()
        }
        findViewById<View>(R.id.btnLibrary).setOnClickListener {
            startActivity(Intent(this, LibraryActivity::class.java))
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupGestures() {
        val scale = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(d: ScaleGestureDetector): Boolean {
                val cam = camera ?: return false
                val z = cam.cameraInfo.zoomState.value ?: return false
                val ratio = (z.zoomRatio * d.scaleFactor).coerceIn(z.minZoomRatio, z.maxZoomRatio)
                cam.cameraControl.setZoomRatio(ratio)
                tvZoom.text = "%.1f×".format(ratio)
                tvZoom.animate().cancel()
                tvZoom.alpha = 1f
                tvZoom.animate().alpha(0f).setStartDelay(900).setDuration(300).start()
                return true
            }
        })
        val taps = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapUp(e: MotionEvent): Boolean {
                if (audioPanel.visibility == View.VISIBLE) toggleAudioPanel() else focusAt(e.x, e.y)
                return true
            }
            override fun onDoubleTap(e: MotionEvent): Boolean {
                if (recording == null) btnFlip.performClick()
                return true
            }
        })
        previewView.setOnTouchListener { _, ev ->
            scale.onTouchEvent(ev)
            if (!scale.isInProgress) taps.onTouchEvent(ev)
            true
        }
    }

    private fun setupOrientation() {
        orientationListener = object : OrientationEventListener(this) {
            override fun onOrientationChanged(o: Int) {
                if (o == ORIENTATION_UNKNOWN) return
                val r = when (o) {
                    in 45 until 135 -> Surface.ROTATION_270
                    in 135 until 225 -> Surface.ROTATION_180
                    in 225 until 315 -> Surface.ROTATION_90
                    else -> Surface.ROTATION_0
                }
                if (r == rotation) return
                rotation = r
                imageCapture?.targetRotation = r
                if (recording == null) videoCapture?.targetRotation = r
            }
        }
    }

    // ---------------------------------------------------------------- camera

    private fun bindCamera() {
        val provider = cameraProvider ?: return
        val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        val selector = if (prefs.frontCamera) CameraSelector.DEFAULT_FRONT_CAMERA
        else CameraSelector.DEFAULT_BACK_CAMERA
        provider.unbindAll()
        imageCapture = null
        videoCapture = null
        try {
            camera = if (prefs.photoMode) {
                val ic = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                    .setJpegQuality(100)
                    .setTargetRotation(rotation)
                    .build()
                imageCapture = ic
                provider.bindToLifecycle(this, selector, preview, ic)
            } else {
                // Best the camera can do: 4K, then 1080p, then 720p.
                val recorder = Recorder.Builder()
                    .setQualitySelector(
                        QualitySelector.fromOrderedList(
                            listOf(Quality.UHD, Quality.FHD, Quality.HD),
                            FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)
                        )
                    )
                    .build()
                val vc = VideoCapture.Builder(recorder)
                    .setMirrorMode(MirrorMode.MIRROR_MODE_ON_FRONT_ONLY)
                    .setTargetRotation(rotation)
                    .build()
                videoCapture = vc
                provider.bindToLifecycle(this, selector, preview, vc)
            }
        } catch (e: Exception) {
            if (prefs.frontCamera) {
                prefs.frontCamera = false
                bindCamera()
                return
            }
            toast("Couldn't open the camera.")
        }
        applyFlash()
        refreshExposure()
    }

    private fun applyFlash() {
        btnFlash.setImageResource(if (flashOn) R.drawable.ic_flash_on else R.drawable.ic_flash_off)
        btnFlash.imageTintList = ColorStateList.valueOf(
            getColor(if (flashOn) R.color.accent else R.color.text_primary)
        )
        imageCapture?.flashMode = if (flashOn) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF
        val cam = camera ?: return
        if (cam.cameraInfo.hasFlashUnit()) cam.cameraControl.enableTorch(flashOn && !prefs.photoMode)
    }

    private fun focusAt(x: Float, y: Float) {
        val cam = camera ?: return
        val point = previewView.meteringPointFactory.createPoint(x, y)
        cam.cameraControl.startFocusAndMetering(
            FocusMeteringAction.Builder(point).setAutoCancelDuration(4, TimeUnit.SECONDS).build()
        )
        focusRing.x = x - focusRing.width / 2f
        focusRing.y = y - focusRing.height / 2f
        focusRing.animate().cancel()
        focusRing.alpha = 1f
        focusRing.scaleX = 1.3f
        focusRing.scaleY = 1.3f
        focusRing.animate().scaleX(1f).scaleY(1f).setDuration(180).withEndAction {
            focusRing.animate().alpha(0f).setStartDelay(700).setDuration(300).start()
        }.start()
    }

    private fun setPhotoMode(photo: Boolean) {
        if (recording != null || prefs.photoMode == photo) return
        prefs.photoMode = photo
        refreshModeUi()
        bindCamera()
    }

    private fun refreshModeUi() {
        val photo = prefs.photoMode
        tvModePhoto.setBackgroundResource(if (photo) R.drawable.bg_segment_on else 0)
        tvModeVideo.setBackgroundResource(if (!photo) R.drawable.bg_segment_on else 0)
        tvModePhoto.alpha = if (photo) 1f else 0.7f
        tvModeVideo.alpha = if (!photo) 1f else 0.7f
        shutter.videoMode = !photo
        btnAudio.alpha = if (photo) 0.45f else 1f
        if (photo && audioPanel.visibility == View.VISIBLE) toggleAudioPanel()
    }

    // ---------------------------------------------------------------- exposure

    private fun setupExposure() {
        btnExposure.setOnClickListener {
            val show = exposureBar.visibility != View.VISIBLE
            if (show && audioPanel.visibility == View.VISIBLE) toggleAudioPanel()
            exposureBar.visibility = if (show) View.VISIBLE else View.GONE
        }
        seekExposure.setOnSeekBarChangeListener(seekListener { p ->
            val range = camera?.cameraInfo?.exposureState?.exposureCompensationRange ?: return@seekListener
            setExposure(range.lower + p)
        })
        findViewById<View>(R.id.tvExpMinus).setOnClickListener { setExposure(prefs.exposure - 1) }
        findViewById<View>(R.id.tvExpPlus).setOnClickListener { setExposure(prefs.exposure + 1) }
        tvExposure.setOnClickListener { setExposure(0) }
    }

    private fun setExposure(index: Int) {
        val state = camera?.cameraInfo?.exposureState ?: return
        if (!state.isExposureCompensationSupported) return
        val i = index.coerceIn(state.exposureCompensationRange.lower, state.exposureCompensationRange.upper)
        prefs.exposure = i
        camera?.cameraControl?.setExposureCompensationIndex(i)
        refreshExposure()
    }

    /** Re-applies the saved exposure after (re)binding and updates the bar. */
    private fun refreshExposure() {
        val state = camera?.cameraInfo?.exposureState
        if (state == null || !state.isExposureCompensationSupported) {
            btnExposure.visibility = View.GONE
            exposureBar.visibility = View.GONE
            return
        }
        btnExposure.visibility = View.VISIBLE
        val range = state.exposureCompensationRange
        val i = prefs.exposure.coerceIn(range.lower, range.upper)
        if (state.exposureCompensationIndex != i) camera?.cameraControl?.setExposureCompensationIndex(i)
        seekExposure.max = range.upper - range.lower
        seekExposure.progress = i - range.lower
        val ev = i * state.exposureCompensationStep.toFloat()
        tvExposure.text = if (i == 0) "0" else "%+.1f".format(ev)
        btnExposure.imageTintList = ColorStateList.valueOf(
            getColor(if (i != 0) R.color.accent else R.color.text_primary)
        )
    }

    // ---------------------------------------------------------------- photo

    private fun takePhoto() {
        val ic = imageCapture ?: return
        val opts = ImageCapture.OutputFileOptions.Builder(
            contentResolver,
            android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            GymMedia.photoValues()
        ).build()
        flashOverlay.alpha = 0.85f
        flashOverlay.animate().alpha(0f).setDuration(250).start()
        ic.takePicture(opts, ContextCompat.getMainExecutor(this), object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(r: ImageCapture.OutputFileResults) {
                r.savedUri?.let { showThumb(it) }
            }
            override fun onError(e: ImageCaptureException) {
                toast("Couldn't save photo.")
            }
        })
    }

    // ---------------------------------------------------------------- video

    private fun startRecording() {
        val vc = videoCapture ?: return
        val wantSong = prefs.songInVideo
        val projection = SongCapture.projection
        if (wantSong && projection == null) {
            recordAfterConsent = true
            requestSongConsent()
            return
        }
        val dir = File(cacheDir, "rec_${System.currentTimeMillis()}").apply { mkdirs() }
        // No song means a silent clip: the mic is never used.
        val engine = if (wantSong && projection != null) {
            AudioEngine(audioManager, projection, prefs.songVolume / 100f, File(dir, "audio.m4a"))
        } else null
        val s = Session(dir, engine)
        session = s
        // Audio starts first so it is already running when the first frame arrives.
        engine?.start()
        vc.targetRotation = rotation
        recording = vc.output
            .prepareRecording(this, FileOutputOptions.Builder(s.videoFile).build())
            .start(eventExecutor) { ev -> onRecordEvent(s, ev) }
        setRecordingUi(true)
    }

    private fun onRecordEvent(s: Session, ev: VideoRecordEvent) {
        val now = System.nanoTime()
        when (ev) {
            is VideoRecordEvent.Start -> s.startEventNanos = now
            is VideoRecordEvent.Status -> {
                val d = ev.recordingStats.recordedDurationNanos
                if (d > 0) s.videoStartNanos = minOf(s.videoStartNanos, now - d)
                runOnUiThread { tvTimer.text = formatDuration(d / 1_000_000) }
                checkSongBlocked(s, d)
            }
            is VideoRecordEvent.Finalize -> {
                runOnUiThread {
                    recording = null
                    setRecordingUi(false)
                }
                finishSession(s)
            }
            else -> {}
        }
    }

    private fun checkSongBlocked(s: Session, durationNs: Long) {
        val engine = s.engine ?: return
        if (s.warnedBlocked || !engine.songBlocked || durationNs < 2_000_000_000L) return
        s.warnedBlocked = true
        runOnUiThread {
            Toast.makeText(
                this,
                "Your music app (like Spotify) blocks recording, so this clip will be silent.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    /** Runs on [eventExecutor]: stop audio, merge, save to DCIM/GymCam. */
    private fun finishSession(s: Session) {
        s.engine?.stop()
        var saved: Uri? = null
        if (s.videoFile.length() > 0) {
            val uri = GymMedia.createPendingVideo(contentResolver)
            if (uri != null) {
                try {
                    contentResolver.openFileDescriptor(uri, "rw")!!.use { pfd ->
                        val engine = s.engine
                        if (engine != null && engine.wroteAudio && s.audioFile.length() > 0) {
                            val videoStart = if (s.videoStartNanos != Long.MAX_VALUE) s.videoStartNanos
                            else s.startEventNanos
                            val offsetUs = (engine.startNanos - videoStart + VIDEO_PIPELINE_LATENCY_NS) / 1000
                            Merger.merge(s.videoFile, s.audioFile, offsetUs, pfd.fileDescriptor)
                        } else {
                            Merger.copy(s.videoFile, pfd.fileDescriptor)
                        }
                    }
                    GymMedia.publish(contentResolver, uri)
                    saved = uri
                } catch (e: Exception) {
                    android.util.Log.e("GymCam", "save failed", e)
                    runCatching { contentResolver.delete(uri, null, null) }
                }
            }
        }
        s.dir.deleteRecursively()
        runOnUiThread {
            if (session === s) session = null
            if (saved != null) showThumb(saved) else toast("Couldn't save that video.")
        }
    }

    private fun setRecordingUi(on: Boolean) {
        shutter.recording = on
        timerPill.visibility = if (on) View.VISIBLE else View.GONE
        // Keep the audio pill to just its icon so it doesn't run into the timer.
        tvAudioLabel.visibility = if (on) View.GONE else View.VISIBLE
        if (on && audioPanel.visibility == View.VISIBLE) toggleAudioPanel()
        if (on) {
            tvTimer.text = "0:00"
            recDot.animate().alpha(0.2f).setDuration(600).withEndAction(blink).start()
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            recDot.animate().cancel()
            recDot.alpha = 1f
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        val fade = if (on) 0f else 1f
        modeSwitch.animate().alpha(fade).setDuration(150).start()
        btnFlip.animate().alpha(fade).setDuration(150).start()
        modeSwitch.isEnabled = !on
        btnFlip.isEnabled = !on
        tvModePhoto.isEnabled = !on
        tvModeVideo.isEnabled = !on
        refreshAudioUi()
    }

    private val blink: Runnable = object : Runnable {
        override fun run() {
            if (recording == null) return
            val target = if (recDot.alpha < 0.5f) 1f else 0.2f
            recDot.animate().alpha(target).setDuration(600).withEndAction(this).start()
        }
    }

    private fun cleanOldSessions() {
        io.execute {
            cacheDir.listFiles { f -> f.isDirectory && f.name.startsWith("rec_") }
                ?.forEach { it.deleteRecursively() }
        }
    }

    // ---------------------------------------------------------------- audio settings

    private fun requestSongConsent() {
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val intent = if (Build.VERSION.SDK_INT >= 34) {
            mpm.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
        } else {
            mpm.createScreenCaptureIntent()
        }
        toast("Android will ask to record your screen. GymCam only keeps the song.")
        songConsent.launch(intent)
    }

    private fun toggleAudioPanel() {
        if (prefs.photoMode) {
            toast("Audio settings are for video. Switch to VIDEO.")
            return
        }
        val show = audioPanel.visibility != View.VISIBLE
        if (show) {
            exposureBar.visibility = View.GONE
            audioPanel.visibility = View.VISIBLE
            audioPanel.alpha = 0f
            audioPanel.translationY = -dp(12).toFloat()
            audioPanel.animate().alpha(1f).translationY(0f).setDuration(180).start()
        } else {
            audioPanel.animate().alpha(0f).translationY(-dp(12).toFloat()).setDuration(150)
                .withEndAction { audioPanel.visibility = View.GONE }.start()
        }
    }

    private fun refreshAudioUi() {
        if (!::switchSong.isInitialized) return
        val song = prefs.songInVideo
        updatingUi = true
        switchSong.isChecked = song
        updatingUi = false

        // The song can't be switched on/off mid-clip, but its volume is live.
        switchSong.isEnabled = recording == null
        rowSongVol.alpha = if (song) 1f else 0.35f
        seekSong.isEnabled = song
        tvSongVol.text = "${prefs.songVolume}%"

        icSongChip.imageTintList = ColorStateList.valueOf(if (song) getColor(R.color.accent) else 0x55FFFFFF)
        tvAudioLabel.text = if (song) "Song" else "Silent"

        tvAudioHint.text = when {
            !song -> "Video will be silent. Your music still keeps playing."
            SongCapture.isReady -> "Your song goes straight into the clip. GymCam never records your voice.\n" +
                "Spotify blocks this, so with Spotify the clip will be silent."
            else -> "Android will ask once when you hit record. GymCam never records your voice.\n" +
                "Spotify blocks this, so with Spotify the clip will be silent."
        }
    }

    // ---------------------------------------------------------------- library thumb

    private fun loadLatestThumb() {
        io.execute {
            val item = GymMedia.query(this, limit = 1).firstOrNull()
            val bmp = item?.let {
                runCatching { contentResolver.loadThumbnail(it.uri, Size(240, 240), null) }.getOrNull()
            }
            runOnUiThread { setThumb(bmp) }
        }
    }

    private fun showThumb(uri: Uri) {
        io.execute {
            val bmp = runCatching { contentResolver.loadThumbnail(uri, Size(240, 240), null) }.getOrNull()
            runOnUiThread {
                setThumb(bmp)
                libraryThumb.scaleX = 0.6f
                libraryThumb.scaleY = 0.6f
                libraryThumb.animate().scaleX(1f).scaleY(1f).setDuration(220).start()
            }
        }
    }

    private fun setThumb(bmp: android.graphics.Bitmap?) {
        libraryThumb.setImageBitmap(bmp)
        libraryIcon.visibility = if (bmp == null) View.VISIBLE else View.GONE
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
