#!/usr/bin/env bash
# Seeds Meigi's Awaji deployment (Mizuhiki, chain 6497) with the two FICTIONAL payees paid there, each at a payout
# this team holds the key to. Idempotent: it reuses seed-demo.sh's `register`, which skips a registered number.
#   - 株式会社メイギ商事 (T2011001234567), PayRouter.pay's payee: DEMO_VENDOR_PAYOUT, as on Sepolia,
#   - 株式会社ミナトGPUクラウド (T6999900000003), the x402 demo's GPU merchant: AWAJI_MINATO_PAYOUT, from .env.awaji,
#     which also holds its key (on Sepolia that payout's key was discarded; here the MJPY it earns stays spendable).
# Same fixture officer and evidence as Sepolia: evidence says on-chain that neither is an NTA company.
# On Awaji the deployer is the attester (DeployAwaji.s.sol keeps one funded key), and fees respect the chain's
# 30-gwei priority floor. SEED_RPC_URL=http://127.0.0.1:<port> rehearses on an anvil fork first. Never prints keys.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=seed-demo.sh
. "$here/seed-demo.sh"

AWAJI_RPC=https://rpc.awaji.mizuhiki.io

# seed-demo.sh's send, with fees set explicitly: Awaji's own fee estimate comes back far under its 30-gwei floor.
send() {
  cast send "$@" --gas-price 33000000000 --priority-gas-price 31000000000 --rpc-url "$RPC" --json |
    jq -r '"\(.status) \(.transactionHash)"'
}

seed_awaji() {
  # The caller's RPC and payout win over .env's, so a rehearsal can't be pointed back at the real chain by .env.
  local rpc=${SEED_RPC_URL:-} payout=${AWAJI_MINATO_PAYOUT:-}
  cd "$here/.."
  set -a
  . ../.env
  if [ -f ../.env.awaji ]; then . ../.env.awaji; fi
  set +a
  RPC=${rpc:-$AWAJI_RPC}
  AWAJI_MINATO_PAYOUT=${payout:-${AWAJI_MINATO_PAYOUT:-}}
  if [ "$(cast chain-id --rpc-url "$RPC")" != 6497 ]; then
    echo "$RPC is not Awaji (chain 6497)" >&2
    return 1
  fi
  if [ -z "${AWAJI_MINATO_PAYOUT:-}" ]; then
    echo "set AWAJI_MINATO_PAYOUT: the Awaji payout for Minato, one whose key we hold" >&2
    return 1
  fi
  REGISTRY=$(jq -r .registry deployments/6497.json)
  OFFICER=$(cast keccak "meigi-demo-fixture-officer")
  EVIDENCE=$(cast keccak "demo-fixture:fictional-vendor:not-an-NTA-company")
  ATTESTER_PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY

  register "$T_NUMBER" "$NAME" "$DEMO_VENDOR_CONTROLLER" "$DEMO_VENDOR_PAYOUT"
  # Minato's business key is a throwaway, as on Sepolia: this fixture is paid over x402, never changed through /change.
  register "$MINATO_T_NUMBER" "$MINATO_NAME" "$(cast wallet new --json | jq -r '.[0].address')" "$AWAJI_MINATO_PAYOUT"

  echo "payoutOf(T$T_NUMBER) = $(cast call "$REGISTRY" "payoutOf(uint64)(address)" "$T_NUMBER" --rpc-url "$RPC")"
  echo "payoutOf(T$MINATO_T_NUMBER) = $(cast call "$REGISTRY" "payoutOf(uint64)(address)" "$MINATO_T_NUMBER" --rpc-url "$RPC")"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  seed_awaji "$@"
fi
