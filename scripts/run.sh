#!/usr/bin/env bash
# Production wrapper: restart (update + start) whenever Node exits.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

while true; do
  bash scripts/restart.sh
  echo "[euterpe] server stopped, restarting in 2s…"
  sleep 2
done
