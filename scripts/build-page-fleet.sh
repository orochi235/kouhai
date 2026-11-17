#!/usr/bin/env bash
# Build the page on the fleet and swap it in whole. onto's fetch never deletes, so landing it
# straight in dist/ leaves every earlier build's bundles behind.
set -euo pipefail
cd "$(dirname "$0")/.."
WEB=outlets/web
rm -rf "$WEB/dist.next" "$WEB/dist.old"
onto do --kind build --task dixeram-page \
  --about "rebuild the weasel workspace, then the dixeram page against it" \
  --expect 4m --out "$WEB/dist" --to "$WEB/dist.next" \
  -- sh -c 'cd ../weasel && npm run build && cd ../dixeram && npm run build'
[ -f "$WEB/dist.next/index.html" ] || { echo "build-page-fleet: no index.html came back" >&2; exit 1; }
[ -d "$WEB/dist" ] && mv "$WEB/dist" "$WEB/dist.old"
mv "$WEB/dist.next" "$WEB/dist"
rm -rf "$WEB/dist.old" "$WEB/dist/.onto-fetch-cache.json"
