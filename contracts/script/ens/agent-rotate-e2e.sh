#!/usr/bin/env bash
# Fork proof that the AP agent's identity survives a change of key. On an anvil fork of Sepolia, against the live
# ap.meigi.eth and AgentVault, it impersonates the resolver's admin (the deployer) and the vault's owner (no key is
# read), makes a fresh key the new agent with the two steps of `ens.sh agent-rotate`, and then checks the points below.
# While the MandateGate is the vault's agent, it first checks that agent-rotate refuses, then unwires on the fork.
#   - the old key's setText(agent-status) reverts EACUnauthorizedAccountRoles, and it can no longer pay from the vault;
#   - the new key sets agent-status through `ens.sh agent-status`, and holds exactly that one scoped role;
#   - stock viem: ap.meigi.eth still resolves to the vault with the same records, and getEnsName(vault) is still
#     ap.meigi.eth.
# Nothing is sent to a real network.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEIGI="$(cd "$HERE/../../.." && pwd)"
FORK_URL="${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8597}"
NAME=ap.meigi.eth
STATUS="online (rotated key)"

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo "agent-rotate-e2e: $*" >&2
  exit 1
}
viem() { # $1 = script, then env assignments
  local script="$1"
  shift
  (cd "$MEIGI/apps/landing" && env "$@" node --input-type=module <"$HERE/$script")
}
forge_as() { # $1 = sender, $2 = signature; runs AgentNamespace.s.sol as that impersonated sender
  (cd "$MEIGI/contracts" && forge script script/ens/AgentNamespace.s.sol --sig "$2" --broadcast --slow --unlocked \
    --sender "$1") 2>&1
}
# DNS wire format of a dotted name, as hex.
dns() {
  local out="" label
  while IFS= read -r label; do
    out+="$(printf '%02x' ${#label})$(printf '%s' "$label" | xxd -p)"
  done < <(tr '.' '\n' <<<"$1")
  echo "0x${out}00"
}
# eth_call from $1 must revert with exactly the ABI-encoded error $2 (hex). cast prints custom errors as
# "0x<selector>: <arguments>" or as one hex string, so both are normalised before comparing.
reverts_with() {
  local from="$1" want sel err data
  want="$(tr '[:upper:]' '[:lower:]' <<<"$2")"
  sel="${want:0:10}"
  shift 2
  if err="$(cast call --from "$from" "$@" --rpc-url "$RPC_URL" 2>&1)"; then fail "expected a revert from $from: $*"; fi
  data="$( (grep -Eio "${sel}[0-9a-f: ]*" <<<"$err" || true) | head -1 | tr -d ': ' | tr '[:upper:]' '[:lower:]')"
  [[ $data == "$want" ]] || fail "reverted with something else: $err"
}

unset DEPLOYER_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY AGENT_PRIVATE_KEY ATTESTER_PRIVATE_KEY AGENT_PREVIOUS_ADDRESS
[[ -d $MEIGI/apps/landing/node_modules/viem ]] || fail "viem is not installed in apps/landing"
[[ $FORK_URL =~ ^https?://[^/?]+/?$ ]] || echo "warning: FORK_URL has a path or query; prefer a keyless endpoint" >&2
TMP="$(mktemp -d)"
anvil --fork-url "$FORK_URL" --port "$PORT" --mnemonic-random --config-out "$TMP/anvil.json" --silent &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true; rm -rf "$TMP"' EXIT
export RPC_URL="http://127.0.0.1:$PORT"
for _ in $(seq 1 150); do
  if cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1 && [[ -s $TMP/anvil.json ]]; then break; fi
  sleep 0.2
done
[[ $(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null) == 11155111 ]] || fail "the anvil fork of Sepolia did not start on port $PORT"

set -a
# shellcheck source=/dev/null
source "$HERE/deployments/beta.env"
set +a
export FOUNDRY_ETH_RPC_URL="$RPC_URL" FOUNDRY_BROADCAST="$TMP/broadcast"
call() { cast call "$@" --rpc-url "$RPC_URL"; }
ETH_REGISTRY="$(call "$ENS_REGISTRAR" "ETH_REGISTRY()(address)")"
AGENT_SUBREGISTRY="$(call "$ETH_REGISTRY" "getSubregistry(string)(address)" meigi)"
AGENT_RESOLVER="$(call "$AGENT_SUBREGISTRY" "getResolver(string)(address)" ap)"
DEPLOYER_ADDRESS="$(call "$ETH_REGISTRY" "getOwner(uint256)(address)" "$(cast keccak meigi)")"
VAULT="$(jq -r .vault "$MEIGI/contracts/deployments/11155111.json")"
VAULT_OWNER_ADDRESS="$(call "$VAULT" "owner()(address)")"
OLD_AGENT="$(call "$VAULT" "agent()(address)")"
GATE=""
if [[ $(cast code "$OLD_AGENT" --rpc-url "$RPC_URL") != 0x ]]; then
  # Since 2026-09-26 the vault's agent is the MandateGate; the key is the mandate's holder.
  GATE="$OLD_AGENT"
  OLD_AGENT="$(call "$GATE" "holder()(address)")"
  [[ $OLD_AGENT != 0x0000000000000000000000000000000000000000 ]] || fail "the gate's mandate is dark: no key to rotate"
fi
NEW_KEY="$(jq -r '.private_keys[0]' "$TMP/anvil.json")"
NEW_AGENT="$(jq -r '.available_accounts[0]' "$TMP/anvil.json")"
export AGENT_SUBREGISTRY AGENT_RESOLVER DEPLOYER_ADDRESS VAULT_OWNER_ADDRESS
for who in "$DEPLOYER_ADDRESS" "$VAULT_OWNER_ADDRESS"; do cast rpc anvil_impersonateAccount "$who" --rpc-url "$RPC_URL" >/dev/null; done
echo "Fork block $(cast block-number --rpc-url "$RPC_URL"); resolver $AGENT_RESOLVER; vault $VAULT"
echo "old agent $OLD_AGENT -> new agent $NEW_AGENT (a fresh key)"

step "Before: stock viem for $NAME and getEnsName(vault)"
before="$(viem check-agent-viem.mjs ENS_NAME="$NAME")" || fail "viem failed: $before"
echo "$before"
primary="$(viem check-primary-viem.mjs ENS_ADDRESS="$VAULT")" || fail "viem failed: $primary"
echo "$primary"
jq -e --arg n "$NAME" '.name == $n' <<<"$primary" >/dev/null || fail "getEnsName(vault) is not $NAME before the rotation"

if [[ -n $GATE ]]; then
  step "With the MandateGate wired, agent-rotate refuses before touching the ENS role"
  if out="$(AGENT_ADDRESS="$NEW_AGENT" AGENT_PREVIOUS_ADDRESS="$OLD_AGENT" forge_as "$DEPLOYER_ADDRESS" "rotate()")"; then
    fail "rotate ran while the gate is the vault's agent"
  fi
  grep -q "MandateGate is wired" <<<"$out" || fail "rotate refused for another reason: $out"
  echo "refused: the vault's agent is the gate $GATE"
  step "On the fork only: unwire, as ens.sh mandate-unwire would (the vault's owner hands the slot back to the key)"
  cast send "$VAULT" "setAgent(address)" "$OLD_AGENT" --from "$VAULT_OWNER_ADDRESS" --unlocked --rpc-url "$RPC_URL" >/dev/null
fi

step "ens.sh agent-rotate, part 1 (deployer): agent-status role to the new key, revoked from the old one"
out="$(AGENT_ADDRESS="$NEW_AGENT" AGENT_PREVIOUS_ADDRESS="$OLD_AGENT" forge_as "$DEPLOYER_ADDRESS" "rotate()")" ||
  fail "rotate failed: $out"
grep -E "granted to" <<<"$out" || fail "rotate printed nothing: $out"

step "ens.sh agent-rotate, part 2 (vault owner): the vault's agent slot moves to the new key"
out="$(AGENT_ADDRESS="$NEW_AGENT" AGENT_PREVIOUS_ADDRESS="$OLD_AGENT" forge_as "$VAULT_OWNER_ADDRESS" "rotateVault()")" ||
  fail "rotateVault failed: $out"
grep -E "AgentVault .* agent =" <<<"$out" || fail "rotateVault printed nothing: $out"

step "The old key is out: the node refuses its agent-status write and its payment"
status_resource="$(cast keccak agent-status)"
eac="$(cast calldata 'EACUnauthorizedAccountRoles(uint256,uint256,address)' "$status_resource" 16 "$OLD_AGENT")"
reverts_with "$OLD_AGENT" "$eac" "$AGENT_RESOLVER" "setText(bytes,string,string)" "$(dns "$NAME")" agent-status "stale key"
echo "old key setText(agent-status) -> EACUnauthorizedAccountRoles(keccak(agent-status), 16, $OLD_AGENT)"
not_agent="$(cast calldata 'NotAgent(address)' "$OLD_AGENT")"
reverts_with "$OLD_AGENT" "$not_agent" "$VAULT" "payInvoice(uint64,address,uint256,bytes32)" 2011001234567 \
  0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4 1 0x"$(printf '%064x' 1)"
echo "old key payInvoice -> NotAgent($OLD_AGENT)"

step "The new key writes agent-status itself, through ens.sh agent-status"
out="$(SKIP_DOTENV=1 BROADCAST=1 AGENT_PRIVATE_KEY="$NEW_KEY" AGENT_ADDRESS="$NEW_AGENT" AGENT_STATUS="$STATUS" \
  "$HERE/ens.sh" agent-status)" || fail "agent-status with the new key failed: $out"
grep -E "agent-status =" <<<"$out" || fail "agent-status printed nothing: $out"

step "CheckAgent (read-only): the new key holds exactly the agent-status role, the old one none"
out="$( (cd "$MEIGI/contracts" && AGENT_ADDRESS="$NEW_AGENT" AGENT_PREVIOUS_ADDRESS="$OLD_AGENT" EXPECT_STATUS="$STATUS" \
  forge script script/ens/CheckAgent.s.sol) 2>&1)" || fail "CheckAgent failed: $out"
grep -E "Agent 0x|Rotated-out|agent-status =" <<<"$out" || fail "CheckAgent printed nothing: $out"

step "After: stock viem, same name, same address, same records; only agent-status is the new key's"
after="$(viem check-agent-viem.mjs ENS_NAME="$NAME")" || fail "viem failed: $after"
echo "$after"
jq -e --argjson b "$before" --arg s "$STATUS" \
  '.address == $b.address and (.texts | del(.["agent-status"])) == ($b.texts | del(.["agent-status"])) and .texts["agent-status"] == $s' \
  <<<"$after" >/dev/null || fail "$NAME changed beyond agent-status"
primary="$(viem check-primary-viem.mjs ENS_ADDRESS="$VAULT")" || fail "viem failed: $primary"
echo "$primary"
jq -e --arg n "$NAME" '.name == $n' <<<"$primary" >/dev/null || fail "getEnsName(vault) changed"
lower() { tr '[:upper:]' '[:lower:]' <<<"$1"; }
[[ $(lower "$(call "$VAULT" "agent()(address)")") == "$(lower "$NEW_AGENT")" ]] || fail "the vault's agent is not the new key"

step "Agent key rotation fork proof passed: $NAME unchanged, $OLD_AGENT out, $NEW_AGENT in"
