#!/usr/bin/env bash
# Install the kouhai daemon as a LaunchAgent and put `kouhai` on PATH (~/.local/bin).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

LABEL="dev.kouhai"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HOME_DIR="${KOUHAI_HOME:-$HOME/.kouhai}"
# launchd sources no profile; bake in the node this shell resolves.
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] || [ "$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  echo "kouhai needs Node 24 or later (node:sqlite, type stripping); found ${NODE_BIN:-no node}${NODE_BIN:+ $("$NODE_BIN" --version)}" >&2
  exit 1
fi
[ -d outlets/web/dist ] || echo "note: the page isn't built; run npm install && npm run build" >&2

mkdir -p "$HOME_DIR" "$HOME/Library/LaunchAgents" "$HOME/.local/bin"
chmod 700 "$HOME_DIR"
ln -sf "$ROOT/bin/kouhai" "$HOME/.local/bin/kouhai"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

# Not ProcessType Background: launchd throttles that so hard the daemon takes ~20 s to listen.
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--disable-warning=ExperimentalWarning</string>
    <string>$ROOT/src/cli.ts</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>Nice</key><integer>5</integer>
  <key>StandardOutPath</key><string>$HOME_DIR/daemon.log</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/daemon.log</string>
</dict>
</plist>
PLIST_EOF

launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $LABEL on :8771, logging to $HOME_DIR/daemon.log"
