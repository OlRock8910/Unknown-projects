#!/usr/bin/env bash
# Builds a signed, installable APK straight from web/ and android/, without
# Gradle or the full Android SDK. Needs: aapt2, javac (JDK 8+), dx
# (dalvik-exchange), zipalign, apksigner and an API 34 android.jar (found or
# downloaded, see below).
#
# On Ubuntu/Debian:
#   sudo apt-get install aapt dalvik-exchange zipalign apksigner default-jdk-headless zip
#
#   ./build-apk.sh            → build/Globetrot.apk
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:-$HERE/build}
DX=${DX:-$(command -v dalvik-exchange || command -v dx)}
VERSION_NAME=${VERSION_NAME:-1.2}
# The version code is minutes since 2020 at the last commit, so every newer
# build installs over an older one, whichever repository it was built in.
COMMIT_TIME=$(git -C "$HERE" log -1 --format=%ct 2>/dev/null || date +%s)
VERSION_CODE=${VERSION_CODE:-$(( (COMMIT_TIME - 1577836800) / 60 ))}

KEYSTORE="$HERE/android/globetrot-sideload.jks"
KS_PASS=globetrot
KS_ALIAS=globetrot

# Walk recording needs Android 14's manifest attributes, so this builds against
# API 34: the SDK's copy if there is one, otherwise a cached download checked
# against a known hash.
JAR_URL=https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
JAR_SHA256=6cea1df3efb77103ac3e2beb9bf4718964b0e0869ab16d39d29d5cbae1c147ad
if [ -z "${ANDROID_JAR:-}" ]; then
  for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}"; do
    if [ -n "$sdk" ] && [ -f "$sdk/platforms/android-34/android.jar" ]; then ANDROID_JAR="$sdk/platforms/android-34/android.jar"; break; fi
  done
fi
if [ -z "${ANDROID_JAR:-}" ]; then
  ANDROID_JAR="${XDG_CACHE_HOME:-$HOME/.cache}/globetrot/android-34.jar"
  if [ ! -f "$ANDROID_JAR" ]; then
    echo "› downloading android-34 android.jar"
    mkdir -p "$(dirname "$ANDROID_JAR")"
    curl -sSfL -o "$ANDROID_JAR.part" "$JAR_URL"
    echo "$JAR_SHA256  $ANDROID_JAR.part" | sha256sum -c --quiet
    mv "$ANDROID_JAR.part" "$ANDROID_JAR"
  fi
fi

for tool in aapt2 javac zipalign apksigner zip; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done
[ -n "$DX" ] || { echo "missing tool: dx / dalvik-exchange" >&2; exit 1; }
[ -f "$ANDROID_JAR" ] || { echo "android.jar not found at $ANDROID_JAR (set ANDROID_JAR)" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"
cp -r "$HERE/web" "$OUT/assets"

echo "› resources"
aapt2 compile --dir "$HERE/android/res" -o "$OUT/res.zip"
aapt2 link \
  -o "$OUT/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$HERE/android/AndroidManifest.xml" \
  -A "$OUT/assets" \
  --min-sdk-version 21 \
  --target-sdk-version 34 \
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
  --out "$OUT/Globetrot.apk" "$OUT/aligned.apk"
apksigner verify "$OUT/Globetrot.apk"

echo "✓ $OUT/Globetrot.apk (version $VERSION_NAME, code $VERSION_CODE, $(du -h "$OUT/Globetrot.apk" | cut -f1))"
