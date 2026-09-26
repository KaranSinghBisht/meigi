#!/usr/bin/env bash
# Fork proof for ENSIP-25 on the AP agent. On an anvil fork of Sepolia it impersonates the deployer (the admin of
# ap.meigi.eth's resolver; no key is read), registers the agent in the live ERC-8004 IdentityRegistry, links it to
# ap.meigi.eth, and then runs the ENSIP-25 check with stock viem: the agent's registration file names ap.meigi.eth,
# and ap.meigi.eth carries agent-registration[<registry>][<agentId>]. Nothing is sent to a real network.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEIGI="$(cd "$HERE/../../.." && pwd)"
FORK_URL="${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8627}"

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo "agent-ensip25-e2e: $*" >&2
  exit 1
}
forge_as() { # $1 = signature
  (cd "$MEIGI/contracts" && forge script script/ens/AgentIdentity.s.sol --sig "$1" --broadcast --slow --unlocked \
    --sender "$DEPLOYER_ADDRESS") 2>&1
}

unset DEPLOYER_PRIVATE_KEY AGENT_8004_ID
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
export FOUNDRY_ETH_RPC_URL="$RPC_URL" FOUNDRY_BROADCAST="$TMP/broadcast"
ETH_REGISTRY="$(cast call "$ENS_REGISTRAR" "ETH_REGISTRY()(address)" --rpc-url "$RPC_URL")"
DEPLOYER_ADDRESS="$(cast call "$ETH_REGISTRY" "getOwner(uint256)(address)" "$(cast keccak meigi)" --rpc-url "$RPC_URL")"
SUBREGISTRY="$(cast call "$ETH_REGISTRY" "getSubregistry(string)(address)" meigi --rpc-url "$RPC_URL")"
AGENT_RESOLVER="$(cast call "$SUBREGISTRY" "getResolver(string)(address)" ap --rpc-url "$RPC_URL")"
export DEPLOYER_ADDRESS AGENT_RESOLVER
cast rpc anvil_impersonateAccount "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL" >/dev/null
echo "Fork block $(cast block-number --rpc-url "$RPC_URL"); deployer $DEPLOYER_ADDRESS; resolver $AGENT_RESOLVER"

step "Register the AP agent in the ERC-8004 IdentityRegistry (its registration file names ap.meigi.eth)"
out="$(forge_as "register()")" || fail "register failed: $out"
grep -E "Registered the AP agent" <<<"$out" || fail "register printed nothing: $out"
topic="$(cast keccak 'Registered(uint256,string,address)')"
id="$(jq -r --arg t "$topic" '[.receipts[].logs[] | select(.topics[0] == $t)][0].topics[1]' \
  "$TMP/broadcast/AgentIdentity.s.sol/11155111/register-latest.json")"
[[ $id =~ ^0x[0-9a-fA-F]{64}$ ]] || fail "no Registered event in the receipt"
AGENT_8004_ID="$(cast to-dec "$id")"
export AGENT_8004_ID
echo "agent id $AGENT_8004_ID (from the receipt)"

step "Link: ap.meigi.eth gets agent-registration[<registry>][$AGENT_8004_ID] = 1"
out="$(forge_as "link()")" || fail "link failed: $out"
grep -E "agent-registration" <<<"$out" || fail "link printed nothing: $out"

step "ENSIP-25 check with stock viem, from the registry's side"
out="$(cd "$MEIGI/apps/landing" && AGENT_ID="$AGENT_8004_ID" node --input-type=module <"$HERE/check-agent-8004-viem.mjs")" ||
  fail "viem failed: $out"
echo "$out"
vault="$(jq -r .vault "$MEIGI/contracts/deployments/11155111.json")"
jq -e --arg v "$vault" '.verified and .ens == "ap.meigi.eth" and .value == "1" and (.address | ascii_downcase) == ($v | ascii_downcase)' \
  <<<"$out" >/dev/null || fail "the ENSIP-25 check did not verify"

step "ENSIP-25 fork proof passed: ERC-8004 agent $AGENT_8004_ID <-> ap.meigi.eth"
