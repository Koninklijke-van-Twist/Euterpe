#!/usr/bin/env bash
# Update from git and start Euterpe. Blocks until Node exits.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[euterpe] git reset --hard HEAD"
git reset --hard HEAD

echo "[euterpe] git pull"
git pull

echo "[euterpe] starting server"
exec node server/index.js
