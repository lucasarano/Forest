#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${FOREST_SERVER_PORT:-4001}"

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[server] Port $port is in use — stopping listener(s): $pids"
    kill $pids 2>/dev/null || true
    sleep 0.4
    pids="$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      kill -9 $pids 2>/dev/null || true
      sleep 0.2
    fi
  fi
}

free_port "$PORT"

echo "[server] Starting on port $PORT (Ctrl+C to stop)"
export FOREST_SERVER_PORT="$PORT"
exec node server/server.js
