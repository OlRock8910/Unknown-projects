package com.gymcam.app

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.AudioTimestamp
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.projection.MediaProjection
import android.util.Log
import java.io.File
import java.nio.ByteOrder
import kotlin.concurrent.thread
import kotlin.math.abs

/**
 * Records the song other apps are playing (through AudioPlaybackCapture) and encodes it
 * as AAC into [outFile]. The microphone is never used, so your voice is never recorded.
 *
 * Nothing here requests audio focus, which is the whole point: the music app is never
 * told to pause.
 */
class AudioEngine(
    private val audioManager: AudioManager,
    private val projection: MediaProjection,
    songGain: Float,
    private val outFile: File,
) {
    companion object {
        const val RATE = 48_000
        const val CHANNELS = 2
        private const val TAG = "GymCamAudio"
    }

    @Volatile var songGain = songGain

    /** CLOCK_MONOTONIC time of audio frame 0. */
    @Volatile var startNanos = 0L
        private set

    /** Loudest song sample so far. Stays 0 when the music app blocks capture. */
    @Volatile var songPeak = 0
        private set

    @Volatile var wroteAudio = false
        private set

    /** Music was playing but capture stayed silent: the music app opts out (e.g. Spotify). */
    @Volatile var songBlocked = false
        private set

    @Volatile private var running = false
    private var worker: Thread? = null

    private lateinit var codec: MediaCodec
    private var muxer: MediaMuxer? = null
    private var track = -1
    private var muxerStarted = false
    private val info = MediaCodec.BufferInfo()

    fun start() {
        running = true
        worker = thread(name = TAG) { runLoop() }
    }

    fun stop() {
        running = false
        worker?.join(5000)
        worker = null
    }

    @SuppressLint("MissingPermission")
    private fun runLoop() {
        val chunk = RATE / 50 // 20 ms
        var song: AudioRecord? = null
        var codecReady = false
        try {
            val config = AudioPlaybackCaptureConfiguration.Builder(projection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build()
            song = AudioRecord.Builder()
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(RATE)
                        .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                        .build()
                )
                .setBufferSizeInBytes(RATE * CHANNELS * 2)
                .setAudioPlaybackCaptureConfig(config)
                .build()
            if (song.state != AudioRecord.STATE_INITIALIZED) return

            setupEncoder()
            codecReady = true
            song.startRecording()

            val pcm = ShortArray(chunk * CHANNELS)
            var frames = 0L
            var blockChecked = false

            while (running) {
                var got = 0
                while (got < pcm.size) {
                    val n = song.read(pcm, got, pcm.size - got, AudioRecord.READ_BLOCKING)
                    if (n <= 0) break
                    got += n
                }
                if (got < pcm.size) pcm.fill(0, got, pcm.size)
                if (startNanos == 0L) startNanos = frameZeroTime(song, frames + chunk)

                val g = songGain
                var peak = songPeak
                for (i in pcm.indices) {
                    val v = pcm[i]
                    val a = abs(v.toInt())
                    if (a > peak) peak = a
                    pcm[i] = (v * g).coerceIn(-32768f, 32767f).toInt().toShort()
                }
                songPeak = peak
                encode(pcm, frames, false)
                frames += chunk

                // Some music apps (Spotify) block capture, so all we get is silence.
                if (!blockChecked && frames >= RATE * 3 / 2) {
                    blockChecked = true
                    if (songPeak == 0 && audioManager.isMusicActive) {
                        songBlocked = true
                        Log.i(TAG, "song capture blocked by the music app")
                    }
                }
            }
            encode(ShortArray(0), frames, true)
            drain(true)
            Log.i(TAG, "done: ${frames / RATE}s songPeak=$songPeak blocked=$songBlocked")
        } catch (e: Exception) {
            Log.e(TAG, "audio engine failed", e)
        } finally {
            runCatching { song?.stop() }
            song?.release()
            if (codecReady) {
                runCatching { codec.stop() }
                codec.release()
            }
            runCatching { if (muxerStarted) muxer?.stop() }
            runCatching { muxer?.release() }
        }
    }

    private fun setupEncoder() {
        val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, RATE, CHANNELS).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, 192_000)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, RATE / 50 * CHANNELS * 2 * 2)
        }
        codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()
        muxer = MediaMuxer(outFile.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    }

    private fun encode(pcm: ShortArray, frameIndex: Long, eos: Boolean) {
        var offset = 0
        var frame = frameIndex
        do {
            val idx = codec.dequeueInputBuffer(10_000)
            if (idx < 0) {
                drain(false)
                continue
            }
            val buf = codec.getInputBuffer(idx)!!
            buf.clear()
            val shorts = minOf(pcm.size - offset, buf.capacity() / 2 / CHANNELS * CHANNELS)
            buf.order(ByteOrder.nativeOrder()).asShortBuffer().put(pcm, offset, shorts)
            val last = offset + shorts >= pcm.size
            val flags = if (eos && last) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0
            codec.queueInputBuffer(idx, 0, shorts * 2, frame * 1_000_000L / RATE, flags)
            offset += shorts
            frame += shorts / CHANNELS
            drain(false)
        } while (offset < pcm.size)
    }

    private fun drain(untilEos: Boolean) {
        var idleTries = 0
        while (true) {
            val idx = codec.dequeueOutputBuffer(info, if (untilEos) 10_000 else 0)
            when {
                idx == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!untilEos || ++idleTries > 200) return
                }
                idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    val m = muxer ?: return
                    track = m.addTrack(codec.outputFormat)
                    m.start()
                    muxerStarted = true
                }
                idx >= 0 -> {
                    val out = codec.getOutputBuffer(idx)!!
                    if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
                    if (info.size > 0 && muxerStarted) {
                        out.position(info.offset)
                        out.limit(info.offset + info.size)
                        muxer!!.writeSampleData(track, out, info)
                        wroteAudio = true
                    }
                    codec.releaseOutputBuffer(idx, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
            }
        }
    }

    private fun frameZeroTime(rec: AudioRecord, framesRead: Long): Long {
        val ts = AudioTimestamp()
        if (rec.getTimestamp(ts, AudioTimestamp.TIMEBASE_MONOTONIC) == AudioRecord.SUCCESS) {
            return ts.nanoTime - ts.framePosition * 1_000_000_000L / RATE
        }
        return System.nanoTime() - framesRead * 1_000_000_000L / RATE
    }
}
