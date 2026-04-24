#!/usr/bin/env bash
# Start Forest API + Vite together. Frees default ports first so EADDRINUSE does not block you.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VITE_PORT="${VITE_PORT:-3000}"
SERVER_PORT="${FOREST_SERVER_PORT:-4001}"

API_PID=""

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[dev-all] Port $port is in use — stopping listener(s): $pids"
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
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    echo "[dev-all] Stopping API server (pid $API_PID)..."
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

free_port "$SERVER_PORT"
free_port "$VITE_PORT"

mkdir -p "$ROOT/logs"
API_LOG="$ROOT/logs/server.log"
echo "[dev-all] Starting API on port $SERVER_PORT (logs → $API_LOG)"
echo "[dev-all] In another terminal: npm run server:logs"
FOREST_SERVER_PORT="$SERVER_PORT" node server/server.js >"$API_LOG" 2>&1 &
API_PID=$!

HEALTH_URL="http://localhost:${SERVER_PORT}/api/health"
ok=0
for _ in $(seq 1 50); do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 0.15
done

if [[ "$ok" -ne 1 ]]; then
  echo "[dev-all] ERROR: API server did not become healthy at $HEALTH_URL" >&2
  exit 1
fi

echo "[dev-all] API server is up. Starting Vite on port $VITE_PORT..."
echo "[dev-all] Open http://localhost:${VITE_PORT}"
echo ""

exec npm run dev
