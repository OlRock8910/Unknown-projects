#!/usr/bin/env bash
#
# Builds a signed Strobe Glyph APK WITHOUT Gradle or the Android SDK.
#
# This is the fallback for machines that cannot reach Google's Maven repository or
# dl.google.com (so Android Gradle Plugin cannot run). The normal build is
# `./gradlew assembleRelease`; both produce an equivalent app from the same sources.
#
# It needs a Debian/Ubuntu-style box with:
#   sudo apt-get install default-jdk-headless aapt apksigner zipalign dalvik-exchange \
#                        android-sdk-platform-23 unzip zip curl
#
# Usage:  tools/build-apk-local.sh [--test]     (--test also runs the unit tests first)
# Output: build-local/StrobeGlyph.apk
#
# Limits, compared with Gradle: no R8/D8 (so no lambdas or other Java 8 language
# features that need desugaring; the script checks for them), and resources are linked
# against API 23 with the old aapt, so a few manifest attributes newer than that are
# stripped from the copy of the manifest it packages.
set -euo pipefail

HERE=$(cd "$(dirname "$0")/.." && pwd)
APP=$HERE/app
SRC=$APP/src/main
OUT=${OUT:-$HERE/build-local}
CACHE=${CACHE:-$HOME/.cache/strobe-glyph}
ANDROID_ALL=android-all-16-robolectric-13921718.jar
MAVEN=https://repo1.maven.org/maven2
PLATFORM_JAR=${PLATFORM_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
AAR=$APP/libs/glyph-matrix-sdk-2.0.aar

need() { command -v "$1" >/dev/null || { echo "missing tool: $1 (see the header of this script)" >&2; exit 1; }; }
for t in javac javap keytool aapt apksigner zipalign dalvik-exchange unzip zip curl; do need "$t"; done
[ -f "$PLATFORM_JAR" ] || { echo "missing $PLATFORM_JAR (apt: android-sdk-platform-23)" >&2; exit 1; }

fetch() { # fetch <maven path> <file name>
  [ -f "$CACHE/$2" ] || { mkdir -p "$CACHE"; echo "downloading $2"; curl -fsSL "$MAVEN/$1" -o "$CACHE/$2.part" && mv "$CACHE/$2.part" "$CACHE/$2"; }
}
fetch "org/robolectric/android-all/16-robolectric-13921718/$ANDROID_ALL" "$ANDROID_ALL"

# Read the version and signing details from the Gradle file so the two builds cannot drift apart.
gradle_value() { sed -nE "s/^[[:space:]]*$1[[:space:]]+'?([^'[:space:]]+)'?.*/\1/p" "$APP/build.gradle" | head -1; }
VERSION_CODE=$(gradle_value versionCode)
VERSION_NAME=$(gradle_value versionName)
MIN_SDK=$(gradle_value minSdk)
TARGET_SDK=$(gradle_value targetSdk)
NAMESPACE=$(gradle_value namespace)
STORE_PASS=$(gradle_value storePassword)
KEY_ALIAS=$(gradle_value keyAlias)
KEY_PASS=$(gradle_value keyPassword)

rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/glyph"

# The Glyph SDK ships as an AAR; the code is the classes.jar inside. Its text-rendering helpers
# (Kotlin) are not used here and would drag in a Kotlin runtime, so leave them out.
unzip -q -o "$AAR" classes.jar -d "$OUT/glyph"
zip -q -d "$OUT/glyph/classes.jar" 'com/nothinglondon/*' || true
GLYPH_JAR=$OUT/glyph/classes.jar

echo "== compiling"
find "$SRC/java" -name '*.java' > "$OUT/sources.txt"
javac -nowarn -source 8 -target 8 -Xlint:-options -encoding UTF-8 \
  -cp "$CACHE/$ANDROID_ALL:$GLYPH_JAR" -d "$OUT/classes" @"$OUT/sources.txt" 2>&1 \
  | grep -v -E '^Picked up|UnsupportedAppUsage|^[0-9]+ warnings?$' || true
[ -f "$OUT/classes/${NAMESPACE//.//}/MainActivity.class" ] || { echo "compile failed" >&2; exit 1; }

# dx (the old dexer) cannot desugar lambdas; Gradle's D8 can. Keep the source free of them
# so both toolchains produce the same app.
if find "$OUT/classes" -name '*.class' -print0 | xargs -0 javap -c -p 2>/dev/null | grep -q invokedynamic; then
  echo "error: the code uses lambdas/method references (invokedynamic); use anonymous classes" >&2
  exit 1
fi

if [ "${1:-}" = "--test" ]; then
  echo "== unit tests"
  fetch "junit/junit/4.13.2/junit-4.13.2.jar" junit-4.13.2.jar
  fetch "org/hamcrest/hamcrest-core/1.3/hamcrest-core-1.3.jar" hamcrest-core-1.3.jar
  mkdir -p "$OUT/test-classes"
  TEST_CP=$OUT/classes:$CACHE/junit-4.13.2.jar:$CACHE/hamcrest-core-1.3.jar
  find "$APP/src/test/java" -name '*.java' > "$OUT/test-sources.txt"
  javac -nowarn -source 8 -target 8 -Xlint:-options -cp "$TEST_CP" -d "$OUT/test-classes" @"$OUT/test-sources.txt" 2>&1 \
    | grep -v -E '^Picked up|^[0-9]+ warnings?$' || true
  TESTS=$(cd "$OUT/test-classes" && find . -name '*Test.class' | sed 's|^\./||; s|\.class$||; s|/|.|g')
  # shellcheck disable=SC2086
  java -cp "$TEST_CP:$OUT/test-classes" org.junit.runner.JUnitCore $TESTS 2>&1 | grep -v '^Picked up'
fi

echo "== dexing"
mkdir -p "$OUT/dex"
dalvik-exchange --dex --min-sdk-version="$MIN_SDK" --output="$OUT/dex/classes.dex" "$OUT/classes" "$GLYPH_JAR" 2>&1 \
  | grep -v '^Picked up' || true
[ -f "$OUT/dex/classes.dex" ] || { echo "dexing failed" >&2; exit 1; }

echo "== packaging"
# aapt (v1) wants a package name in the manifest and does not know newer attributes. Gradle
# gets both from build.gradle / the real SDK; here we patch a copy.
python3 - "$SRC/AndroidManifest.xml" "$OUT/AndroidManifest.xml" "$NAMESPACE" <<'EOF'
import re, sys
src, dst, package = sys.argv[1:4]
s = open(src).read()
s = re.sub(r'\s+xmlns:tools="[^"]*"', '', s)        # tools: attributes are for Gradle's merger
s = re.sub(r'^.*tools:overrideLibrary.*\n', '', s, flags=re.M)
s = re.sub(r'\s+android:roundIcon="[^"]*"', '', s)   # API 25; unknown to the API 23 aapt
s = s.replace('|density', '')                        # configChanges flag from API 24
s = s.replace('<manifest ', '<manifest package="%s" ' % package, 1)
open(dst, 'w').write(s)
EOF
aapt package -f -M "$OUT/AndroidManifest.xml" -S "$SRC/res" -I "$PLATFORM_JAR" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  -F "$OUT/unsigned.apk"
cp "$OUT/dex/classes.dex" "$OUT/classes.dex"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "== signing"
apksigner sign --ks "$APP/strobe-sideload.jks" --ks-pass "pass:$STORE_PASS" \
  --ks-key-alias "$KEY_ALIAS" --key-pass "pass:$KEY_PASS" \
  --min-sdk-version "$MIN_SDK" --out "$OUT/StrobeGlyph.apk" "$OUT/aligned.apk" 2>&1 | grep -v '^Picked up' || true
apksigner verify --verbose --min-sdk-version "$MIN_SDK" "$OUT/StrobeGlyph.apk" 2>&1 | grep -v '^Picked up' | head -4

echo "== result"
aapt dump badging "$OUT/StrobeGlyph.apk" | grep -E "^(package|sdkVersion|targetSdkVersion|application-label:)" || true
ls -l "$OUT/StrobeGlyph.apk"
