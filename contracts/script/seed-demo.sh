#!/usr/bin/env bash
# Seeds the "please try to rob it" demo on a deployed Meigi stack. Idempotent: every step checks the chain first,
# so a re-run sends only what is missing.
#   1. the attester registers the FICTIONAL vendors (evidence says so on-chain; they are not NTA companies):
#      株式会社メイギ商事, approved below, and 合同会社ベイサイド・アドバイザリー, registered but never approved,
#      so the vault's own vendor list refuses it (VendorNotApproved),
#   2. mock JPYC is minted into the AgentVault, unless it already holds 4,000,000 or more,
#   3. the vault owner approves メイギ商事 unless it already is (active after the vault's vendorDelay).
# Reads keys and addresses from ../.env and deployments/<chainId>.json. Never prints keys.
# Tests: bash contracts/script/seed-demo.test.sh (a stubbed cast; no chain, no keys).
set -euo pipefail

T_NUMBER=2011001234567 # fictional; valid 法人番号 check digit
NAME="株式会社メイギ商事"
BAYSIDE_T_NUMBER=3999905000001 # fictional; registry office 9999 doesn't exist
BAYSIDE_NAME="合同会社ベイサイド・アドバイザリー"
BAYSIDE_PAYOUT=0xba5Ea94C62C2a86FE0d2FE50c6DB8002155D389b # generated for the demo, key discarded
ZERO=0x0000000000000000000000000000000000000000
PAYEE_VIEW="payeeOf(uint64)((string,address,address,address,uint64,address,uint64,uint64,uint8,uint8,bytes32))"

send() { cast send "$@" --rpc-url "$RPC" --json | jq -r '"\(.status) \(.transactionHash)"'; }

# payee_status <t-number>: the registry status (0 none, 1 active, 2 disputed). Read from the end of the tuple, as
# `…, <status>, <evidence>)`, so a comma in the legal name can't shift it.
payee_status() {
  local view status
  view=$(cast call "$REGISTRY" "$PAYEE_VIEW" "$1" --rpc-url "$RPC")
  status=$(printf '%s\n' "$view" | sed -nE 's/.*, ([0-9]+), 0x[0-9a-fA-F]{64}\)$/\1/p')
  if [ -z "$status" ]; then
    echo "unexpected payeeOf(T$1) output" >&2
    return 1
  fi
  echo "$status"
}

# register <t-number> <legal name> <controller> <payout>: the attester records a fixture vendor once. Any
# registered status is skipped: `register` reverts for an active or a disputed number alike.
register() {
  local status
  status=$(payee_status "$1")
  if [ "$status" != "0" ]; then
    echo "T$1 is already registered (status $status)"
    return
  fi
  echo "register fixture vendor T$1:"
  send "$REGISTRY" "register((uint64,string,address,address,bytes32[],uint8,bytes32))" \
    "($1,\"$2\",$3,$4,[$OFFICER],1,$EVIDENCE)" \
    --private-key "$ATTESTER_PRIVATE_KEY"
}

vendor_payout() { cast call "$VAULT" "vendors(uint64)(address,uint64,uint64,uint128,uint128,uint128)" "$1" --rpc-url "$RPC" | head -1; }

main() {
  cd "$(dirname "$0")/.."
  set -a; . ../.env; set +a
  RPC="${SEED_RPC_URL:-$SEPOLIA_RPC_URL}" # SEED_RPC_URL=http://127.0.0.1:<port> rehearses on an anvil fork first
  local deployment balance
  deployment="deployments/$(cast chain-id --rpc-url "$RPC").json"
  REGISTRY=$(jq -r .registry "$deployment")
  VAULT=$(jq -r .vault "$deployment")
  TOKEN=$(jq -r .token "$deployment")
  OFFICER=$(cast keccak "meigi-demo-fixture-officer") # no one can prove this session: the fixture can't be redirected
  EVIDENCE=$(cast keccak "demo-fixture:fictional-vendor:not-an-NTA-company")

  register "$T_NUMBER" "$NAME" "$DEMO_VENDOR_CONTROLLER" "$DEMO_VENDOR_PAYOUT"
  # Bayside's business key is a throwaway address whose key is never kept (only the address leaves jq), so nobody
  # can change this fixture.
  register "$BAYSIDE_T_NUMBER" "$BAYSIDE_NAME" "$(cast wallet new --json | jq -r '.[0].address')" "$BAYSIDE_PAYOUT"

  balance=$(cast call "$TOKEN" "balanceOf(address)(uint256)" "$VAULT" --rpc-url "$RPC" | awk '{print $1}')
  if [ "$(cast from-wei "$balance" | cut -d. -f1)" -ge 4000000 ]; then
    echo "the vault already holds $(cast from-wei "$balance") mJPYC: no mint"
  else
    echo "mint 5,000,000 mJPYC to the vault:"
    send "$TOKEN" "mint(address,uint256)" "$VAULT" 5000000000000000000000000 --private-key "$DEPLOYER_PRIVATE_KEY"
  fi

  if [ "$(vendor_payout "$T_NUMBER")" != "$ZERO" ]; then
    echo "T$T_NUMBER is already an approved vendor"
  else
    echo "vault owner approves the vendor (cap ¥500,000 per invoice, ¥1,000,000 per 30 days):"
    send "$VAULT" "approveVendor(uint64,address,uint128,uint128)" "$T_NUMBER" "$DEMO_VENDOR_PAYOUT" 500000000000000000000000 1000000000000000000000000 \
      --private-key "$VAULT_OWNER_PRIVATE_KEY"
  fi

  echo "payoutOf(T$T_NUMBER) = $(cast call "$REGISTRY" "payoutOf(uint64)(address)" "$T_NUMBER" --rpc-url "$RPC")"
  echo "payoutOf(T$BAYSIDE_T_NUMBER) = $(cast call "$REGISTRY" "payoutOf(uint64)(address)" "$BAYSIDE_T_NUMBER" --rpc-url "$RPC"), vault vendor payout $(vendor_payout "$BAYSIDE_T_NUMBER") (zero: not approved)"
  echo "vault balance = $(cast call "$TOKEN" "balanceOf(address)(uint256)" "$VAULT" --rpc-url "$RPC")"
}

# Sourced by the tests for its functions; run directly, it seeds.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
