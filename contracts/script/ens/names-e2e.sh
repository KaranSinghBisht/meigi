#!/usr/bin/env bash
# Fork proof for company-issued names (CompanyNamespace). On an anvil fork of Sepolia it impersonates Meigi's deployer,
# the demo company's registry controller, the registry's attester and throwaway holders (no key is read), runs the
# CompanyNames.s.sol steps (deploy, fund, agentId, open, attach, issue, status), then checks with stock viem and cast:
#   - ap, keiri and zeirishi.t2011001234567.payee.eth answer their texts and resolve no address; ap links its ERC-8004
#     registration both ways (ENSIP-25); a deeper name answers nothing;
#   - the AP agent sets its agent-status through the gate and can write nothing on its resolver; nobody else can set
#     its status; a label shaped like another company's T-number is refused;
#   - the seven reference names (six payee names and ap.meigi.eth) resolve exactly as before;
#   - Meigi's brake sticks (a blocked label is dark and frozen names are dark until lifted); every label the rules
#     accept is already ENSIP-15-normal in viem;
#   - a dispute darkens the names and dismissing it brings them back; after 30 days zeirishi is gone; revoked keiri
#     is gone and renew can't revive it; Meigi's reset darkens the namespace; detach leaves the references unchanged.
# A controller rotation darkening the old key's names needs a signed officer approval: CompanyNamespaceFork.t.sol.
# Nothing is sent to a real network.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEIGI="$(cd "$HERE/../../.." && pwd)"
FORK_URL="${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8611}"
T=2011001234567
REFERENCE="2011001234567 3999905000001 2010401000001 9999999999999 8999900000001 6999900000003"
ERC8004=0x8004A818BFB912233c491871b3d84c89A494BD9e
PAYEE_VIEW="payeeOf(uint64)((string,address,address,address,uint64,address,uint64,uint64,uint8,uint8,bytes32))"

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
names() { viem check-names-viem.mjs T_NUMBER="$T" "$@"; }
forge_as() { # $1 = sender, $2 = signature
  (cd "$MEIGI/contracts" && forge script script/ens/CompanyNames.s.sol --sig "$2" --broadcast --slow --unlocked \
    --sender "$1") 2>&1
}
send_as() { # $1 = sender, then cast send arguments
  local who="$1"
  shift
  cast send "$@" --from "$who" --unlocked --rpc-url "$RPC_URL" >/dev/null
}
refused() { ! send_as "$@" 2>/dev/null; } # succeeds only if the transaction reverts
# The DNS wire format of a dotted name, as hex for cast.
dns() {
  local out="0x" label
  IFS=. read -ra labels <<<"$1"
  for label in "${labels[@]}"; do out+="$(printf '%02x' "${#label}")$(printf '%s' "$label" | xxd -p | tr -d '\n')"; done
  echo "${out}00"
}
field() { jq -r --arg l "$1" ".names[\$l].$2" <<<"$3"; }

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
export FOUNDRY_ETH_RPC_URL="$RPC_URL" FOUNDRY_BROADCAST="$TMP/broadcast"
ETH_REGISTRY="$(cast call "$ENS_REGISTRAR" "ETH_REGISTRY()(address)" --rpc-url "$RPC_URL")"
DEPLOYER_ADDRESS="$(cast call "$ETH_REGISTRY" "getOwner(uint256)(address)" "$(cast keccak payee)" --rpc-url "$RPC_URL")"
REGISTRY="$(cast call "$CLAIMS_RESOLVER" "registry()(address)" --rpc-url "$RPC_URL")"
COMPANY_ADDRESS="$(cast call "$REGISTRY" "$PAYEE_VIEW" "$T" --rpc-url "$RPC_URL" | sed -nE 's/^\("[^"]*", (0x[0-9a-fA-F]{40}),.*/\1/p')"
[[ $COMPANY_ADDRESS =~ ^0x[0-9a-fA-F]{40}$ ]] || fail "could not read T$T's controller"
ATTESTER="${ATTESTER:-0x3D5F314C30E77CC6f3677C5409FdC91e83510493}"
[[ $(cast call "$REGISTRY" "isAttester(address)(bool)" "$ATTESTER" --rpc-url "$RPC_URL") == true ]] || fail "$ATTESTER is not an attester"
NS_AP_ADDRESS="$(cast wallet new --json | jq -r '.[0].address')"
NS_KEIRI_ADDRESS="$(cast wallet new --json | jq -r '.[0].address')"
NS_ZEIRISHI_ADDRESS="$(cast wallet new --json | jq -r '.[0].address')"
export DEPLOYER_ADDRESS COMPANY_ADDRESS NS_AP_ADDRESS NS_KEIRI_ADDRESS NS_ZEIRISHI_ADDRESS
for who in "$DEPLOYER_ADDRESS" "$COMPANY_ADDRESS" "$NS_AP_ADDRESS" "$ATTESTER"; do
  cast rpc anvil_impersonateAccount "$who" --rpc-url "$RPC_URL" >/dev/null
done
echo "Fork block $(cast block-number --rpc-url "$RPC_URL"); company key $COMPANY_ADDRESS, AP agent $NS_AP_ADDRESS"

step "Before: the seven reference names"
BEFORE="$(snapshot)" || fail "viem failed"
echo "$BEFORE" | jq -c '{name, address}'

step "deploy, fund (deployer); agentId, open (company); attach (deployer); issue (company); status (AP agent)"
out="$(forge_as "$DEPLOYER_ADDRESS" "deploy()")" || fail "deploy failed: $out"
COMPANY_NAMESPACE="$(grep -oE 'COMPANY_NAMESPACE=0x[0-9a-fA-F]{40}' <<<"$out" | cut -d= -f2)"
[[ -n $COMPANY_NAMESPACE ]] || fail "deploy printed no address: $out"
export COMPANY_NAMESPACE
out="$(forge_as "$DEPLOYER_ADDRESS" "fund()")" || fail "fund failed: $out"
out="$(forge_as "$COMPANY_ADDRESS" "agentId()")" || fail "agentId failed: $out"
receipt="$TMP/broadcast/CompanyNames.s.sol/11155111/agentId-latest.json"
id="$(jq -r --arg t "$(cast keccak 'Registered(uint256,string,address)')" \
  '[.receipts[].logs[] | select(.topics[0] == $t)][0].topics[1]' "$receipt")"
[[ $id =~ ^0x[0-9a-fA-F]{64}$ ]] || fail "no Registered event in the agentId receipt"
NS_AP_8004_ID="$(cast to-dec "$id")"
export NS_AP_8004_ID NS_AP_STATUS=busy
echo "ERC-8004 agent $NS_AP_8004_ID"
for pair in "$COMPANY_ADDRESS open()" "$DEPLOYER_ADDRESS attach()" "$COMPANY_ADDRESS issue()" "$NS_AP_ADDRESS status()"; do
  out="$(forge_as ${pair% *} "${pair#* }")" || fail "${pair#* } failed: $out"
  grep -E "namespace|subregistry|issued|agent-status" <<<"$out" | sed 's/^ *//'
done

step "Stock viem: texts, no address, the ENSIP-25 link; a deeper name answers nothing"
KEY="agent-registration[0x0001000003aa36a714$(tr 'A-F' 'a-f' <<<"${ERC8004#0x}")][$NS_AP_8004_ID]"
NAMES="$(names TEXT_KEYS="agent-endpoint[web],$KEY")" || fail "viem failed: $NAMES"
echo "$NAMES" | jq .
for label in ap keiri zeirishi; do
  [[ $(field "$label" address "$NAMES") == null ]] || fail "$label resolves an address"
  [[ $(field "$label" description "$NAMES") == *"fictional demo company"* ]] || fail "$label has no description"
done
[[ $(field ap agentStatus "$NAMES") == busy ]] || fail "ap's holder could not set its status"
[[ $(jq -r --arg k "$KEY" '.names.ap.texts[$k]' <<<"$NAMES") == 1 ]] || fail "ap does not confirm its ERC-8004 agent"
uri="$(cast call "$ERC8004" "tokenURI(uint256)(string)" "$NS_AP_8004_ID" --rpc-url "$RPC_URL" | tr -d '"')"
base64 -d <<<"${uri#data:application/json;base64,}" | jq -e '.services[] | select(.name == "ENS") | .endpoint == "ap.t2011001234567.payee.eth"' >/dev/null ||
  fail "the ERC-8004 registration file does not name ap"
[[ $(cast call "$ERC8004" "ownerOf(uint256)(address)" "$NS_AP_8004_ID" --rpc-url "$RPC_URL") == "$COMPANY_ADDRESS" ]] ||
  fail "the company does not own its agent's ERC-8004 identity"
PAYOUT="$(cast call "$REGISTRY" "payoutOf(uint64)(address)" "$T" --rpc-url "$RPC_URL")"
[[ $(jq -r .payout <<<"$NAMES" | tr 'A-F' 'a-f') == "$(tr 'A-F' 'a-f' <<<"$PAYOUT")" ]] || fail "the payee name left its payout"
deeper="$(viem check-names-viem.mjs T_NUMBER="$T" LABELS=x.ap)" || fail "viem failed: $deeper"
[[ $(field x.ap description "$deeper") == null && $(field x.ap agentStatus "$deeper") == null ]] ||
  fail "a deeper name answered: $deeper"
(cd "$MEIGI/contracts" && forge script script/ens/CompanyNames.s.sol --sig "check()" 2>&1) | grep -E "ENSIP-25|->" |
  sed 's/^ *//' || fail "check() failed"

step "Roles: the agent writes only its status, through the gate; look-alike labels are refused"
AP_DNS="$(dns "ap.t$T.payee.eth")"
RECORDS="$(cast call "$COMPANY_NAMESPACE" "nameOf(uint64,string)(address,address,address,uint64)" "$T" ap --rpc-url "$RPC_URL" | sed -n 2p)"
refused "$NS_AP_ADDRESS" "$RECORDS" "setText(bytes,string,string)" 0x00 agent-status pwned || fail "the agent wrote the root node"
refused "$NS_AP_ADDRESS" "$RECORDS" "setText(bytes,string,string)" "$AP_DNS" description rewritten || fail "the agent rewrote its description"
refused "$NS_AP_ADDRESS" "$RECORDS" "setAddress(bytes,uint256,bytes)" "$AP_DNS" 60 "$NS_AP_ADDRESS" || fail "the agent set an address"
refused "$COMPANY_ADDRESS" "$COMPANY_NAMESPACE" "setStatus(uint64,string,string)" "$T" ap hijacked || fail "someone else set ap's status"
EXPIRY="$(($(cast block --rpc-url "$RPC_URL" -f timestamp) + 86400))"
refused "$COMPANY_ADDRESS" "$COMPANY_NAMESPACE" "issue(uint64,(string,address,uint64,string[],string[]))" "$T" \
  "(t8999900000001,$NS_KEIRI_ADDRESS,$EXPIRY,[],[])" || fail "a T-number-shaped label was issued"
echo "scoped as designed"

step "The seven reference names are unchanged"
[[ "$(snapshot)" == "$BEFORE" ]] || fail "a reference name resolves differently"
echo "unchanged"

step "Meigi's brake sticks: a blocked label and a frozen namespace are dark until lifted"
send_as "$DEPLOYER_ADDRESS" "$COMPANY_NAMESPACE" "setBlocked(uint64,string,bool)" "$T" ap true
[[ $(field ap description "$(names LABELS=ap)") == null ]] || fail "a blocked name still answers"
refused "$COMPANY_ADDRESS" "$COMPANY_NAMESPACE" "setText(uint64,string,string,string)" "$T" ap description x ||
  fail "the company edited a blocked name"
send_as "$DEPLOYER_ADDRESS" "$COMPANY_NAMESPACE" "setBlocked(uint64,string,bool)" "$T" ap false
send_as "$DEPLOYER_ADDRESS" "$COMPANY_NAMESPACE" "setFrozen(uint64,bool)" "$T" true
[[ $(field keiri description "$(names LABELS=keiri)") == null ]] || fail "a frozen namespace still answers"
send_as "$DEPLOYER_ADDRESS" "$COMPANY_NAMESPACE" "setFrozen(uint64,bool)" "$T" false
[[ $(field ap description "$(names LABELS=ap)") != null ]] || fail "ap did not come back after the brake lifted"
labels="$(viem check-labels-viem.mjs SAMPLES=2000)" || fail "a label the rules accept isn't ENSIP-15-normal: $labels"
echo "brake sticks; $(jq -r .checked <<<"$labels") accepted labels are ENSIP-15-normal"

step "A dispute darkens the names; dismissing it brings them back"
send_as "$ATTESTER" "$REGISTRY" "fileDispute(uint64,address,bytes32)" "$T" "$NS_ZEIRISHI_ADDRESS" "$(cast keccak demo-dispute)"
[[ $(field ap description "$(names LABELS=ap)") == null ]] || fail "ap still answers while disputed"
send_as "$DEPLOYER_ADDRESS" "$REGISTRY" "dismissDispute(uint64)" "$T"
[[ $(field ap description "$(names LABELS=ap)") != null ]] || fail "ap did not come back"
echo "dark while disputed, back once dismissed"

step "30 days later zeirishi is gone; keiri is revoked and can't be renewed back"
cast rpc anvil_increaseTime $((30 * 86400 + 60)) --rpc-url "$RPC_URL" >/dev/null
cast rpc anvil_mine --rpc-url "$RPC_URL" >/dev/null
send_as "$COMPANY_ADDRESS" "$COMPANY_NAMESPACE" "revoke(uint64,string)" "$T" keiri
EXPIRY="$(($(cast block --rpc-url "$RPC_URL" -f timestamp) + 86400))"
refused "$COMPANY_ADDRESS" "$COMPANY_NAMESPACE" "renew(uint64,string,uint64)" "$T" keiri "$EXPIRY" || fail "a revoked name was renewed"
NAMES="$(names)" || fail "viem failed: $NAMES"
jq -c '.names | map_values(.description != null)' <<<"$NAMES"
[[ $(field zeirishi description "$NAMES") == null && $(field keiri description "$NAMES") == null ]] || fail "an expired or revoked name still answers"
[[ $(field ap description "$NAMES") != null ]] || fail "ap stopped answering"

step "Meigi's reset darkens the namespace; detach leaves the references unchanged"
send_as "$DEPLOYER_ADDRESS" "$COMPANY_NAMESPACE" "resetNamespace(uint64)" "$T"
[[ $(field ap description "$(names LABELS=ap)") == null ]] || fail "ap still answers after the reset"
out="$(forge_as "$DEPLOYER_ADDRESS" "detach()")" || fail "detach failed: $out"
[[ "$(snapshot)" == "$BEFORE" ]] || fail "a reference name resolves differently after detach"

step "Company names fork proof passed (gate $COMPANY_NAMESPACE, ERC-8004 agent $NS_AP_8004_ID)"
