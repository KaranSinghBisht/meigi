#!/usr/bin/env bash
# Fork proof for the AgentVault's primary name. On an anvil fork of Sepolia it impersonates the vault's Ownable owner
# (no key is read), runs VaultName.s.sol, and then checks that stock viem getEnsName(vault) and the UniversalResolver
# both return ap.meigi.eth. Nothing is sent to a real network.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEIGI="$(cd "$HERE/../../.." && pwd)"
FORK_URL="${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8577}"
NAME="${VAULT_NAME:-ap.meigi.eth}"

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo "vault-e2e: $*" >&2
  exit 1
}
primary() { # stock viem getEnsName for $1
  (cd "$MEIGI/apps/landing" && ENS_ADDRESS="$1" node --input-type=module <"$HERE/check-primary-viem.mjs")
}

unset VAULT_OWNER_PRIVATE_KEY DEPLOYER_PRIVATE_KEY AGENT_PRIVATE_KEY ATTESTER_PRIVATE_KEY
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
VAULT="$(jq -r .vault "$MEIGI/contracts/deployments/11155111.json")"
OWNER="$(cast call "$VAULT" "owner()(address)" --rpc-url "$RPC_URL")"
cast rpc anvil_impersonateAccount "$OWNER" --rpc-url "$RPC_URL" >/dev/null
echo "Fork block $(cast block-number --rpc-url "$RPC_URL"); vault $VAULT; owner $OWNER (impersonated)"

step "Before: stock viem getEnsName(vault)"
out="$(primary "$VAULT")" || fail "viem failed: $out"
echo "$out"

step "VaultName.s.sol as the vault's owner: claim <vault>.addr.reverse, set the name, set the ENSIP-19 default"
out="$( (cd "$MEIGI/contracts" && VAULT_OWNER_ADDRESS="$OWNER" forge script script/ens/VaultName.s.sol \
  --broadcast --slow --unlocked --sender "$OWNER") 2>&1)" || fail "VaultName failed: $out"
grep -E "primary name|ONCHAIN" <<<"$out" || fail "VaultName printed no result: $out"

step "After: stock viem getEnsName(vault) and UniversalResolver.reverse(vault, 60)"
out="$(primary "$VAULT")" || fail "viem failed: $out"
echo "$out"
jq -e --arg n "$NAME" '.name == $n' <<<"$out" >/dev/null || fail "viem getEnsName did not return $NAME"
reverse="$(cast call "$ENS_UNIVERSAL_RESOLVER" "reverse(bytes,uint256)(string,address,address)" "$VAULT" 60 --rpc-url "$RPC_URL")"
echo "$reverse"
[[ $(head -1 <<<"$reverse") == "\"$NAME\"" ]] || fail "UniversalResolver.reverse did not return $NAME"

step "Vault primary name fork proof passed: $VAULT -> $NAME"
