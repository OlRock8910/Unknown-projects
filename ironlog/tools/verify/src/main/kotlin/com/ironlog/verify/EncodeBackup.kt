package com.ironlog.verify

import com.ironlog.domain.AppData
import com.ironlog.domain.AppJson
import com.ironlog.domain.BackupCodec
import com.ironlog.domain.exercise
import java.io.File

/**
 * Turns an AppData JSON file into an IRON1- backup code using the app's own codec, then
 * decodes it again to prove it restores. Used to hand someone a ready-made code for
 * their program:  gradle encodeBackup -Pjson=/path/to/data.json
 */
fun main(args: Array<String>) {
    val path = args.firstOrNull() ?: error("usage: EncodeBackup <data.json> [out.txt]")
    val data = AppJson.decodeFromString(AppData.serializer(), File(path).readText())
    val unknown = (data.workouts.flatMap { it.exerciseIds } + data.sessions.flatMap { s -> s.entries.map { it.exerciseId } })
        .distinct().filter { data.exercise(it).name == "Unknown exercise" }
    require(unknown.isEmpty()) { "exercise ids not in the library or customExercises: $unknown" }
    val code = BackupCodec.encode(data)
    val back = (BackupCodec.decode(code) as? BackupCodec.Result.Ok)?.data ?: error("round trip failed")
    require(back == data) { "decoded data differs from input" }
    args.getOrNull(1)?.let { File(it).writeText(code) }
    println("workouts=${data.workouts.size} sessions=${data.sessions.size} notes=${data.notes.size} customExercises=${data.customExercises.size} chars=${code.length}")
    println(code)
}
