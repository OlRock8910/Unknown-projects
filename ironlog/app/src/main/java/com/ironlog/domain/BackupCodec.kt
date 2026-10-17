package com.ironlog.domain

import kotlinx.serialization.json.Json
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.Base64
import java.util.zip.CRC32
import java.util.zip.Deflater
import java.util.zip.Inflater
import kotlin.random.Random

val AppJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = false
    explicitNulls = false
    coerceInputValues = true
}

/**
 * The backup code: all app data as one line of text that can be copied, pasted into a
 * note or a message, and pasted back after reinstalling.
 *
 *   IRON1-<base64url( nonce[4] | scrambled( deflate(json) ) | crc32(json bytes)[4] )>
 *
 * The scramble is an xorshift keystream seeded from the nonce, so the code is unreadable
 * at a glance and two exports of the same data look different. It is not encryption
 * with a password — anyone with this app can open it — and the app says so. The CRC
 * catches a code that was cut short or mangled while being copied.
 */
object BackupCodec {
    const val PREFIX = "IRON1-"
    private const val KEY = 0x1A0B7EED

    fun encode(data: AppData, random: Random = Random.Default): String =
        encodeJson(AppJson.encodeToString(AppData.serializer(), data), random.nextInt())

    fun encodeJson(json: String, nonce: Int): String {
        val plain = json.toByteArray(Charsets.UTF_8)
        val packed = deflate(plain)
        scramble(packed, nonce)
        val crc = CRC32().apply { update(plain) }.value.toInt()
        val buf = ByteBuffer.allocate(4 + packed.size + 4)
        buf.putInt(nonce).put(packed).putInt(crc)
        return PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(buf.array())
    }

    sealed class Result {
        data class Ok(val data: AppData) : Result()
        data class Error(val message: String) : Result()
    }

    fun decode(code: String): Result {
        val json = try {
            decodeJson(code)
        } catch (e: BadCode) {
            return Result.Error(e.message ?: "That code didn't work.")
        }
        return try {
            Result.Ok(AppJson.decodeFromString(AppData.serializer(), json))
        } catch (e: Exception) {
            Result.Error("The code opened, but the data inside doesn't look like IronLog data.")
        }
    }

    class BadCode(message: String) : Exception(message)

    /** The JSON inside a code. Throws [BadCode] with a message fit to show the user. */
    fun decodeJson(code: String): String {
        val cleaned = code.filterNot { it.isWhitespace() }
        val start = cleaned.indexOf(PREFIX)
        if (start < 0) throw BadCode("That isn't an IronLog backup code. It should start with $PREFIX")
        val body = cleaned.substring(start + PREFIX.length).takeWhile { it.isLetterOrDigit() || it == '-' || it == '_' }
        val bytes = try {
            Base64.getUrlDecoder().decode(body)
        } catch (e: IllegalArgumentException) {
            throw BadCode("The code has characters that don't belong in it. Copy it again, all of it.")
        }
        if (bytes.size < 9) throw BadCode("The code is too short — part of it is missing.")
        val buf = ByteBuffer.wrap(bytes)
        val nonce = buf.int
        val packed = ByteArray(bytes.size - 8).also { buf.get(it) }
        val crc = buf.int
        scramble(packed, nonce)
        val damaged = "The code is damaged or incomplete. Copy the whole thing and try again."
        val plain = try {
            inflate(packed)
        } catch (e: Exception) {
            throw BadCode(damaged)
        }
        if (CRC32().apply { update(plain) }.value.toInt() != crc) throw BadCode(damaged)
        return String(plain, Charsets.UTF_8)
    }

    private fun scramble(bytes: ByteArray, nonce: Int) {
        var x = (nonce xor KEY).let { if (it == 0) KEY else it }
        for (i in bytes.indices) {
            x = x xor (x shl 13)
            x = x xor (x ushr 17)
            x = x xor (x shl 5)
            bytes[i] = (bytes[i].toInt() xor (x and 0xFF)).toByte()
        }
    }

    private fun deflate(input: ByteArray): ByteArray {
        val d = Deflater(Deflater.BEST_COMPRESSION)
        d.setInput(input)
        d.finish()
        val out = ByteArrayOutputStream()
        val chunk = ByteArray(8192)
        while (!d.finished()) out.write(chunk, 0, d.deflate(chunk))
        d.end()
        return out.toByteArray()
    }

    private fun inflate(input: ByteArray): ByteArray {
        val inf = Inflater()
        inf.setInput(input)
        val out = ByteArrayOutputStream()
        val chunk = ByteArray(8192)
        var guard = 0
        while (!inf.finished()) {
            val n = inf.inflate(chunk)
            if (n == 0 && (inf.needsInput() || inf.needsDictionary())) {
                inf.end()
                throw IllegalStateException("truncated")
            }
            out.write(chunk, 0, n)
            if (++guard > 1_000_000) throw IllegalStateException("too large")
        }
        inf.end()
        return out.toByteArray()
    }
}
