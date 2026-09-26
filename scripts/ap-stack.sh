#!/usr/bin/env bash
# The AP agent's two processes, as the booth runs them:
#   signer (services/signer, 127.0.0.1:8796): the only process with the agent key; it loads .env and .env.signer;
#   agent  (services/agent,  127.0.0.1:8788): no key, and it refuses to start if one reaches it; it loads .env only.
# The signer starts first; the agent starts once the signer answers. Both are supervised: whichever exits is
# restarted after 2 s, so a crash never leaves the agent unable to pay. Ctrl-C (or --stop) stops both.
#
#   scripts/ap-stack.sh          # start both, in the foreground
#   scripts/ap-stack.sh --stop   # stop the pair started by this script, from another terminal
#
# Human-approver enrolment stays off (WORLD_AGENTS_ENROLL=0). Logs: ap-signer.log and ap-agent.log at the repo root
# (*.log is git-ignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STATE="$ROOT/.omc/state"
PIDS="$STATE/ap-stack.pids"
SIGNER_PORT="${SIGNER_PORT:-8796}"

die() {
  echo "ap-stack: $*" >&2
  exit 1
}

stop_pair() {
  [[ -f $PIDS ]] || die "nothing to stop: $PIDS is missing"
  while read -r pgid; do kill -TERM -- "-$pgid" 2>/dev/null || true; done <"$PIDS"
  rm -f "$PIDS"
  echo "ap-stack: stopped"
}

if [[ ${1:-} == --stop ]]; then
  stop_pair
  exit 0
fi

[[ -f .env.signer ]] || die ".env.signer is missing: it holds AGENT_PRIVATE_KEY and SIGNER_TOKEN for the signer"
if grep -q '^AGENT_PRIVATE_KEY=' .env; then die "AGENT_PRIVATE_KEY is still in .env: move it to .env.signer (the agent must not load it)"; fi
grep -q '^SIGNER_TOKEN=' .env || die "SIGNER_TOKEN is missing from .env (the agent needs the same value as .env.signer)"
[[ -f $PIDS ]] && die "a pair may already be running ($PIDS); run --stop first"
mkdir -p "$STATE"

# Runs a command forever in its own process group, restarting it 2 s after each exit.
supervise() {
  local name="$1"
  shift
  while true; do
    "$@" >>"$ROOT/ap-$name.log" 2>&1 || true
    echo "[ap-stack] $(date +%H:%M:%S) $name exited; restarting in 2 s" | tee -a "$ROOT/ap-$name.log" >&2
    sleep 2
  done
}

set -m # job control: each supervised loop gets its own process group, so --stop and Ctrl-C take its children too
supervise signer pnpm --filter @meigi/signer start &
echo "$!" >"$PIDS"
for _ in $(seq 1 30); do
  curl -sf -m 2 "http://127.0.0.1:$SIGNER_PORT/health" >/dev/null && break
  sleep 1
done
curl -sf -m 2 "http://127.0.0.1:$SIGNER_PORT/health" >/dev/null || echo "ap-stack: the signer isn't answering yet; see ap-signer.log (starting the agent anyway)" >&2
WORLD_AGENTS_ENROLL=0 supervise agent pnpm --filter @meigi/agent start &
echo "$!" >>"$PIDS"

trap 'stop_pair; exit 0' INT TERM
echo "ap-stack: signer on :$SIGNER_PORT and agent on :8788, supervised. Logs: ap-signer.log, ap-agent.log. Ctrl-C stops both."
wait
