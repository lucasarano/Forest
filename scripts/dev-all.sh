#!/usr/bin/env bash
# Start Sprint 4 API + Vite together. Frees default ports first so EADDRINUSE does not block you.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Match vite.config.js server.port and sprint4Server default
VITE_PORT="${VITE_PORT:-3000}"
SPRINT4_PORT="${SPRINT4_SERVER_PORT:-4001}"

S4_PID=""

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[dev-all] Port $port is in use — stopping listener(s): $pids"
    # Try graceful first
    kill $pids 2>/dev/null || true
    sleep 0.4
    pids="$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      kill -9 $pids 2>/dev/null || true
      sleep 0.2
    fi
  fi
}

cleanup() {
  if [[ -n "${S4_PID:-}" ]] && kill -0 "$S4_PID" 2>/dev/null; then
    echo "[dev-all] Stopping Sprint 4 server (pid $S4_PID)..."
    kill "$S4_PID" 2>/dev/null || true
    wait "$S4_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

free_port "$SPRINT4_PORT"
free_port "$VITE_PORT"

mkdir -p "$ROOT/logs"
S4_LOG="$ROOT/logs/sprint4-server.log"
echo "[dev-all] Starting Sprint 4 on port $SPRINT4_PORT (logs → $S4_LOG)"
echo "[dev-all] In another terminal: npm run sprint4:logs"
SPRINT4_SERVER_PORT="$SPRINT4_PORT" node server/sprint4Server.js >"$S4_LOG" 2>&1 &
S4_PID=$!

HEALTH_URL="http://localhost:${SPRINT4_PORT}/api/sprint4/health"
ok=0
for _ in $(seq 1 50); do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 0.15
done

if [[ "$ok" -ne 1 ]]; then
  echo "[dev-all] ERROR: Sprint 4 server did not become healthy at $HEALTH_URL" >&2
  exit 1
fi

echo "[dev-all] Sprint 4 is up. Starting Vite on port $VITE_PORT..."
echo "[dev-all] Open http://localhost:${VITE_PORT} — MVP: http://localhost:${VITE_PORT}/mvp-v2"
echo ""

exec npm run dev
