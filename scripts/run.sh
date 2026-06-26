#!/bin/sh
# Production wrapper: restart (update + start) whenever Node exits.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

while true; do
  sh scripts/restart.sh
  echo "[euterpe] server stopped, restarting in 2s…"
  sleep 2
done
