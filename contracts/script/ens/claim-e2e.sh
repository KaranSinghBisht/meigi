#!/usr/bin/env bash
# Fork proof for claimable payee names on the live ENSv2 Beta state. On an anvil fork of Sepolia it impersonates the
# real payee.eth owner and the demo company (no key is read), then:
#   1. deploys the claims registry (a VerifiableFactory UserRegistry) and ClaimedPayeeResolver;
#   2. attaches the registry as payee.eth's subregistry;
#   3. claims T2011001234567 for its registry controller;
#   4. has the company set its own url and description;
#   5. revokes the claim (the name falls back to the wildcard);
#   6. detaches the registry again (the rollback).
# After every step, stock viem must resolve the reference names byte for byte as before, and before the rollback
# CheckClaim and the standing CheckName must pass with the claims registry attached. Nothing is sent to a real network.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEIGI="$(cd "$HERE/../../.." && pwd)"
FORK_URL="${FORK_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
PORT="${ANVIL_PORT:-8587}"
REFERENCE="${REFERENCE_T_NUMBERS:-2011001234567 3999905000001 2010401000001 9999999999999}"
CLAIM=2011001234567
URL="https://shoji.example"
DESCRIPTION="Fictional demo supplier for Meigi. Payments go only to the registry-verified payout."

step() { printf '\n==> %s\n' "$*"; }
fail() {
  echo "claim-e2e: $*" >&2
  exit 1
}
viem() { # stock viem for t$1.payee.eth; $2 = optional extra text keys
  (cd "$MEIGI/apps/landing" && ENS_NAME="t$1.payee.eth" ENS_TEXT_KEYS="${2:-}" node --input-type=module <"$HERE/check-viem.mjs")
}
snapshot() {
  local t
  for t in $REFERENCE; do viem "$t" || return 1; done
}
unchanged() { # $1 = step name
  local now
  now="$(snapshot)" || fail "viem failed after $1"
  [[ $now == "$BEFORE" ]] || fail "resolution changed after $1:"$'\n'"$now"
  echo "reference names unchanged after $1"
}
claims() { # $1 = function, $2 = sender; broadcasts ClaimName.s.sol as the impersonated sender
  (cd "$MEIGI/contracts" && forge script script/ens/ClaimName.s.sol --sig "$1" --broadcast --slow --unlocked \
    --sender "$2") 2>&1
}

unset DEPLOYER_PRIVATE_KEY COMPANY_PRIVATE_KEY CLAIMS_REGISTRY CLAIMS_RESOLVER AGENT_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY
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
unset CLAIMS_REGISTRY CLAIMS_RESOLVER # the fork proof always deploys its own
export FOUNDRY_ETH_RPC_URL="$RPC_URL" FOUNDRY_BROADCAST="$TMP/broadcast"
ETH_REGISTRY="$(cast call "$ENS_REGISTRAR" "ETH_REGISTRY()(address)" --rpc-url "$RPC_URL")"
PAYEE_RESOLVER="$(cast call "$ETH_REGISTRY" "getResolver(string)(address)" payee --rpc-url "$RPC_URL")"
DEPLOYER_ADDRESS="$(cast call "$ETH_REGISTRY" "getOwner(uint256)(address)" "$(cast keccak payee)" --rpc-url "$RPC_URL")"
REGISTRY="$(jq -r .registry "$MEIGI/contracts/deployments/11155111.json")"
COMPANY_ADDRESS="$(cast call "$REGISTRY" "controllerOf(uint64)(address)" "$CLAIM" --rpc-url "$RPC_URL")"
export DEPLOYER_ADDRESS COMPANY_ADDRESS
for who in "$DEPLOYER_ADDRESS" "$COMPANY_ADDRESS"; do cast rpc anvil_impersonateAccount "$who" --rpc-url "$RPC_URL" >/dev/null; done
echo "Fork block $(cast block-number --rpc-url "$RPC_URL"); payee.eth owner $DEPLOYER_ADDRESS; company $COMPANY_ADDRESS"

step "Baseline: stock viem for the reference names"
BEFORE="$(snapshot)" || fail "viem failed on the baseline"
echo "$BEFORE"

step "Deploy: the claims registry (UserRegistry proxy) and ClaimedPayeeResolver"
out="$(claims "deploy()" "$DEPLOYER_ADDRESS")" || fail "deploy failed: $out"
CLAIMS_REGISTRY="$(grep -Eo 'CLAIMS_REGISTRY=0x[0-9a-fA-F]{40}' <<<"$out" | head -1 | cut -d= -f2 || true)"
CLAIMS_RESOLVER="$(grep -Eo 'CLAIMS_RESOLVER=0x[0-9a-fA-F]{40}' <<<"$out" | head -1 | cut -d= -f2 || true)"
[[ -n $CLAIMS_REGISTRY && -n $CLAIMS_RESOLVER ]] || fail "deploy printed no addresses: $out"
export CLAIMS_REGISTRY CLAIMS_RESOLVER
echo "CLAIMS_REGISTRY=$CLAIMS_REGISTRY CLAIMS_RESOLVER=$CLAIMS_RESOLVER"

step "Attach: payee.eth's subregistry = the claims registry"
out="$(claims "attach()" "$DEPLOYER_ADDRESS")" || fail "attach failed: $out"
unchanged "attach"

step "Claim T$CLAIM for its registry controller (and fund the company with 0.005 ETH)"
out="$(COMPANY_FUND_WEI=5000000000000000 claims "claim()" "$DEPLOYER_ADDRESS")" || fail "claim failed: $out"
grep -E "claimed by|PROFILE_RESOLVER" <<<"$out" || fail "claim printed nothing: $out"
unchanged "claim"

step "The company sets its own profile"
out="$(PROFILE_URL="$URL" PROFILE_DESCRIPTION="$DESCRIPTION" claims "profile()" "$COMPANY_ADDRESS")" ||
  fail "profile failed: $out"
unchanged "the company's profile"
out="$(viem "$CLAIM" url,description)" || fail "viem failed: $out"
echo "$out"
jq -e --arg u "$URL" --arg d "$DESCRIPTION" --arg r "$CLAIMS_RESOLVER" \
  '.texts.url == $u and .texts.description == $d and (.resolver | ascii_downcase) == ($r | ascii_downcase)' \
  <<<"$out" >/dev/null || fail "the company's profile does not resolve through CLAIMS_RESOLVER"

step "CheckClaim (read-only): wiring, what the company cannot do, and registry truth for every reference name"
out="$( (cd "$MEIGI/contracts" && EXPECT_URL="$URL" EXPECT_DESCRIPTION="$DESCRIPTION" \
  forge script script/ens/CheckClaim.s.sol) 2>&1)" || fail "CheckClaim failed: $out"
grep -E "token owned by|url =|cannot|expires with|non-transferable|->" <<<"$out" || fail "CheckClaim printed nothing: $out"

step "CheckName (the standing payee check) with the claims registry attached"
out="$( (cd "$MEIGI/contracts" && forge script script/ens/CheckName.s.sol) 2>&1)" || fail "CheckName failed: $out"
grep -E "addr\(60\)|text\(name\)|-> " <<<"$out" || fail "CheckName printed nothing: $out"

step "Revoke: Meigi burns the claim, and the name falls back to payee.eth's wildcard"
out="$(T_NUMBER="$CLAIM" claims "revoke()" "$DEPLOYER_ADDRESS")" || fail "revoke failed: $out"
grep -E "claim revoked" <<<"$out" || fail "revoke printed nothing: $out"
unchanged "revoke"
out="$(viem "$CLAIM" url,description)" || fail "viem failed: $out"
jq -e --arg r "$PAYEE_RESOLVER" '.texts.url == null and (.resolver | ascii_downcase) == ($r | ascii_downcase)' \
  <<<"$out" >/dev/null || fail "after revoke the name should be back on payee.eth's resolver, with no profile"

step "Rollback: detach restores the pure-data setup"
out="$(claims "detach()" "$DEPLOYER_ADDRESS")" || fail "detach failed: $out"
unchanged "detach"
out="$(viem "$CLAIM" url,description)" || fail "viem failed: $out"
echo "$out"
jq -e --arg r "$PAYEE_RESOLVER" '.texts.url == null and .texts.description == null and
  (.resolver | ascii_downcase) == ($r | ascii_downcase)' <<<"$out" >/dev/null ||
  fail "after detach the name should be back on payee.eth's resolver, with no profile"

step "Claimable payee names fork proof passed"
