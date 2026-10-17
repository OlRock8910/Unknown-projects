// Local verification for the parts of IronLog that do not need the Android SDK.
//
// The app module needs Google's Maven repository and the Android SDK. This project
// needs neither: it compiles the app's pure-Kotlin domain code and its Compose UI
// against Compose for Desktop (published to Maven Central), runs the unit tests, and
// can render screens to PNG for a visual check. Android-only files (activity,
// receivers, widgets, platform glue) live under com/ironlog/android and are left out;
// src/shim supplies desktop stand-ins for the few platform hooks the UI calls.
plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.serialization") version "2.0.21"
    kotlin("plugin.compose") version "2.0.21"
}

val cmp = "1.5.12"
dependencies {
    implementation("org.jetbrains.compose.ui:ui-desktop:$cmp")
    implementation("org.jetbrains.compose.foundation:foundation-desktop:$cmp")
    implementation("org.jetbrains.compose.material3:material3-desktop:$cmp")
    implementation("org.jetbrains.skiko:skiko-awt-runtime-linux-x64:0.7.85.4")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.8.1")
    testImplementation(kotlin("test"))
    testImplementation("junit:junit:4.13.2")
}

kotlin { jvmToolchain(21) }

val appSrc = file("../../app/src/main/java")

sourceSets {
    main {
        kotlin {
            srcDir(appSrc)
            srcDir("src/shim/kotlin")
            exclude("com/ironlog/android/**")
            exclude("com/ironlog/ui/platform/Platform.android.kt")
        }
    }
    // The same unit tests CI runs in the app module.
    test {
        kotlin { srcDir("../../app/src/test/java") }
    }
}

tasks.register<JavaExec>("screenshots") {
    description = "Renders every screen to build/screens/*.png"
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("com.ironlog.verify.ScreenshotsKt")
    workingDir = projectDir
    systemProperty("ironlog.data", project.findProperty("data")?.toString() ?: "")
}

tasks.register<JavaExec>("encodeBackup") {
    description = "Encodes an AppData JSON file as an IRON1- backup code: -Pjson=path [-Pout=path]"
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("com.ironlog.verify.EncodeBackupKt")
    args = listOfNotNull(project.findProperty("json")?.toString(), project.findProperty("out")?.toString())
}
