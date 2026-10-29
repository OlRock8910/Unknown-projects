package com.gymcam.app

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import java.io.File
import java.io.FileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer

/** Joins CameraX's silent video with GymCam's mixed audio track. */
object Merger {

    fun copy(video: File, out: FileDescriptor) {
        FileInputStream(video).use { input -> FileOutputStream(out).use { input.copyTo(it) } }
    }

    /** [audioOffsetUs] is added to every audio timestamp so it lines up with the video. */
    fun merge(video: File, audio: File, audioOffsetUs: Long, out: FileDescriptor) {
        val rotation = MediaMetadataRetriever().run {
            try {
                setDataSource(video.path)
                extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            } finally {
                release()
            }
        }
        val muxer = MediaMuxer(out, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        val vEx = MediaExtractor()
        val aEx = MediaExtractor()
        try {
            muxer.setOrientationHint(rotation)
            vEx.setDataSource(video.path)
            val vIn = selectTrack(vEx, "video/") ?: error("no video track")
            val vOut = muxer.addTrack(vEx.getTrackFormat(vIn))

            aEx.setDataSource(audio.path)
            val aIn = selectTrack(aEx, "audio/")
            val aOut = if (aIn != null) muxer.addTrack(aEx.getTrackFormat(aIn)) else -1
            muxer.start()

            val buf = ByteBuffer.allocate(8 shl 20)
            val info = MediaCodec.BufferInfo()
            var videoDone = false
            var audioDone = aOut < 0
            var lastVideoUs = 0L

            // Audio recorded before the first video frame is dropped.
            if (!audioDone) {
                while (aEx.sampleTime >= 0 && aEx.sampleTime + audioOffsetUs < 0) aEx.advance()
                if (aEx.sampleTime < 0) audioDone = true
            }

            while (!videoDone || !audioDone) {
                val vt = if (videoDone) Long.MAX_VALUE else vEx.sampleTime
                val at = if (audioDone) Long.MAX_VALUE else aEx.sampleTime + audioOffsetUs
                if (vt <= at) {
                    val size = vEx.readSampleData(buf, 0)
                    if (size < 0) { videoDone = true; continue }
                    val key = vEx.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0
                    info.set(0, size, vt, if (key) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
                    muxer.writeSampleData(vOut, buf, info)
                    lastVideoUs = maxOf(lastVideoUs, vt)
                    vEx.advance()
                } else {
                    // Trailing audio past the end of the video is cut.
                    if (videoDone && at > lastVideoUs) { audioDone = true; continue }
                    val size = aEx.readSampleData(buf, 0)
                    if (size < 0) { audioDone = true; continue }
                    info.set(0, size, at, MediaCodec.BUFFER_FLAG_KEY_FRAME)
                    muxer.writeSampleData(aOut, buf, info)
                    aEx.advance()
                }
            }
            muxer.stop()
        } finally {
            runCatching { muxer.release() }
            vEx.release()
            aEx.release()
        }
    }

    private fun selectTrack(ex: MediaExtractor, mimePrefix: String): Int? {
        for (i in 0 until ex.trackCount) {
            val mime = ex.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith(mimePrefix)) {
                ex.selectTrack(i)
                return i
            }
        }
        return null
    }
}
