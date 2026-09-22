#!/bin/sh
# Back up or restore Zen's settings, API keys and saved templates straight from Safari's storage.
# Same JSON format as Save/Restore settings in the popup, so either side can read the other's file.
# The file contains API keys unencrypted.
#   scripts/zen-settings.sh backup [file]   default file: zen-settings-YYYY-MM-DD.json
#   scripts/zen-settings.sh restore <file>  quit Safari first; replaces all current settings
# ZEN_SAFARI_PROFILE picks another Safari profile folder (default: Default).
set -eu
DB="$HOME/Library/Containers/com.apple.Safari/Data/Library/WebKit/WebExtensions/${ZEN_SAFARI_PROFILE:-Default}/com.tuschner.zen.Extension (8TJQFP35F5)/LocalStorage.db"
usage() {
  sed -n '5,6s/^#   //p' "$0" >&2
  exit 2
}
[ -f "$DB" ] || { echo "No Zen storage at: $DB (open the Zen popup in Safari once)" >&2; exit 1; }
case "${1:-}" in
backup)
  OUT="${2:-zen-settings-$(date +%F).json}"
  # auto:* markers are transient analysis attempts; the popup leaves them out too.
  (umask 077 && sqlite3 -readonly "$DB" "SELECT json_object('format', 'zen-settings', 'version', 1,
      'exportedAt', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'data', json_group_object(key, json(value)))
    FROM extension_storage WHERE key NOT LIKE 'auto:%'" >"$OUT")
  echo "Saved $OUT"
  ;;
restore)
  [ -f "${2:-}" ] || usage
  if pgrep -xq Safari; then
    echo "Quit Safari first; it would overwrite the restored settings." >&2
    exit 1
  fi
  F=$(printf %s "$2" | sed "s/'/''/g")
  ok=$(sqlite3 :memory: "SELECT json_extract(readfile('$F'), '\$.format') = 'zen-settings'
    AND json_extract(readfile('$F'), '\$.version') = 1")
  [ "$ok" = 1 ] || { echo "Not a Zen settings file: $2" >&2; exit 1; }
  # json_each unwraps values; storage keeps each one as JSON text.
  sqlite3 -bail "$DB" "BEGIN;
    DELETE FROM extension_storage WHERE key NOT LIKE 'auto:%';
    INSERT INTO extension_storage (key, value)
      SELECT key, CASE type WHEN 'text' THEN json_quote(value) WHEN 'true' THEN 'true'
        WHEN 'false' THEN 'false' WHEN 'null' THEN 'null' ELSE CAST(value AS TEXT) END
      FROM json_each(readfile('$F'), '\$.data') WHERE key NOT LIKE 'auto:%';
    COMMIT;"
  echo "Restored $2"
  ;;
*) usage ;;
esac
