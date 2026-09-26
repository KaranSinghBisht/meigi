#!/usr/bin/env bash
# Fork proof for company-issued names (CompanyNamespace). On an anvil fork of Sepolia it impersonates Meigi's deployer,
# the demo company's registry controller and throwaway holders (no key is read), runs the CompanyNames.s.sol steps
# (deploy, fund, open, attach, issue, primary), then checks with stock viem and cast that:
#   - ap, keiri and zeirishi.t2011001234567.payee.eth resolve to their holders with their texts, and getEnsName(ap's
#     holder) returns ap.t2011001234567.payee.eth;
#   - the AP agent sets its agent-status but not its description or address, and the company's key can't write the
#     name's resolver directly;
#   - a label shaped like another company's T-number is refused;
#   - the seven reference names (six payee names and ap.meigi.eth) resolve exactly as before;
#   - after 30 days zeirishi resolves to nothing, and so does keiri once revoked;
#   - detach (Meigi's brake) takes every issued name dark and leaves the reference names unchanged.
# Nothing is sent to a real network.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEIGI="$(cd "$HERE/../../.." && pwd)"
FORK_URL="${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8611}"
T=2011001234567
REFERENCE="2011001234567 3999905000001 2010401000001 9999999999999 8999900000001 6999900000003"

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo "names-e2e: $*" >&2
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
forge_as() { # $1 = sender, $2 = signature
  (cd "$MEIGI/contracts" && forge script script/ens/CompanyNames.s.sol --sig "$2" --broadcast --slow --unlocked \
    --sender "$1") 2>&1
}
# The DNS wire format of a dotted name, as hex for cast.
dns() {
  local out="0x" label
  IFS=. read -ra labels <<<"$1"
  for label in "${labels[@]}"; do out+="$(printf '%02x' "${#label}")$(printf '%s' "$label" | xxd -p | tr -d '\n')"; done
  echo "${out}00"
}
# Succeeds only if the transaction reverts.
refused() { ! cast send "$@" --rpc-url "$RPC_URL" >/dev/null 2>&1; }
resolved() { jq -r --arg l "$1" '.names[$l].address' <<<"$2"; }

unset DEPLOYER_PRIVATE_KEY COMPANY_PRIVATE_KEY NS_AP_PRIVATE_KEY AGENT_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY
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
export FOUNDRY_ETH_RPC_URL="$RPC_URL" FOUNDRY_BROADCAST="$TMP/broadcast" T_NUMBER="$T"
ETH_REGISTRY="$(cast call "$ENS_REGISTRAR" "ETH_REGISTRY()(address)" --rpc-url "$RPC_URL")"
DEPLOYER_ADDRESS="$(cast call "$ETH_REGISTRY" "getOwner(uint256)(address)" "$(cast keccak payee)" --rpc-url "$RPC_URL")"
REGISTRY="$(cast call "$CLAIMS_RESOLVER" "registry()(address)" --rpc-url "$RPC_URL")"
COMPANY_ADDRESS="$(cast call "$REGISTRY" "payeeOf(uint64)((string,address,address,address,uint64,address,uint64,uint64,uint8,uint8,bytes32))" "$T" --rpc-url "$RPC_URL" | sed -nE 's/^\("[^"]*", (0x[0-9a-fA-F]{40}),.*/\1/p')"
[[ $COMPANY_ADDRESS =~ ^0x[0-9a-fA-F]{40}$ ]] || fail "could not read T$T's controller"
NS_AP_ADDRESS="$(cast wallet new --json | jq -r '.[0].address')"
NS_KEIRI_ADDRESS="$(cast wallet new --json | jq -r '.[0].address')"
NS_ZEIRISHI_ADDRESS="$(cast wallet new --json | jq -r '.[0].address')"
export DEPLOYER_ADDRESS COMPANY_ADDRESS NS_AP_ADDRESS NS_KEIRI_ADDRESS NS_ZEIRISHI_ADDRESS
for who in "$DEPLOYER_ADDRESS" "$COMPANY_ADDRESS" "$NS_AP_ADDRESS"; do
  cast rpc anvil_impersonateAccount "$who" --rpc-url "$RPC_URL" >/dev/null
done
echo "Fork block $(cast block-number --rpc-url "$RPC_URL"); company key $COMPANY_ADDRESS, AP agent $NS_AP_ADDRESS"

step "Before: the seven reference names"
BEFORE="$(snapshot)" || fail "viem failed"
echo "$BEFORE" | jq -c '{name, address}'

step "deploy (deployer), fund (deployer), open (company), attach (deployer), issue (company), primary (AP agent)"
out="$(forge_as "$DEPLOYER_ADDRESS" "deploy()")" || fail "deploy failed: $out"
COMPANY_NAMESPACE="$(grep -oE 'COMPANY_NAMESPACE=0x[0-9a-fA-F]{40}' <<<"$out" | cut -d= -f2)"
[[ -n $COMPANY_NAMESPACE ]] || fail "deploy printed no address: $out"
export COMPANY_NAMESPACE
for pair in "$DEPLOYER_ADDRESS fund()" "$COMPANY_ADDRESS open()" "$DEPLOYER_ADDRESS attach()" \
  "$COMPANY_ADDRESS issue()" "$NS_AP_ADDRESS primary()"; do
  out="$(forge_as ${pair% *} "${pair#* }")" || fail "${pair#* } failed: $out"
  grep -E "COMPANY_NAMESPACE|company|namespace|subregistry|issued|primary name" <<<"$out" | sed 's/^ *//'
done

step "Stock viem: each name resolves to its holder; ap's holder shows ap.t$T.payee.eth"
NAMES="$(viem check-names-viem.mjs T_NUMBER="$T")" || fail "viem failed: $NAMES"
echo "$NAMES" | jq .
for pair in "ap $NS_AP_ADDRESS" "keiri $NS_KEIRI_ADDRESS" "zeirishi $NS_ZEIRISHI_ADDRESS"; do
  [[ $(resolved "${pair% *}" "$NAMES") == "${pair#* }" ]] || fail "${pair% *} does not resolve to its holder"
done
jq -e '.names.ap.description | test("fictional demo company")' <<<"$NAMES" >/dev/null || fail "ap's description is missing"
jq -e '.names.ap.agentStatus == "online"' <<<"$NAMES" >/dev/null || fail "ap's agent-status is missing"
PAYOUT="$(cast call "$REGISTRY" "payoutOf(uint64)(address)" "$T" --rpc-url "$RPC_URL")"
jq -e --arg p "$PAYOUT" '(.payout | ascii_downcase) == ($p | ascii_downcase)' <<<"$NAMES" >/dev/null ||
  fail "t$T.payee.eth no longer resolves to the registry payout"
primary="$(viem check-primary-viem.mjs ENS_ADDRESS="$NS_AP_ADDRESS")" || fail "viem failed: $primary"
echo "$primary"
jq -e --arg n "ap.t$T.payee.eth" '.name == $n' <<<"$primary" >/dev/null || fail "getEnsName(ap's holder) is not ap.t$T.payee.eth"

step "Roles: the agent sets agent-status only; the company's key can't write the resolver; look-alike labels are refused"
AP_DNS="$(dns "ap.t$T.payee.eth")"
AP_RESOLVER="$(cast call "$COMPANY_NAMESPACE" "nameOf(uint64,string)(address,address,uint64)" "$T" ap --rpc-url "$RPC_URL" | sed -n 2p)"
cast send "$AP_RESOLVER" "setText(bytes,string,string)" "$AP_DNS" agent-status busy --from "$NS_AP_ADDRESS" --unlocked \
  --rpc-url "$RPC_URL" >/dev/null || fail "the agent could not set its agent-status"
[[ $(viem check-names-viem.mjs T_NUMBER="$T" LABELS=ap | jq -r .names.ap.agentStatus) == busy ]] || fail "agent-status did not change"
refused "$AP_RESOLVER" "setText(bytes,string,string)" "$AP_DNS" description rewritten --from "$NS_AP_ADDRESS" --unlocked ||
  fail "the agent rewrote its description"
refused "$AP_RESOLVER" "setAddress(bytes,uint256,bytes)" "$AP_DNS" 60 "$COMPANY_ADDRESS" --from "$NS_AP_ADDRESS" --unlocked ||
  fail "the agent changed its address"
refused "$AP_RESOLVER" "setAddress(bytes,uint256,bytes)" "$AP_DNS" 60 "$COMPANY_ADDRESS" --from "$COMPANY_ADDRESS" --unlocked ||
  fail "the company's key changed the agent's address"
refused "$AP_RESOLVER" "setText(bytes,string,string)" "$AP_DNS" description direct --from "$COMPANY_ADDRESS" --unlocked ||
  fail "the company's key wrote the resolver directly"
EXPIRY="$(($(cast block --rpc-url "$RPC_URL" -f timestamp) + 86400))"
refused "$COMPANY_NAMESPACE" "issue(uint64,(string,address,uint64,string[],string[],string[]))" "$T" \
  "(t8999900000001,$NS_AP_ADDRESS,$EXPIRY,[],[],[])" --from "$COMPANY_ADDRESS" --unlocked ||
  fail "a T-number-shaped label was issued"
echo "scoped as designed"

step "The seven reference names are unchanged"
[[ "$(snapshot)" == "$BEFORE" ]] || fail "a reference name resolves differently"
echo "unchanged"

step "30 days later zeirishi is gone; keiri is revoked"
cast rpc anvil_increaseTime $((30 * 86400 + 60)) --rpc-url "$RPC_URL" >/dev/null
cast rpc anvil_mine --rpc-url "$RPC_URL" >/dev/null
cast send "$COMPANY_NAMESPACE" "revoke(uint64,string)" "$T" keiri --from "$COMPANY_ADDRESS" --unlocked \
  --rpc-url "$RPC_URL" >/dev/null || fail "revoke failed"
NAMES="$(viem check-names-viem.mjs T_NUMBER="$T")" || fail "viem failed: $NAMES"
jq -c '.names | map_values(.address)' <<<"$NAMES"
[[ $(resolved zeirishi "$NAMES") == null && $(resolved keiri "$NAMES") == null ]] || fail "an expired or revoked name still resolves"
[[ $(resolved ap "$NAMES") == "$NS_AP_ADDRESS" ]] || fail "ap stopped resolving"

step "detach (deployer): Meigi's brake takes the whole namespace dark"
out="$(forge_as "$DEPLOYER_ADDRESS" "detach()")" || fail "detach failed: $out"
NAMES="$(viem check-names-viem.mjs T_NUMBER="$T")" || fail "viem failed: $NAMES"
jq -c '.names | map_values(.address)' <<<"$NAMES"
[[ $(resolved ap "$NAMES") == null ]] || fail "ap still resolves after detach"
[[ "$(snapshot)" == "$BEFORE" ]] || fail "a reference name resolves differently after detach"

step "Company names fork proof passed (gate $COMPANY_NAMESPACE)"
