#!/usr/bin/env bash
# Remove the dixeram LaunchAgent and the PATH link. The inbox in ~/.dixeram is left alone.
set -euo pipefail
launchctl bootout "gui/$(id -u)/dev.dixeram" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/dev.dixeram.plist" "$HOME/.local/bin/dixeram"
echo "removed dev.dixeram"
