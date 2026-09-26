#!/usr/bin/env bash
# Sourcify-verifies the contracts deployed after the core set (CompanyNamespace, and MandateGate once it is deployed),
# run at the repo's public flip so no source goes public before the repo does. Constructor arguments are read back from
# each live contract's own getters. The build settings are foundry.toml's (solc 0.8.28, optimizer 200 runs, cancun);
# the script first checks that they reproduce the deployed metadata hash, so Sourcify can report an exact match.
#   bash contracts/script/ens/verify-at-publication.sh --dry-run    # print the commands only
#   MANDATE_GATE=0x… bash contracts/script/ens/verify-at-publication.sh
# Env: RPC_URL (default: the public Sepolia node), MANDATE_GATE (optional).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS="$(cd "$HERE/../.." && pwd)"
RPC="${RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
COMPANY_NAMESPACE=0x7ECaD5Fd6892270F09D91aB296786186C5bC660A
DRY_RUN=0
if [[ ${1:-} == --dry-run ]]; then DRY_RUN=1; fi

fail() {
  echo "verify-at-publication: $*" >&2
  exit 1
}
get() { cast call "$1" "$2" --rpc-url "$RPC"; }
# The CBOR metadata at the end of runtime bytecode: its length is the last two bytes.
metadata() { python3 -c 'import sys; c = sys.argv[1][2:]; n = int(c[-4:], 16); print(c[-(2 * n + 4):])' "$1"; }

# verify <address> <path:Contract> <abi-encoded constructor args>
verify() {
  local deployed local_code
  deployed="$(cast code "$1" --rpc-url "$RPC")"
  local_code="$(cd "$CONTRACTS" && forge inspect "$2" deployedBytecode)"
  [[ $(metadata "$deployed") == "$(metadata "$local_code")" ]] || fail "$2: this build doesn't reproduce $1's metadata hash"
  echo "$2 at $1: metadata matches the local build"
  local cmd=(forge verify-contract "$1" "$2" --chain sepolia --verifier sourcify --constructor-args "$3")
  if [[ $DRY_RUN == 1 ]]; then
    echo "  (cd contracts && ${cmd[*]})"
  else
    (cd "$CONTRACTS" && "${cmd[@]}")
  fi
}

names_args="$(cast abi-encode "constructor(address,address,address,address,address,address,bytes)" \
  "$(get $COMPANY_NAMESPACE "registry()(address)")" \
  "$(get $COMPANY_NAMESPACE "factory()(address)")" \
  "$(get $COMPANY_NAMESPACE "registryImplementation()(address)")" \
  "$(get $COMPANY_NAMESPACE "resolverImplementation()(address)")" \
  "$(get $COMPANY_NAMESPACE "claims()(address)")" \
  "$(get $COMPANY_NAMESPACE "brake()(address)")" \
  "$(get $COMPANY_NAMESPACE "parentDnsName()(bytes)")")"
verify "$COMPANY_NAMESPACE" src/ens/CompanyNamespace.sol:CompanyNamespace "$names_args"

if [[ -n ${MANDATE_GATE:-} ]]; then
  gate_args="$(cast abi-encode "constructor(address,address,uint64,string)" \
    "$(get "$MANDATE_GATE" "vault()(address)")" \
    "$(get "$MANDATE_GATE" "names()(address)")" \
    "$(get "$MANDATE_GATE" "principal()(uint64)" | awk '{print $1}')" \
    "$(get "$MANDATE_GATE" "label()(string)" | tr -d '"')")"
  verify "$MANDATE_GATE" src/payments/MandateGate.sol:MandateGate "$gate_args"
fi
