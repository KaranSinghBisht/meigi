#!/usr/bin/env bash
# Seeds the "please try to rob it" demo on a deployed Meigi stack:
#   1. the attester registers a FICTIONAL vendor (evidence says so on-chain; it is not an NTA company),
#   2. mock JPYC is minted into the AgentVault,
#   3. the vault owner approves the vendor (active after the vault's vendorDelay).
# Reads keys and addresses from ../.env and deployments/<chainId>.json. Never prints keys.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ../.env; set +a

RPC="$SEPOLIA_RPC_URL"
DEPLOYMENT="deployments/$(cast chain-id --rpc-url "$RPC").json"
REGISTRY=$(jq -r .registry "$DEPLOYMENT")
VAULT=$(jq -r .vault "$DEPLOYMENT")
TOKEN=$(jq -r .token "$DEPLOYMENT")

T_NUMBER=2011001234567 # fictional; valid 法人番号 check digit
NAME="株式会社メイギ商事"
OFFICER=$(cast keccak "meigi-demo-fixture-officer") # no one can prove this session: the fixture can't be redirected
EVIDENCE=$(cast keccak "demo-fixture:fictional-vendor:not-an-NTA-company")

send() { cast send "$@" --rpc-url "$RPC" --json | jq -r '"\(.status) \(.transactionHash)"'; }

status=$(cast call "$REGISTRY" "isActive(uint64)(bool)" "$T_NUMBER" --rpc-url "$RPC")
if [ "$status" = "false" ]; then
  echo "register fixture vendor T$T_NUMBER:"
  send "$REGISTRY" "register((uint64,string,address,address,bytes32[],uint8,bytes32))" \
    "($T_NUMBER,\"$NAME\",$DEMO_VENDOR_CONTROLLER,$DEMO_VENDOR_PAYOUT,[$OFFICER],1,$EVIDENCE)" \
    --private-key "$ATTESTER_PRIVATE_KEY"
fi

echo "mint 5,000,000 mJPYC to the vault:"
send "$TOKEN" "mint(address,uint256)" "$VAULT" 5000000000000000000000000 --private-key "$DEPLOYER_PRIVATE_KEY"

echo "vault owner approves the vendor (cap ¥500,000 per invoice, ¥1,000,000 per 30 days):"
send "$VAULT" "approveVendor(uint64,uint128,uint128)" "$T_NUMBER" 500000000000000000000000 1000000000000000000000000 \
  --private-key "$VAULT_OWNER_PRIVATE_KEY"

echo "payoutOf(T$T_NUMBER) = $(cast call "$REGISTRY" "payoutOf(uint64)(address)" "$T_NUMBER" --rpc-url "$RPC")"
echo "vault balance = $(cast call "$TOKEN" "balanceOf(address)(uint256)" "$VAULT" --rpc-url "$RPC")"
