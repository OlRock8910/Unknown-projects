# Strobe Glyph

A fast, controllable flashlight strobe for Android, with light shows for the
**Glyph lights on Nothing phones**.

> **Photosensitivity warning.** Flashing lights can trigger seizures in people with
> photosensitive epilepsy. The app shows this on first launch and has a one-tap stop,
> an auto-stop timer, and stops by itself the moment you leave the app.

## Install

`apk/StrobeGlyph.apk` is ready to install. Copy it to the phone, open it, and allow
"install unknown apps" for your file manager or browser when asked. Every build is signed
with the same key, so a newer APK installs over an older one.

CI also builds it on every push (Actions, artifact **StrobeGlyph-apk**).

## What it does

**Torch.** Strobes the camera flash from 0.5 to 60 times a second, with a live speed
slider, flash-length slider and (on Android 13+ phones that support it) torch brightness.
The big read-out shows what the phone is *really* managing; if the flash hardware can't
keep up it tells you its limit instead of pretending.

| Pattern | What it does |
| --- | --- |
| Strobe | Steady on/off |
| Max | Flat out, as fast as the flash hardware accepts |
| Burst | Five quick flashes, then a pause |
| Heartbeat | Lub-dub |
| SOS / Morse | Distress signal, or flash any message in Morse code |
| Siren | Speed glides up and down |
| Chaos | Random timing |
| Beat | Flashes to the music through the microphone |

Also: tap-tempo, volume keys change the speed while flashing, an auto-stop timer
(10 s to 10 min), and a **Screen** strobe (white, red, green, blue, rainbow, police) that
covers the display; tap it to stop.

**Nothing Glyph.** Detected automatically on Phone (1), (2), (2a), (2a) Plus, (3a),
(3a) Pro, (3), (4a), (4a) Pro and (4b). The Glyph can flash in sync with the torch, or run
its own effect at its own speed and brightness: Chase, Scanner, Fill, Sparkle, Alternate
and Breathe (ripples on the Phone (3) / (4a) Pro matrix). "Test the lights" plays a short
chase so you can check it works.

### Getting the Glyph to connect

Nothing only lets apps drive the Glyph after an access switch. The app targets Android 16,
for which Nothing dropped the requirement, so on Nothing OS 4 it should connect by itself.
If the Glyph card says *access is switched off*, enable debug access once from a computer
(USB debugging on):

```
adb shell settings put global nt_glyph_interface_debug_enable 1
```

It stays on for 48 hours. The Glyph lights only work while the app is on screen, which is
a Nothing rule, not ours.

## Building

Normal build (needs JDK 17+ and the Android SDK, which Android Studio installs):

```
cd strobe-glyph
./gradlew testDebugUnitTest assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

No Android SDK, or can't reach Google's servers? `tools/build-apk-local.sh [--test]` builds
the same sources with just `javac`, `aapt`, `dx` and `apksigner` from Debian/Ubuntu packages
(see the script header). That is how `apk/StrobeGlyph.apk` was produced.

### Layout

```
app/src/main/java/com/strobeglyph/app/
  engine/   timing and patterns: pure Java, unit-tested, no Android imports
  glyph/    Glyph effects and per-phone LED maths (pure), plus GlyphLights, the only
            class that touches Nothing's SDK
  output/   torch (Camera2), microphone beat source, screen-flash interface
  ui/       the custom-drawn views
  ShowController.java   runs the timing threads and routes each step to the outputs
```

The signing key `app/strobe-sideload.jks` is deliberately public: it exists so builds from
different machines are interchangeable. Anything published to a store needs its own private
key. The Glyph SDK (`app/libs/glyph-matrix-sdk-2.0.aar`) is Nothing's, from
[Nothing-Developer-Programme/Glyph-Developer-Kit](https://github.com/Nothing-Developer-Programme/Glyph-Developer-Kit).
