#!/usr/bin/env bash
# Remove the kouhai LaunchAgent and the PATH link. The inbox in ~/.kouhai is left alone.
set -euo pipefail
launchctl bootout "gui/$(id -u)/dev.kouhai" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/dev.kouhai.plist" "$HOME/.local/bin/kouhai"
echo "removed dev.kouhai"
