#!/usr/bin/env bash
# End-to-end proof on a local anvil fork of Sepolia. It deploys the payee stack, seeds the demo payee,
# registers <ENS_LABEL>.eth on each ENSv2 deployment, and resolves the payee through the UniversalResolver with
# forge and viem. It then re-points the name at a redeployed resolver, files a dispute and checks that the
# payee now resolves to zero.
# Nothing is sent to a real network and .env is never read. Signers come from a random mnemonic: anvil's
# well-known default accounts are EIP-7702-delegated to sweeper contracts on Sepolia, and ENSv2 mints the name
# as an ERC-1155 token, which a delegated owner rejects.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEIGI="$(cd "$HERE/../../.." && pwd)"
FORK_URL="${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8546}"
DEPLOYMENTS="${ENS_DEPLOYMENTS:-hackathon beta}"
T_NUMBER=2011001234567
# payee.eth itself is registered on Sepolia now, so the fork proof registers a fresh label by default.
export ENS_LABEL="${ENS_LABEL:-payeefork$RANDOM}"

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo "fork-e2e: $*" >&2
  exit 1
}
# Prints the value of NAME=0x... from forge output, or nothing.
parse_addr() { grep -Eo "$1=0x[0-9a-fA-F]{40}" <<<"$2" | head -1 | cut -d= -f2 || true; }

# anvil takes the fork URL only as an argument, which other local users can read with `ps`.
[[ $FORK_URL =~ ^https?://[^/?]+/?$ ]] || echo "warning: FORK_URL has a path or query; prefer a keyless endpoint" >&2

TMP="$(mktemp -d)"
anvil --fork-url "$FORK_URL" --port "$PORT" --mnemonic-random --config-out "$TMP/anvil.json" --silent &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true; rm -rf "$TMP"' EXIT

export RPC_URL="http://127.0.0.1:$PORT" SKIP_DOTENV=1 BROADCAST=1 FAST_FORWARD=1
export FOUNDRY_BROADCAST="$TMP/broadcast"
for _ in $(seq 1 150); do
  if cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1 && [[ -s $TMP/anvil.json ]]; then break; fi
  sleep 0.2
done
[[ $(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null) == 11155111 ]] || fail "the anvil fork of Sepolia did not start"

account() { jq -r ".available_accounts[$1]" "$TMP/anvil.json"; }
key() { jq -r ".private_keys[$1]" "$TMP/anvil.json"; }
DEPLOYER_PRIVATE_KEY="$(key 0)" DEPLOYER_ADDRESS="$(account 0)"
ATTESTER_PRIVATE_KEY="$(key 1)" ATTESTER_ADDRESS="$(account 1)"
PAYEE_CONTROLLER="$(account 2)" PAYEE_PAYOUT="$(account 3)"
export DEPLOYER_PRIVATE_KEY DEPLOYER_ADDRESS ATTESTER_PRIVATE_KEY ATTESTER_ADDRESS PAYEE_CONTROLLER PAYEE_PAYOUT
echo "Fork block $(cast block-number --rpc-url "$RPC_URL"); deployer $DEPLOYER_ADDRESS; payout $PAYEE_PAYOUT"

# viem getEnsAddress/getEnsText; $1 = deployment, $2 = expected address or "null". Beta uses viem's default UR.
viem_check() {
  local ur="" out
  [[ -d $MEIGI/apps/landing/node_modules/viem ]] || { echo "viem not installed; skipped" && return 0; }
  if [[ $1 != beta ]]; then ur="$(set -a && source "$HERE/deployments/$1.env" && echo "$ENS_UNIVERSAL_RESOLVER")"; fi
  out="$(cd "$MEIGI/apps/landing" && VIEM_UR="$ur" ENS_NAME="t$T_NUMBER.$ENS_LABEL.eth" node --input-type=module <"$HERE/check-viem.mjs")"
  echo "$out"
  jq -e --arg want "$2" '((.address // "null") | ascii_downcase) == ($want | ascii_downcase)' <<<"$out" >/dev/null ||
    fail "viem resolved an unexpected address on $1"
}

step "Deploy PayeeRegistry and a PayeeResolver bound to $ENS_LABEL.eth"
out="$("$HERE/ens.sh" deploy)" || fail "deploy failed: $out"
PAYEE_REGISTRY="$(parse_addr PAYEE_REGISTRY "$out")" PAYEE_RESOLVER="$(parse_addr PAYEE_RESOLVER "$out")"
[[ -n $PAYEE_REGISTRY && -n $PAYEE_RESOLVER ]] || fail "deploy printed no addresses: $out"
export PAYEE_REGISTRY PAYEE_RESOLVER
echo "PAYEE_REGISTRY=$PAYEE_REGISTRY PAYEE_RESOLVER=$PAYEE_RESOLVER"

step "Attester registers T$T_NUMBER with payout $PAYEE_PAYOUT"
out="$("$HERE/ens.sh" seed)" || fail "seed failed: $out"
payout="$(cast call "$PAYEE_REGISTRY" "payoutOf(uint64)(address)" "$T_NUMBER" --rpc-url "$RPC_URL")"
[[ $payout == "$(cast to-check-sum-address "$PAYEE_PAYOUT")" ]] || fail "seed failed: payoutOf=$payout"
grep -E "Registered T" <<<"$out"

for d in $DEPLOYMENTS; do
  step "Register $ENS_LABEL.eth on the '$d' ENSv2 deployment, then resolve it through the UniversalResolver"
  ENS_DEPLOYMENT="$d" EXPECT_ADDR="$PAYEE_PAYOUT" "$HERE/ens.sh" register
  step "viem on '$d'"
  viem_check "$d" "$PAYEE_PAYOUT"
done

step "Redeploy only the resolver, then re-point $ENS_LABEL.eth with set-resolver (the owner's ROLE_SET_RESOLVER)"
out="$("$HERE/ens.sh" deploy)" || fail "resolver redeploy failed: $out"
PAYEE_RESOLVER="$(parse_addr PAYEE_RESOLVER "$out")"
[[ -n $PAYEE_RESOLVER ]] || fail "redeploy printed no resolver: $out"
for d in $DEPLOYMENTS; do
  out="$(ENS_DEPLOYMENT="$d" "$HERE/ens.sh" set-resolver)" || fail "set-resolver failed on $d: $out"
  grep -E "now resolves" <<<"$out"
  ENS_DEPLOYMENT="$d" EXPECT_ADDR="$PAYEE_PAYOUT" "$HERE/ens.sh" check | grep -E "UniversalResolver|addr\(60\)|Error"
done

step "Attester files a dispute: the payee freezes and must resolve to zero on every deployment"
cast send "$PAYEE_REGISTRY" "fileDispute(uint64,address,bytes32)" "$T_NUMBER" "$(account 4)" \
  "$(cast keccak second-claimant)" --unlocked --from "$ATTESTER_ADDRESS" --rpc-url "$RPC_URL" >/dev/null
for d in $DEPLOYMENTS; do
  ENS_DEPLOYMENT="$d" EXPECT_ADDR=0x0000000000000000000000000000000000000000 "$HERE/ens.sh" check
  viem_check "$d" null
done

step "Fork end-to-end passed for: $DEPLOYMENTS"
