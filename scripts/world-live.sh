#!/usr/bin/env bash
# Switches the officer demo to World App's *production* environment with Selfie Check, for the live
# rehearsal (and the real thing). Restarts only the verifier (:8787); every other running service
# (agent, x402-demo, landing, any other web dev/preview server) is left alone. Also starts a second,
# separate web dev server on a spare port, so it never touches whatever web server is already running
# on :5173/:4173 for day-to-day work.
#
#   scripts/world-live.sh              # verifier + rehearsal web -> production, Selfie Check
#   scripts/world-live.sh --staging    # both back to today's default (staging, proof_of_human)
#
# Everything else in the root .env (WORLD_APP_ID, WORLD_RP_ID, WORLD_RP_SIGNING_KEY, the NTA/registry
# data, VERIFIER_FIXTURES) is untouched either way; VERIFIER_FIXTURES is forced to "1" in production
# mode only, so T7999900000002 always registers regardless of what .env currently has it set to.
#
# Logs: world-live-verifier.log, world-live-web.log (repo root; *.log is git-ignored). To stop either
# by hand: kill "$(lsof -tiTCP:8787)" or kill "$(lsof -tiTCP:5190)" (or just run --staging, or --stop).
#
# WORLD_LIVE_VERIFIER_PORT / WORLD_LIVE_WEB_PORT override the two ports; only for testing this script
# itself against scratch ports without touching the real verifier or a real dev server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERIFIER_PORT="${WORLD_LIVE_VERIFIER_PORT:-8787}"
WEB_PORT="${WORLD_LIVE_WEB_PORT:-5190}"
VERIFIER_LOG="$ROOT/world-live-verifier.log"
WEB_LOG="$ROOT/world-live-web.log"

MODE="production"
case "${1:-}" in
--staging) MODE="staging" ;;
--stop) MODE="stop" ;;
"") ;;
*)
  echo "usage: $0 [--staging|--stop]" >&2
  exit 1
  ;;
esac

pid_on_port() { lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }

# Idempotent: does nothing if the port is already free. Escalates to SIGKILL after 5s.
stop_on_port() {
  local port="$1" pid
  pid="$(pid_on_port "$port")"
  [[ -z "$pid" ]] && return 0
  echo "stopping the process on :$port (pid $pid)"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 10); do
    [[ -z "$(pid_on_port "$port")" ]] && return 0
    sleep 0.5
  done
  echo "  still up after 5s, sending SIGKILL"
  kill -9 "$pid" 2>/dev/null || true
}

wait_for_http() {
  local url="$1" tries=20
  for _ in $(seq 1 "$tries"); do
    curl -fsS -o /dev/null -m 2 "$url" 2>/dev/null && return 0
    sleep 0.5
  done
  return 1
}

# $1: WORLD_ENVIRONMENT / VITE_WORLD_ENVIRONMENT ("production" or "" to inherit .env's default)
# $2: WORLD_OFFICER_CREDENTIALS / VITE_WORLD_OFFICER_CREDENTIALS ("selfie" or "" to inherit)
# $3: "1" to force VERIFIER_FIXTURES=1, "" to inherit .env's own value
start_verifier() {
  local world_env="$1" credentials="$2" force_fixtures="$3"
  echo "starting the verifier on :$VERIFIER_PORT (WORLD_ENVIRONMENT=${world_env:-<.env default>} WORLD_OFFICER_CREDENTIALS=${credentials:-<.env default>})"
  (
    cd "$ROOT/services/verifier"
    env \
      ${world_env:+WORLD_ENVIRONMENT="$world_env"} \
      ${credentials:+WORLD_OFFICER_CREDENTIALS="$credentials"} \
      ${force_fixtures:+VERIFIER_FIXTURES="$force_fixtures"} \
      VERIFIER_PORT="$VERIFIER_PORT" \
      APP_ORIGINS="http://localhost:5173,http://localhost:4173,http://localhost:$WEB_PORT" \
      nohup pnpm start >"$VERIFIER_LOG" 2>&1 &
    disown
  )
  wait_for_http "http://localhost:$VERIFIER_PORT/health" || {
    echo "verifier did not come up in time; see $VERIFIER_LOG" >&2
    exit 1
  }
  echo "verifier up: http://localhost:$VERIFIER_PORT"
}

start_web() {
  local world_env="$1" credentials="$2"
  echo "starting a rehearsal web server on :$WEB_PORT (VITE_WORLD_ENVIRONMENT=${world_env:-<.env.example default>} VITE_WORLD_OFFICER_CREDENTIALS=${credentials:-<.env.example default>})"
  (
    cd "$ROOT/apps/web"
    env \
      ${world_env:+VITE_WORLD_ENVIRONMENT="$world_env"} \
      ${credentials:+VITE_WORLD_OFFICER_CREDENTIALS="$credentials"} \
      nohup ./node_modules/.bin/vite --port "$WEB_PORT" --strictPort >"$WEB_LOG" 2>&1 &
    disown
  )
  wait_for_http "http://localhost:$WEB_PORT/" || {
    echo "web dev server did not come up in time; see $WEB_LOG" >&2
    exit 1
  }
  echo "web up: http://localhost:$WEB_PORT/register"
}

stop_on_port "$VERIFIER_PORT"
stop_on_port "$WEB_PORT"

if [[ "$MODE" == "stop" ]]; then
  echo "stopped; nothing restarted (run without --stop, or with --staging, to bring them back up)"
  exit 0
fi

if [[ "$MODE" == "production" ]]; then
  start_verifier "production" "selfie" "1"
  start_web "production" "selfie"
else
  start_verifier "" "" ""
  start_web "" ""
fi

cat <<EOF

Rehearsal steps (T7999900000002, Selfie Check; Adithya needs World App from the App Store, signed in):
  1. Open http://localhost:$WEB_PORT/register, enter T7999900000002 as the T-number.
  2. Company step: the fixture note appears; type any legal name and continue past the domain skip.
  3. Officers step: enroll one officer, scanning the QR with World App's Selfie Check.
  4. On /change, request a payout change for T7999900000002.
  5. Approve it from the same phone/session with Selfie Check again.
  6. Have a second person (or a second World App session) try to approve; confirm it's denied.
EOF
