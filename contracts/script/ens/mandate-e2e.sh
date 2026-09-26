#!/usr/bin/env bash
# Fork proof for the AP agent's mandate (MandateGate). On an anvil fork of Sepolia it impersonates Meigi's deployer,
# the registry's attester, the vault's owner, the live agent key and a throwaway business key for the buyer fixture
# 株式会社ハルカ製作所 (T4999900000005); no key is read. It runs the ens.sh mandate steps through the same scripts:
#   deploy the CompanyNamespace gate; register and claim the buyer; open and attach its namespace; issue
#   ap.t4999900000005.payee.eth to the agent key; deploy the MandateGate and make it the live vault's agent.
# Then the agent pays 株式会社メイギ商事 through the gate, the company revokes the mandate and the next payment
# reverts MandateNotLive, it issues the mandate again and the agent pays, and unwire hands the vault its key back.
# The seven reference names resolve as before. Nothing is sent to a real network.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEIGI="$(cd "$HERE/../../.." && pwd)"
FORK_URL="${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8615}"
HARUKA=4999900000005
SHOJI=2011001234567
REFERENCE="2011001234567 3999905000001 2010401000001 9999999999999 8999900000001 6999900000003"

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo "mandate-e2e: $*" >&2
  exit 1
}
viem() { # $1 = script, then VAR=value pairs for it
  local script="$1"
  shift
  (cd "$MEIGI/apps/landing" && env "$@" node --input-type=module <"$HERE/$script")
}
snapshot() {
  local t
  for t in $REFERENCE; do viem check-viem.mjs ENS_NAME="t$t.payee.eth" || return 1; done
  viem check-agent-viem.mjs ENS_NAME=ap.meigi.eth
}
forge_as() { # $1 = script, $2 = sender, $3 = signature
  (cd "$MEIGI/contracts" && forge script "script/ens/$1" --sig "$3" --broadcast --slow --unlocked --sender "$2") 2>&1
}
pay() { # $1 = invoice reference seed: sends as the agent key, prints the tx status
  cast send "$MANDATE_GATE" "payInvoice(uint64,address,uint256,bytes32)" "$SHOJI" "$SHOJI_PAYOUT" 1000000000000000000000 \
    "$(cast keccak "e2e:mandate:$1")" --from "$AGENT_ADDRESS" --unlocked --rpc-url "$RPC_URL" --json | jq -r .status
}

unset DEPLOYER_PRIVATE_KEY ATTESTER_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY NS_HARUKA_PRIVATE_KEY AGENT_PRIVATE_KEY
[[ -d $MEIGI/apps/landing/node_modules/viem ]] || fail "viem is not installed in apps/landing"
TMP="$(mktemp -d)"
anvil --fork-url "$FORK_URL" --port "$PORT" --silent &
ANVIL_PID=$!
trap 'kill "$ANVIL_PID" 2>/dev/null || true; rm -rf "$TMP"' EXIT
export RPC_URL="http://127.0.0.1:$PORT"
for _ in $(seq 1 150); do cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1 && break; sleep 0.2; done
[[ $(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null) == 11155111 ]] || fail "the anvil fork of Sepolia did not start on port $PORT"
[[ $(cast client --rpc-url "$RPC_URL") == anvil/* ]] || fail "$RPC_URL is not our anvil fork"

set -a
# shellcheck source=/dev/null
source "$HERE/deployments/beta.env"
set +a
export FOUNDRY_ETH_RPC_URL="$RPC_URL" FOUNDRY_BROADCAST="$TMP/broadcast"
ETH_REGISTRY="$(cast call "$ENS_REGISTRAR" "ETH_REGISTRY()(address)" --rpc-url "$RPC_URL")"
DEPLOYER_ADDRESS="$(cast call "$ETH_REGISTRY" "getOwner(uint256)(address)" "$(cast keccak payee)" --rpc-url "$RPC_URL")"
REGISTRY="$(cast call "$CLAIMS_RESOLVER" "registry()(address)" --rpc-url "$RPC_URL")"
AGENT_VAULT="$(jq -r .vault "$MEIGI/contracts/deployments/11155111.json")"
VAULT_OWNER_ADDRESS="$(cast call "$AGENT_VAULT" "owner()(address)" --rpc-url "$RPC_URL")"
AGENT_ADDRESS="$(cast call "$AGENT_VAULT" "agent()(address)" --rpc-url "$RPC_URL")"
ATTESTER_ADDRESS="${ATTESTER_ADDRESS:-0x3D5F314C30E77CC6f3677C5409FdC91e83510493}"
SHOJI_PAYOUT="$(cast call "$REGISTRY" "payoutOf(uint64)(address)" "$SHOJI" --rpc-url "$RPC_URL")"
NS_HARUKA_ADDRESS="$(cast wallet new --json | jq -r '.[0].address')"
NS_HARUKA_PAYOUT_ADDRESS="$(cast wallet new --json | jq -r '.[0].address')"
NS_AP_ADDRESS="$(cast wallet new --json | jq -r '.[0].address')" # CompanyNames.s.sol's fund() needs one
export DEPLOYER_ADDRESS ATTESTER_ADDRESS VAULT_OWNER_ADDRESS AGENT_ADDRESS AGENT_VAULT NS_HARUKA_ADDRESS \
  NS_HARUKA_PAYOUT_ADDRESS NS_AP_ADDRESS T_NUMBER="$HARUKA" COMPANY_FUND_WEI=10000000000000000
for who in "$DEPLOYER_ADDRESS" "$ATTESTER_ADDRESS" "$VAULT_OWNER_ADDRESS" "$AGENT_ADDRESS" "$NS_HARUKA_ADDRESS"; do
  cast rpc anvil_impersonateAccount "$who" --rpc-url "$RPC_URL" >/dev/null
  cast rpc anvil_setBalance "$who" 0x16345785d8a0000 --rpc-url "$RPC_URL" >/dev/null # 0.1 ETH, fork only
done
echo "Fork block $(cast block-number --rpc-url "$RPC_URL"); vault $AGENT_VAULT, agent key $AGENT_ADDRESS"

step "Before: the seven reference names"
BEFORE="$(snapshot)" || fail "viem failed"

step "The CompanyNamespace gate; the buyer registered, claimed, its namespace opened and attached"
out="$(forge_as CompanyNames.s.sol "$DEPLOYER_ADDRESS" "deploy()")" || fail "deploy failed: $out"
COMPANY_NAMESPACE="$(grep -oE 'COMPANY_NAMESPACE=0x[0-9a-fA-F]{40}' <<<"$out" | cut -d= -f2)"
export COMPANY_NAMESPACE
for pair in "Mandate.s.sol $ATTESTER_ADDRESS register()" "ClaimName.s.sol $DEPLOYER_ADDRESS claim()" \
  "Mandate.s.sol $NS_HARUKA_ADDRESS open()" "Mandate.s.sol $DEPLOYER_ADDRESS attach()" \
  "Mandate.s.sol $NS_HARUKA_ADDRESS issue()" "Mandate.s.sol $DEPLOYER_ADDRESS deploy()"; do
  read -r script sender sig <<<"$pair"
  out="$(forge_as "$script" "$sender" "$sig")" || fail "$sig failed: $out"
  grep -E "registered|claimed|namespace|subregistry|issued|MANDATE_GATE" <<<"$out" | sed 's/^ *//'
done
MANDATE_GATE="$(grep -oE 'MANDATE_GATE=0x[0-9a-fA-F]{40}' <<<"$out" | cut -d= -f2)"
[[ -n $MANDATE_GATE ]] || fail "deploy printed no gate"
export MANDATE_GATE
out="$(forge_as Mandate.s.sol "$VAULT_OWNER_ADDRESS" "wire()")" || fail "wire failed: $out"
grep "agent =" <<<"$out" | sed 's/^ *//'

step "The agent pays through the gate; revoked, it can't; issued again, it pays"
[[ $(pay first) == 0x1 ]] || fail "a live mandate did not pay"
echo "paid while the mandate answers"
out="$(forge_as Mandate.s.sol "$NS_HARUKA_ADDRESS" "revoke()")" || fail "revoke failed: $out"
err="$(cast call "$MANDATE_GATE" "payInvoice(uint64,address,uint256,bytes32)" "$SHOJI" "$SHOJI_PAYOUT" \
  1000000000000000000000 "$(cast keccak e2e:mandate:second)" --from "$AGENT_ADDRESS" --rpc-url "$RPC_URL" 2>&1 || true)"
grep -q "$(cast sig 'MandateNotLive(uint64,string)')" <<<"$err" || fail "a revoked mandate was not refused: $err"
echo "refused: MandateNotLive"
out="$(forge_as Mandate.s.sol "$NS_HARUKA_ADDRESS" "issue()")" || fail "re-issue failed: $out"
[[ $(pay second) == 0x1 ]] || fail "the re-issued mandate did not pay"
echo "paid again after re-issue"
out="$(cd "$MEIGI/contracts" && forge script script/ens/Mandate.s.sol --sig "check()" 2>&1)" || fail "check failed: $out"
grep -E "answers|gate" <<<"$out" | sed 's/^ *//'

step "unwire: the vault's agent is its key again; the reference names are unchanged"
out="$(forge_as Mandate.s.sol "$VAULT_OWNER_ADDRESS" "unwire()")" || fail "unwire failed: $out"
[[ $(cast call "$AGENT_VAULT" "agent()(address)" --rpc-url "$RPC_URL") == "$AGENT_ADDRESS" ]] || fail "unwire did not restore the key"
[[ "$(snapshot)" == "$BEFORE" ]] || fail "a reference name resolves differently"

step "Mandate fork proof passed (gate $MANDATE_GATE)"
