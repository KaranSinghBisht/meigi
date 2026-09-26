#!/usr/bin/env bash
# Fork proof for a payout wallet's primary name. On an anvil fork of Sepolia it impersonates the deployer and the
# payee's live payout wallet (no key is read), runs the two steps of `ens.sh payout-name`, and then checks that stock
# viem getEnsName(payout) and the UniversalResolver return t<T>.payee.eth, while every reference name still resolves
# byte for byte as before. Nothing is sent to a real network.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEIGI="$(cd "$HERE/../../.." && pwd)"
FORK_URL="${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8607}"
T="${T_NUMBER:-2011001234567}"
NAME="t$T.payee.eth"
REFERENCE="2011001234567 3999905000001 2010401000001 9999999999999 8999900000001 6999900000003"

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo "payout-name-e2e: $*" >&2
  exit 1
}
snapshot() {
  local t
  for t in $REFERENCE; do
    (cd "$MEIGI/apps/landing" && ENS_NAME="t$t.payee.eth" node --input-type=module <"$HERE/check-viem.mjs") || return 1
  done
}
primary() { (cd "$MEIGI/apps/landing" && ENS_ADDRESS="$1" node --input-type=module <"$HERE/check-primary-viem.mjs"); }
forge_as() { # $1 = sender, $2 = signature
  (cd "$MEIGI/contracts" && forge script script/ens/PayoutName.s.sol --sig "$2" --broadcast --slow --unlocked \
    --sender "$1") 2>&1
}

unset DEPLOYER_PRIVATE_KEY PAYOUT_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY AGENT_PRIVATE_KEY
[[ -d $MEIGI/apps/landing/node_modules/viem ]] || fail "viem is not installed in apps/landing"
[[ $FORK_URL =~ ^https?://[^/?]+/?$ ]] || echo "warning: FORK_URL has a path or query; prefer a keyless endpoint" >&2
TMP="$(mktemp -d)"
anvil --fork-url "$FORK_URL" --port "$PORT" --silent &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true; rm -rf "$TMP"' EXIT
export RPC_URL="http://127.0.0.1:$PORT"
for _ in $(seq 1 150); do cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1 && break; sleep 0.2; done
[[ $(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null) == 11155111 ]] || fail "the anvil fork of Sepolia did not start on port $PORT"

set -a
# shellcheck source=/dev/null
source "$HERE/deployments/beta.env"
set +a
export FOUNDRY_ETH_RPC_URL="$RPC_URL" FOUNDRY_BROADCAST="$TMP/broadcast" T_NUMBER="$T"
REGISTRY="$(jq -r .registry "$MEIGI/contracts/deployments/11155111.json")"
PAYOUT_ADDRESS="$(cast call "$REGISTRY" "payoutOf(uint64)(address)" "$T" --rpc-url "$RPC_URL")"
ETH_REGISTRY="$(cast call "$ENS_REGISTRAR" "ETH_REGISTRY()(address)" --rpc-url "$RPC_URL")"
DEPLOYER_ADDRESS="$(cast call "$ETH_REGISTRY" "getOwner(uint256)(address)" "$(cast keccak payee)" --rpc-url "$RPC_URL")"
export PAYOUT_ADDRESS DEPLOYER_ADDRESS
for who in "$DEPLOYER_ADDRESS" "$PAYOUT_ADDRESS"; do cast rpc anvil_impersonateAccount "$who" --rpc-url "$RPC_URL" >/dev/null; done
echo "Fork block $(cast block-number --rpc-url "$RPC_URL"); $NAME -> payout $PAYOUT_ADDRESS"

step "Before: the reference names, and getEnsName(payout)"
BEFORE="$(snapshot)" || fail "viem failed"
primary "$PAYOUT_ADDRESS"

step "ens.sh payout-name, part 1 (deployer): gas for the payout wallet"
out="$(forge_as "$DEPLOYER_ADDRESS" "fund()")" || fail "fund failed: $out"
grep -E "Funded|already has gas" <<<"$out" || fail "fund printed nothing: $out"

step "ens.sh payout-name, part 2 (the wallet itself): claim its reverse node and set the name"
out="$(forge_as "$PAYOUT_ADDRESS" "name()")" || fail "name failed: $out"
grep -E "primary name" <<<"$out" || fail "name printed nothing: $out"

step "After: stock viem getEnsName(payout) and UniversalResolver.reverse"
out="$(primary "$PAYOUT_ADDRESS")" || fail "viem failed: $out"
echo "$out"
jq -e --arg n "$NAME" '.name == $n' <<<"$out" >/dev/null || fail "getEnsName did not return $NAME"
reverse="$(cast call "$ENS_UNIVERSAL_RESOLVER" "reverse(bytes,uint256)(string,address,address)" "$PAYOUT_ADDRESS" 60 --rpc-url "$RPC_URL")"
[[ $(head -1 <<<"$reverse") == "\"$NAME\"" ]] || fail "UniversalResolver.reverse did not return $NAME"
[[ "$(snapshot)" == "$BEFORE" ]] || fail "a reference name resolves differently"
echo "reference names unchanged"

step "Payout primary name fork proof passed: $PAYOUT_ADDRESS -> $NAME"
