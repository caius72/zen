#!/bin/sh
# Build, notarize and publish a release: GitHub release with the stapled Zen.app zip, then
# update the Homebrew cask in the tap checkout (ZEN_TAP_DIR, default ~/repos/homebrew-zen).
set -eu
cd "$(dirname "$0")"
VERSION="$(node -p "require('./package.json').version")"
TAP="${ZEN_TAP_DIR:-$HOME/repos/homebrew-zen}"
CASK="$TAP/Casks/zen-safari.rb"
[ -f "$CASK" ] || { echo "Tap checkout not found at $TAP (set ZEN_TAP_DIR)"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash changes before releasing"; exit 1; }
xcrun notarytool history --keychain-profile "${ZEN_NOTARY_PROFILE:-zen-notary}" >/dev/null 2>&1 \
  || { echo "Notarization profile missing; releases must be notarized"; exit 1; }
./build.sh
APP="$PWD/xcode/build/Release/Zen.app"
ZIP="$PWD/xcode/build/Zen-$VERSION.zip"
spctl --assess --type execute "$APP"
xcrun stapler validate "$APP" >/dev/null
rm -f "$ZIP" && ditto -c -k --keepParent "$APP" "$ZIP"
SHA="$(shasum -a 256 "$ZIP" | cut -d' ' -f1)"
git tag -f "v$VERSION" && git push -q origin "v$VERSION" --force
gh release create "v$VERSION" "$ZIP" --title "Zen $VERSION" --notes "Notarized Zen.app for macOS 26 and later. Install with: brew install --cask caius72/zen/zen-safari" \
  || gh release upload "v$VERSION" "$ZIP" --clobber
sed -i '' -e "s/^  version \".*\"/  version \"$VERSION\"/" -e "s/^  sha256 \".*\"/  sha256 \"$SHA\"/" "$CASK"
git -C "$TAP" add Casks/zen-safari.rb
git -C "$TAP" commit -q -m "zen-safari $VERSION" && git -C "$TAP" push -q
echo "Released v$VERSION ($SHA); cask updated in $TAP"
