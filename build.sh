#!/bin/sh
# Build the Safari extension bundle and the signed Zen.app wrapper.
# The Xcode project references .output/safari-mv3 directly, so no copy step is needed.
set -eu
cd "$(dirname "$0")"
npx wxt build -b safari --mv3
xcodebuild -project xcode/Zen/Zen.xcodeproj -scheme Zen -configuration Release \
  SYMROOT="$PWD/xcode/build" \
  DEVELOPMENT_TEAM="${ZEN_TEAM:-8TJQFP35F5}" \
  CODE_SIGN_IDENTITY="${ZEN_SIGN_IDENTITY:-Developer ID Application}" \
  CODE_SIGN_STYLE=Manual \
  OTHER_CODE_SIGN_FLAGS=--timestamp \
  CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO \
  CODE_SIGN_ENTITLEMENTS=Zen.entitlements \
  -quiet build
APP="$PWD/xcode/build/Release/Zen.app"
PROFILE="${ZEN_NOTARY_PROFILE:-zen-notary}"
# CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO drops the debug get-task-allow entitlement notarization
# rejects, but also Xcode's injected app-sandbox, so Zen.entitlements supplies sandbox/network explicitly.
# Safari hides extensions from unnotarized apps unless Develop > Allow Unsigned Extensions is on
# (reset on every Safari launch). Notarize when a notarytool keychain profile exists:
#   xcrun notarytool store-credentials zen-notary --key <AuthKey.p8> --key-id <ID> --issuer <UUID>
if xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1; then
  ditto -c -k --keepParent "$APP" "$PWD/xcode/build/Zen.zip"
  xcrun notarytool submit "$PWD/xcode/build/Zen.zip" --keychain-profile "$PROFILE" --wait
  xcrun stapler staple "$APP"
  echo "Notarized and stapled."
else
  echo "Not notarized (no notarytool profile '$PROFILE'). Safari needs Develop > Allow Unsigned Extensions."
fi
# Install to a stable location and (re)launch so macOS registers the extension with Safari.
INSTALL="$HOME/Applications/Zen.app"
pkill -x Zen 2>/dev/null || true
mkdir -p "$HOME/Applications" && rm -rf "$INSTALL" && ditto "$APP" "$INSTALL"
# Unregister the build-folder copy so Safari does not list the extension twice.
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
pluginkit -r "$APP/Contents/PlugIns/Zen Extension.appex" 2>/dev/null || true
"$LSREGISTER" -u "$APP" >/dev/null 2>&1 || true
open "$INSTALL"
echo "Installed and launched: $INSTALL"
