#!/usr/bin/env bash
# Builds a signed, installable APK straight from web/ and android/, without
# Gradle or the full Android SDK. Needs: aapt2, javac (JDK 8+), dx
# (dalvik-exchange), zipalign, apksigner and an android.jar.
#
# On Ubuntu/Debian:
#   sudo apt-get install aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 default-jdk-headless zip
#
#   ./build-apk.sh            → build/LingoPeak.apk
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:-$HERE/build}
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
DX=${DX:-$(command -v dalvik-exchange || command -v dx)}
VERSION_NAME=${VERSION_NAME:-2.1}
# The version code is minutes since 2020 at the last commit, so every newer
# build installs over an older one, whichever repository it was built in.
COMMIT_TIME=$(git -C "$HERE" log -1 --format=%ct 2>/dev/null || date +%s)
VERSION_CODE=${VERSION_CODE:-$(( (COMMIT_TIME - 1577836800) / 60 ))}

KEYSTORE="$HERE/android/adjetivos-sideload.jks"
KS_PASS=adjetivos
KS_ALIAS=adjetivos

for tool in aapt2 javac zipalign apksigner zip; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done
[ -n "$DX" ] || { echo "missing tool: dx / dalvik-exchange" >&2; exit 1; }
[ -f "$ANDROID_JAR" ] || { echo "android.jar not found at $ANDROID_JAR (set ANDROID_JAR)" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"
# The app's files, minus the link-preview picture that only the website needs.
cp -r "$HERE/web" "$OUT/assets"
rm -f "$OUT/assets/og-image.png"

echo "› resources"
aapt2 compile --dir "$HERE/android/res" -o "$OUT/res.zip"
aapt2 link \
  -o "$OUT/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$HERE/android/AndroidManifest.xml" \
  -A "$OUT/assets" \
  --min-sdk-version 21 \
  --target-sdk-version 36 \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  --java "$OUT/gen" \
  "$OUT/res.zip"

echo "› java"
# -source/-target 8 keeps the bytecode in the range dx understands.
javac -nowarn -Xlint:-options -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" \
  -d "$OUT/classes" \
  $(find "$HERE/android/src" "$OUT/gen" -name '*.java')

echo "› dex"
"$DX" --dex --min-sdk-version=21 --output="$OUT/dex/classes.dex" "$OUT/classes"

echo "› package"
cp "$OUT/base.apk" "$OUT/unaligned.apk"
(cd "$OUT/dex" && zip -q -j "$OUT/unaligned.apk" classes.dex)
zipalign -f -p 4 "$OUT/unaligned.apk" "$OUT/aligned.apk"

echo "› sign"
apksigner sign \
  --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias "$KS_ALIAS" \
  --out "$OUT/LingoPeak.apk" "$OUT/aligned.apk"
apksigner verify "$OUT/LingoPeak.apk"

echo "✓ $OUT/LingoPeak.apk (version $VERSION_NAME, code $VERSION_CODE, $(du -h "$OUT/LingoPeak.apk" | cut -f1))"
