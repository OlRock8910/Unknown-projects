#!/usr/bin/env bash
# Builds the Google Play upload file (an Android App Bundle, .aab) from web/
# and android/, the same way build-apk.sh builds the sideload APK, but:
#   - package name com.olrock.lingopeak (the APK keeps com.olrock.adjetivos),
#   - resources in the bundle's protobuf format,
#   - signed with the Play *upload* key (kept out of this repository).
#
#   UPLOAD_KS=~/lingopeak-upload.jks UPLOAD_KS_PASS=... BUNDLETOOL=bundletool.jar ./build-aab.sh
#   → build-aab/LingoPeak.aab
#
# Needs what build-apk.sh needs, plus Google's bundletool jar and jarsigner.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:-$HERE/build-aab}
APP_ID=${APP_ID:-com.olrock.lingopeak}
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
DX=${DX:-$(command -v dalvik-exchange || command -v dx)}
BUNDLETOOL=${BUNDLETOOL:-$HOME/.cache/lingopeak-tools/bundletool.jar}
UPLOAD_KS=${UPLOAD_KS:-$HOME/.lingopeak/upload.jks}
UPLOAD_ALIAS=${UPLOAD_ALIAS:-upload}
: "${UPLOAD_KS_PASS:?set UPLOAD_KS_PASS to the password of the upload key}"
VERSION_NAME=${VERSION_NAME:-2.1}
COMMIT_TIME=$(git -C "$HERE" log -1 --format=%ct 2>/dev/null || date +%s)
VERSION_CODE=${VERSION_CODE:-$(( (COMMIT_TIME - 1577836800) / 60 ))}

for tool in aapt2 javac jarsigner java zip unzip; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done
[ -n "$DX" ] || { echo "missing tool: dx / dalvik-exchange" >&2; exit 1; }
[ -f "$BUNDLETOOL" ] || { echo "bundletool jar not found at $BUNDLETOOL (set BUNDLETOOL)" >&2; exit 1; }
[ -f "$UPLOAD_KS" ] || { echo "upload keystore not found at $UPLOAD_KS (set UPLOAD_KS)" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/base/manifest" "$OUT/base/dex"
cp -r "$HERE/web" "$OUT/assets"
rm -f "$OUT/assets/og-image.png"

echo "› resources (protobuf)"
aapt2 compile --dir "$HERE/android/res" -o "$OUT/res.zip"
aapt2 link --proto-format \
  -o "$OUT/proto.zip" \
  -I "$ANDROID_JAR" \
  --manifest "$HERE/android/AndroidManifest.xml" \
  --rename-manifest-package "$APP_ID" \
  -A "$OUT/assets" \
  --min-sdk-version 21 \
  --target-sdk-version 36 \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  --java "$OUT/gen" \
  "$OUT/res.zip"

echo "› java"
javac -nowarn -Xlint:-options -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" \
  -d "$OUT/classes" \
  $(find "$HERE/android/src" "$OUT/gen" -name '*.java')

echo "› dex"
"$DX" --dex --min-sdk-version=21 --output="$OUT/base/dex/classes.dex" "$OUT/classes"

echo "› bundle"
# A bundle module is: manifest/AndroidManifest.xml, resources.pb, res/, assets/, dex/.
(cd "$OUT/base" && unzip -q "$OUT/proto.zip" && mv AndroidManifest.xml manifest/)
(cd "$OUT/base" && zip -q -r -X "$OUT/base.zip" .)
java -jar "$BUNDLETOOL" build-bundle --modules="$OUT/base.zip" --output="$OUT/unsigned.aab"

echo "› sign (upload key)"
cp "$OUT/unsigned.aab" "$OUT/LingoPeak.aab"
jarsigner -keystore "$UPLOAD_KS" -storepass "$UPLOAD_KS_PASS" -sigalg SHA256withRSA -digestalg SHA-256 \
  "$OUT/LingoPeak.aab" "$UPLOAD_ALIAS" >/dev/null
jarsigner -verify "$OUT/LingoPeak.aab" >/dev/null
java -jar "$BUNDLETOOL" validate --bundle="$OUT/LingoPeak.aab" >/dev/null

echo "✓ $OUT/LingoPeak.aab ($APP_ID, version $VERSION_NAME, code $VERSION_CODE, $(du -h "$OUT/LingoPeak.aab" | cut -f1))"
