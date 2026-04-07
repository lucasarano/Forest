#!/usr/bin/env bash
# Free the Sprint 4 API port, then start the LangGraph server in the foreground (logs to this terminal).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SPRINT4_PORT="${SPRINT4_SERVER_PORT:-4001}"

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[sprint4-server] Port $port is in use — stopping listener(s): $pids"
    kill $pids 2>/dev/null || true
    sleep 0.4
    pids="$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      kill -9 $pids 2>/dev/null || true
      sleep 0.2
    fi
  fi
}

free_port "$SPRINT4_PORT"

echo "[sprint4-server] Starting on port $SPRINT4_PORT (Ctrl+C to stop)"
export SPRINT4_SERVER_PORT="$SPRINT4_PORT"
exec node server/sprint4Server.js
