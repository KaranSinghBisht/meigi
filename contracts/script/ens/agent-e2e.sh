#!/usr/bin/env bash
# Fork proof for the AP agent's ENSv2 namespace on the Beta. It deploys a UserRegistry and a PermissionedResolver
# through the VerifiableFactory, registers <parent>.eth with that subregistry and no resolver, creates ap.<parent>.eth,
# and grants the agent key ROLE_SET_TEXT on `agent-status` only. The agent then sets agent-status, while its writes
# to agent-context and addr revert. Stock viem resolves the name, and t2011001234567.payee.eth is unchanged.
# meigi.eth itself is live on Sepolia, so the fork uses a fresh parent label (AGENT_PARENT) by default.
# Nothing is sent to a real network and .env is never read (signers come from a random mnemonic).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEIGI="$(cd "$HERE/../../.." && pwd)"
FORK_URL="${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8557}"
STATUS="online (fork proof)"

# Start clean: leftovers from a real run would point the fork at the live proxies.
unset AGENT_SUBREGISTRY AGENT_RESOLVER AGENT_PREVIOUS_ADDRESS ENS_SUBREGISTRY PAYEE_RESOLVER ENS_SECRET ENS_OWNER
unset ENS_NAME EXPECT_STATUS AGENT_STATUS
export AGENT_PARENT="${AGENT_PARENT:-meigifork$RANDOM}" AGENT_LABEL=ap
AGENT_NAME="ap.$AGENT_PARENT.eth"

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo "agent-e2e: $*" >&2
  exit 1
}
parse_addr() { grep -Eo "$1=0x[0-9a-fA-F]{40}" <<<"$2" | head -1 | cut -d= -f2 || true; }
show() { grep -E "$1" <<<"$2" || fail "expected /$1/ in: $2"; }
# DNS wire format of a dotted name, as hex.
dns() {
  local out="" label
  while IFS= read -r label; do
    out+="$(printf '%02x' ${#label})$(printf '%s' "$label" | xxd -p)"
  done < <(tr '.' '\n' <<<"$1")
  echo "0x${out}00"
}

[[ $FORK_URL =~ ^https?://[^/?]+/?$ ]] || echo "warning: FORK_URL has a path or query; prefer a keyless endpoint" >&2
TMP="$(mktemp -d)"
anvil --fork-url "$FORK_URL" --port "$PORT" --mnemonic-random --config-out "$TMP/anvil.json" --silent &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true; rm -rf "$TMP"' EXIT

export RPC_URL="http://127.0.0.1:$PORT" SKIP_DOTENV=1 BROADCAST=1 FAST_FORWARD=1 ENS_DEPLOYMENT=beta
export FOUNDRY_BROADCAST="$TMP/broadcast"
for _ in $(seq 1 150); do
  if cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1 && [[ -s $TMP/anvil.json ]]; then break; fi
  sleep 0.2
done
[[ $(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null) == 11155111 ]] || fail "the anvil fork of Sepolia did not start on port $PORT"

DEPLOYER_PRIVATE_KEY="$(jq -r '.private_keys[0]' "$TMP/anvil.json")" DEPLOYER_ADDRESS="$(jq -r '.available_accounts[0]' "$TMP/anvil.json")"
AGENT_PRIVATE_KEY="$(jq -r '.private_keys[1]' "$TMP/anvil.json")" AGENT_ADDRESS="$(jq -r '.available_accounts[1]' "$TMP/anvil.json")"
export DEPLOYER_PRIVATE_KEY DEPLOYER_ADDRESS AGENT_PRIVATE_KEY AGENT_ADDRESS
echo "Fork block $(cast block-number --rpc-url "$RPC_URL"); name $AGENT_NAME; deployer $DEPLOYER_ADDRESS; agent $AGENT_ADDRESS"

step "Deploy the namespace's UserRegistry and the agent's PermissionedResolver (VerifiableFactory proxies)"
out="$("$HERE/ens.sh" agent-deploy)" || fail "agent-deploy failed: $out"
AGENT_SUBREGISTRY="$(parse_addr AGENT_SUBREGISTRY "$out")" AGENT_RESOLVER="$(parse_addr AGENT_RESOLVER "$out")"
[[ -n $AGENT_SUBREGISTRY && -n $AGENT_RESOLVER ]] || fail "agent-deploy printed no addresses: $out"
export AGENT_SUBREGISTRY AGENT_RESOLVER
echo "AGENT_SUBREGISTRY=$AGENT_SUBREGISTRY AGENT_RESOLVER=$AGENT_RESOLVER"

step "Register $AGENT_PARENT.eth as a namespace: subregistry = the UserRegistry, no resolver"
out="$(ENS_LABEL="$AGENT_PARENT" ENS_SUBREGISTRY="$AGENT_SUBREGISTRY" "$HERE/ens.sh" register)" || fail "register failed: $out"
show "Registered|Fee" "$out"

step "Create $AGENT_NAME and grant the agent ROLE_SET_TEXT on agent-status only"
out="$("$HERE/ens.sh" agent-setup)" || fail "agent-setup failed: $out"
show "is set up" "$out"

step "The agent's own key sets agent-status"
out="$(AGENT_STATUS="$STATUS" "$HERE/ens.sh" agent-status)" || fail "agent-status failed: $out"
show "agent-status =" "$out"

step "Check records, the agent's scope and payee.eth (read-only; denied writes simulated from the agent)"
EXPECT_STATUS="$STATUS" "$HERE/ens.sh" agent-check

# eth_call from the agent's address must revert EACUnauthorizedAccountRoles(resource, role, agent) exactly.
# $1 = label, $2 = expected resource, $3 = role bit, then the cast call signature and arguments.
denied() {
  local label="$1" resource="$2" role="$3" err data want
  shift 3
  if err="$(cast call --from "$AGENT_ADDRESS" "$AGENT_RESOLVER" "$@" --rpc-url "$RPC_URL" 2>&1)"; then
    fail "the agent's $label did not revert"
  fi
  data="$( (grep -Eo '0x4b27a133[0-9a-fA-F: ]*' <<<"$err" || true) | head -1 | tr -d ': ' | tr '[:upper:]' '[:lower:]')"
  want="$(cast calldata 'EACUnauthorizedAccountRoles(uint256,uint256,address)' "$resource" "$role" "$AGENT_ADDRESS")"
  [[ $data == "$(tr '[:upper:]' '[:lower:]' <<<"$want")" ]] || fail "$label reverted with something else: $err"
  echo "$label -> EACUnauthorizedAccountRoles(resource $resource, role $role, $AGENT_ADDRESS)"
}

step "The node itself refuses the agent (eth_call from the agent's address)"
name="$(dns "$AGENT_NAME")"
denied "setText agent-context" "$(cast keccak agent-context)" 16 "setText(bytes,string,string)" "$name" agent-context x
denied "setAddress 60" "$(cast keccak "$(cast to-uint256 60)")" 1 "setAddress(bytes,uint256,bytes)" "$name" 60 "$AGENT_ADDRESS"

step "Stock viem (no overrides): $AGENT_NAME, and payee.eth unchanged"
if [[ ! -d $MEIGI/apps/landing/node_modules/viem ]]; then
  echo "viem not installed; skipped"
else
  out="$(cd "$MEIGI/apps/landing" && ENS_NAME="$AGENT_NAME" node --input-type=module <"$HERE/check-agent-viem.mjs")" ||
    fail "viem failed: $out"
  echo "$out"
  vault="$(jq -r .vault "$MEIGI/contracts/deployments/11155111.json")"
  jq -e --arg v "$vault" --arg s "$STATUS" \
    '(.address | ascii_downcase) == ($v | ascii_downcase) and .texts["agent-status"] == $s and .texts["meigi.payees"] == "payee.eth"' \
    <<<"$out" >/dev/null || fail "viem resolved $AGENT_NAME unexpectedly"
  out="$(cd "$MEIGI/apps/landing" && node --input-type=module <"$HERE/check-viem.mjs")" || fail "viem failed: $out"
  echo "$out"
  registry="$(jq -r .registry "$MEIGI/contracts/deployments/11155111.json")"
  payout="$(cast call "$registry" "payoutOf(uint64)(address)" 2011001234567 --rpc-url "$RPC_URL")"
  jq -e --arg p "$payout" '(.address | ascii_downcase) == ($p | ascii_downcase)' <<<"$out" >/dev/null || fail "payee.eth changed"
fi

step "Agent namespace fork proof passed for $AGENT_NAME"
