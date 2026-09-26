#!/usr/bin/env bash
# Rehearses the demo's Awaji mode end to end on an anvil fork of Mizuhiki Awaji (chain 6497). Nothing reaches
# the real chain:
#   1. seed-awaji.sh registers Minato GPU Cloud on the fork (skipped once it is registered for real),
#   2. the deployer (impersonated) claims MJPY from Mizuhiki's faucet for the buyer, who holds no MIZU and needs
#      none, and the facilitator gets fork-only MIZU for gas,
#   3. the demo serves Minato's routes in MJPY, settling through the in-process facilitator, and the research agent
#      buys: the honest GPU-minute must settle at the registered payout; the compromised mirror, whose payTo is
#      swapped, must be refused before anything is signed.
# Settlement is forced in-process (a hosted facilitator would settle the fork's authorizations on the real chain)
# and screening is off, so a run calls no outside service but the fork's upstream RPC.
# Needs anvil, cast, jq, nc and ../../.env. The payout is AWAJI_MINATO_PAYOUT (the environment, then ../../.env.awaji),
# or a throwaway address when neither sets it.
#   bash services/x402-demo/scripts/awaji-fork-e2e.sh
set -euo pipefail
cd "$(dirname "$0")/.."

FORK_PORT=${FORK_PORT:-18645}
DEMO_PORT=${DEMO_PORT:-18790}
FORK=http://127.0.0.1:$FORK_PORT
MJPY=0x78f5f0Ac4EF201618b97638ded959b155c4f4B04
MJPY_FAUCET=0xaD93649dbDe82ed1219Ee7B64C4C8FEE9dA520C0
MINATO=6999900000003
REGISTRY=$(jq -r .registry ../../contracts/deployments/6497.json)
OUT=$(mktemp -d)
failures=0

cleanup() {
  [ -n "${DEMO_PID:-}" ] && kill "$DEMO_PID" 2>/dev/null || true
  [ -n "${ANVIL_PID:-}" ] && kill "$ANVIL_PID" 2>/dev/null || true
  rm -rf "$OUT"
}
trap cleanup EXIT

expect() { # expect <description> <actual> <expected>
  if [ "$2" = "$3" ]; then
    echo "ok: $1"
  else
    echo "FAIL: $1 (expected $3, got $2)"
    failures=$((failures + 1))
  fi
}
fail() {
  echo "$1" >&2
  [ -f "$OUT/server.log" ] && cat "$OUT/server.log" >&2
  exit 1
}
lower() { tr '[:upper:]' '[:lower:]' <<<"$1"; }
# wait_for <description> <pid> <command...>: polls until the command succeeds; fails if our process died or 60 s pass.
wait_for() {
  local what=$1 pid=$2 tries=0
  shift 2
  until "$@" >/dev/null 2>&1; do
    if ! kill -0 "$pid" 2>/dev/null || [ "$tries" -ge 120 ]; then fail "$what did not come up"; fi
    tries=$((tries + 1))
    sleep 0.5
  done
  kill -0 "$pid" 2>/dev/null || fail "$what exited; something else answers on its port"
}
port_free() { ! nc -z 127.0.0.1 "$1" 2>/dev/null || fail "port $1 is in use; set FORK_PORT / DEMO_PORT"; }
# env_file <KEY> [file]: a value from ../../.env (or the file), empty if absent; env_need <KEY>: it must be in .env.
env_file() {
  local file=${2:-../../.env}
  [ -f "$file" ] || return 0
  sed -nE "s/^$1=\"?([^\"]*)\"?$/\1/p" "$file" | tail -1
}
env_need() {
  local value
  value=$(env_file "$1")
  [ -n "$value" ] || fail "$1 is missing from .env"
  echo "$value"
}
mjpy_of() {
  local balance
  balance=$(cast call "$MJPY" "balanceOf(address)(uint256)" "$1" --rpc-url "$FORK")
  awk '{print $1}' <<<"$balance"
}

deployer=$(env_need DEPLOYER_ADDRESS)
buyer=$(env_need DEMO_BUYER)
facilitator=$(env_need FACILITATOR)
scammer=$(env_need DEMO_SCAMMER)

port_free "$FORK_PORT"
port_free "$DEMO_PORT"
anvil --fork-url https://rpc.awaji.mizuhiki.io --port "$FORK_PORT" --silent &
ANVIL_PID=$!
wait_for "the anvil fork" "$ANVIL_PID" cast chain-id --rpc-url "$FORK"
client=$(cast client --rpc-url "$FORK")
[[ $client == anvil/* ]] || fail "$FORK is $client, not our anvil fork"
expect "the fork is Awaji" "$(cast chain-id --rpc-url "$FORK")" 6497

payout=${AWAJI_MINATO_PAYOUT:-$(env_file AWAJI_MINATO_PAYOUT ../../.env.awaji)}
[ -n "$payout" ] || payout=$(cast wallet new --json | jq -r '.[0].address')
export AWAJI_MINATO_PAYOUT=$payout
SEED_RPC_URL=$FORK bash ../../contracts/script/seed-awaji.sh
registered=$(cast call "$REGISTRY" "payoutOf(uint64)(address)" "$MINATO" --rpc-url "$FORK")
expect "Minato's registered payout is the one we hold" "$(lower "$registered")" "$(lower "$payout")"

cast rpc anvil_setBalance "$facilitator" 0x2386f26fc10000 --rpc-url "$FORK" >/dev/null # 0.01 MIZU, fork only
cast rpc anvil_setBalance "$buyer" 0x0 --rpc-url "$FORK" >/dev/null # the buyer only signs: it needs no gas
buyer_mjpy=$(mjpy_of "$buyer")
if [ "$buyer_mjpy" -lt 15000000 ]; then
  cast rpc anvil_impersonateAccount "$deployer" --rpc-url "$FORK" >/dev/null
  cast send "$MJPY_FAUCET" "sendTokens(address)" "$buyer" --from "$deployer" --unlocked --rpc-url "$FORK" >/dev/null
fi
payout_before=$(mjpy_of "$payout")
scammer_before=$(mjpy_of "$scammer")

export X402_CHAIN=awaji AWAJI_RPC_URL=$FORK X402_DEMO_PORT=$DEMO_PORT AWAJI_FACILITATOR_URL= INTERCEPTA_API_KEY=
pnpm -s exec tsx --env-file=../../.env src/server.ts >"$OUT/server.log" 2>&1 &
DEMO_PID=$!
wait_for "the demo server" "$DEMO_PID" curl -sf "http://127.0.0.1:$DEMO_PORT/health"
pnpm -s exec tsx --env-file=../../.env scripts/research-agent.ts --json >"$OUT/run.json" || fail "the research agent failed"
jq -c '.steps[] | {path, outcome, payTo, registryPayout, reason, txHash}' "$OUT/run.json"

step() { jq -r ".steps[$1].$2 // \"null\"" "$OUT/run.json"; }
expect "two steps on Awaji" "$(jq '.steps | length' "$OUT/run.json")" 2
expect "the honest GPU-minute settles" "$(step 0 outcome)" settled
expect "it pays the registered payout" "$(lower "$(step 0 payTo)")" "$(lower "$payout")"
expect "it declares only a T-number (no ENS on Awaji)" "$(jq -c '.steps[0].declared' "$OUT/run.json")" \
  "{\"tNumber\":\"T$MINATO\",\"ens\":null}"
tx=$(step 0 txHash)
expect "the settlement mined" "$(cast receipt "$tx" status --rpc-url "$FORK" 2>/dev/null)" "1 (success)"
expect "the facilitator sent it, to MJPY" \
  "$(lower "$(cast tx "$tx" from --rpc-url "$FORK")") $(lower "$(cast tx "$tx" to --rpc-url "$FORK")")" \
  "$(lower "$facilitator") $(lower "$MJPY")"
expect "the payout received 15 MJPY" "$(($(mjpy_of "$payout") - payout_before))" 15000000
expect "the compromised mirror is refused" "$(step 1 outcome)" refused
expect "its payTo was the swapped one" "$(lower "$(step 1 payTo)")" "$(lower "$scammer")"
expect "it was refused as a payTo mismatch" \
  "$(step 1 reason | grep -cF "is not 株式会社ミナトGPUクラウド (T$MINATO)'s registered payout")" 1
expect "nothing was settled for it" "$(step 1 txHash)" null
expect "the swapped payTo received nothing" "$(mjpy_of "$scammer")" "$scammer_before"

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed; server log:"
  cat "$OUT/server.log"
  exit 1
fi
echo "all checks passed"
