#!/usr/bin/env bash
# The AP agent's two processes, as the booth runs them:
#   signer (services/signer, 127.0.0.1:8796): the only process with the agent key; it loads .env and .env.signer;
#   agent  (services/agent,  127.0.0.1:8788): no key, and it refuses to start if one reaches it; it loads .env only.
# The signer starts first; the agent starts once the signer answers. Both are supervised: whichever exits is
# restarted after 2 s, so a crash never leaves the agent unable to pay. Ctrl-C (or --stop) stops both.
#
#   scripts/ap-stack.sh                  # start both, in the foreground
#   scripts/ap-stack.sh --stop           # stop the pair started by this script, from another terminal
#   scripts/ap-stack.sh --pause-signer   # stop the signer and keep it down: the agent stays up, but can't pay
#   scripts/ap-stack.sh --resume-signer  # start the signer again, and wait until it answers
#
# The signer verifies approvals itself (Phase 2, SIGNER_VERIFY_APPROVAL=1) unless the launching shell says 0: the kill
# switch is `SIGNER_VERIFY_APPROVAL=0 scripts/ap-stack.sh`. Human-approver enrolment stays off (WORLD_AGENTS_ENROLL=0).
# Logs: ap-signer.log and ap-agent.log at the repo root (*.log is git-ignored).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STATE="$ROOT/.omc/state"
PIDS="$STATE/ap-stack.pids"
SIGNER="$STATE/ap-stack.signer"        # "<the signer loop's process group> <port>", written by a pair that can pause
PAUSED="$STATE/ap-stack.signer-paused" # while it exists, the signer's supervisor leaves it down
PARKED="$STATE/ap-stack.signer-parked" # the supervisor's reply, said again every second: the signer is down, waiting
export SIGNER_PORT="${SIGNER_PORT:-8796}" # exported, so the signer listens where this script looks
export SIGNER_VERIFY_APPROVAL="${SIGNER_VERIFY_APPROVAL:-1}" # Phase 2 by default, so a bare restart keeps it

die() {
  echo "ap-stack: $*" >&2
  exit 1
}

# True when process $1 is one of this script's supervising loops, which run under the script's own command line.
ours() {
  [[ $1 =~ ^[0-9]+$ ]] || return 1
  local command
  command="$(ps -o command= -p "$1" 2>/dev/null || true)"
  [[ $command == *ap-stack.sh* ]]
}

# True when the group $1 lost its leader but still holds processes running from this repo: a supervisor killed on
# its own leaves pnpm, tsx and the signer or agent behind. A group's number can't be reused while it has members.
orphaned() {
  [[ $1 =~ ^[0-9]+$ ]] && ! ps -p "$1" >/dev/null 2>&1 || return 1
  ps -A -o pgid= -o command= | awk -v group="$1" -v root="$ROOT/" '$1 == group && index($0, root) { found = 1 } END { exit !found }'
}

# Stale state (after a reboot, say) may name a process group that now belongs to something else: only ours is stopped.
stop_pair() {
  [[ -f $PIDS ]] || die "nothing to stop: $PIDS is missing"
  while read -r pgid; do
    if ours "$pgid" || orphaned "$pgid"; then
      kill -TERM -- "-$pgid" 2>/dev/null || true
    else
      echo "ap-stack: $pgid isn't one of ours; skipped" >&2
    fi
  done <"$PIDS"
  rm -f "$PIDS" "$SIGNER" "$PAUSED" "$PARKED"
  echo "ap-stack: stopped"
}

# True when nothing listens on the signer's port: curl's "couldn't connect".
signer_down() {
  local rc=0
  curl -s -m 2 -o /dev/null "http://127.0.0.1:$1/health" || rc=$?
  [[ $rc -eq 7 ]]
}

# Every process in the signer's group except the loop that supervises it: pnpm, tsx and the signer itself.
signer_processes() {
  ps -A -o pid= -o pgid= | awk -v group="$1" '$2 == group && $1 != group { print $1 }'
}

# Sets the caller's group and port: the signer's process group and port, from a pair this script started. A pair
# started by an older copy of the script restarts a stopped signer, so it has no such file and can't pause.
signer_group() {
  [[ -f $SIGNER ]] || die "no pausable pair is running ($SIGNER is missing): restart the pair with this script first"
  read -r group port <"$SIGNER" || true
  if [[ ! ${port:-} =~ ^[0-9]+$ ]] || ! ours "${group:-}"; then
    die "the pair in $SIGNER isn't running: run --stop, then start the pair again"
  fi
}

# Stops the signer and keeps it down. The agent stays up but holds no key, so a payment fails before anything is
# signed. "Paused" is reported only once the supervisor replies that it's waiting and nothing listens on the port;
# until then, whatever runs in the signer's group (a restart the pause raced with, too) is stopped again.
pause_signer() {
  local group port pids signal tries=0
  signer_group
  if [[ -f $PAUSED && -f $PARKED ]] && signer_down "$port"; then
    echo "ap-stack: the signer is already paused; --resume-signer starts it"
    return
  fi
  rm -f "$PARKED" # an earlier reply mustn't count for this pause
  : >"$PAUSED"
  until [[ -f $PARKED ]] && signer_down "$port"; do
    [[ -f $PAUSED ]] || die "the pause was lifted meanwhile (--resume-signer or --stop)"
    tries=$((tries + 1))
    [[ $tries -le 40 ]] || die "the signer on :$port didn't stop within 20 s (see ap-signer.log); --resume-signer lifts the pause"
    signal=TERM
    [[ $tries -le 20 ]] || signal=KILL
    pids="$(signer_processes "$group")"
    [[ -z $pids ]] || kill "-$signal" $pids 2>/dev/null || true
    sleep 0.5
  done
  echo "ap-stack: signer paused: nothing listens on :$port, and the agent holds no key, so it can't pay. --resume-signer starts it."
}

resume_signer() {
  local group port
  signer_group
  [[ -f $PAUSED ]] || echo "ap-stack: the signer isn't paused"
  rm -f "$PAUSED"
  for _ in $(seq 1 60); do
    if curl -sf -m 2 "http://127.0.0.1:$port/health" >/dev/null; then
      echo "ap-stack: signer answering on :$port; the agent can pay again"
      return
    fi
    sleep 1
  done
  die "the signer isn't answering on :$port yet; see ap-signer.log"
}

case "${1:-}" in
  --stop) stop_pair; exit 0 ;;
  --pause-signer) pause_signer; exit 0 ;;
  --resume-signer) resume_signer; exit 0 ;;
  "") ;;
  *) die "unknown option $1 (--stop, --pause-signer or --resume-signer)" ;;
esac

[[ -f .env.signer ]] || die ".env.signer is missing: it holds AGENT_PRIVATE_KEY and SIGNER_TOKEN for the signer"
if grep -q '^AGENT_PRIVATE_KEY=' .env; then die "AGENT_PRIVATE_KEY is still in .env: move it to .env.signer (the agent must not load it)"; fi
grep -q '^SIGNER_TOKEN=' .env || die "SIGNER_TOKEN is missing from .env (the agent needs the same value as .env.signer)"
[[ -f $PIDS ]] && die "a pair may already be running ($PIDS); run --stop first"
mkdir -p "$STATE"
rm -f "$PAUSED" "$PARKED" # a pause left by a pair that died without --stop must not keep this signer down

note() {
  echo "[ap-stack] $(date +%H:%M:%S) $1 $2" | tee -a "$ROOT/ap-$1.log" >&2 || true
}

# Runs a command forever in its own process group, restarting it 2 s after each exit. A paused signer is checked for
# before every start and stays down until --resume-signer. Each step tolerates being killed, since a pause stops
# everything in the group but this loop.
supervise() {
  local name="$1"
  shift
  while true; do
    if [[ $name == signer && -f $PAUSED ]]; then
      note "$name" "paused; it stays down until --resume-signer"
      while [[ -f $PAUSED ]]; do
        { : >"$PARKED"; } 2>/dev/null || true
        sleep 1 || true
      done
      rm -f "$PARKED" 2>/dev/null || true
      note "$name" "resumed"
    fi
    "$@" >>"$ROOT/ap-$name.log" 2>&1 || true
    if [[ $name == signer && -f $PAUSED ]]; then continue; fi # stopped by a pause: wait at the top, no delay
    note "$name" "exited; restarting in 2 s"
    sleep 2 || true
  done
}

set -m # job control: each supervised loop gets its own process group, so --stop and Ctrl-C take its children too
supervise signer pnpm --filter @meigi/signer start &
echo "$!" >"$PIDS"
echo "$! $SIGNER_PORT" >"$SIGNER"
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
