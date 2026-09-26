#!/usr/bin/env bash
# payee.eth and the AP agent's namespace (ap.meigi.eth) on ENSv2 (Sepolia).
# Usage: script/ens/ens.sh <command>
#   payee.eth:     deploy | seed | register | set-resolver | check
#   ap.meigi.eth:  agent-deploy | agent-setup | agent-status | agent-endpoint | agent-profile | agent-rotate |
#                  agent-ensip25 | agent-parent-profile (meigi.eth) | agent-check | vault-name
#   claimed names: claim-deploy | claim-attach | claim | claim-profile | claim-check | claim-revoke |
#                  claim-detach (rollback)
#   payout wallets: payout-name (the payee's name as the wallet's primary name)
# Transactions are only simulated unless BROADCAST=1. Keys and the RPC URL come from the environment or
# meigi/.env and never appear on a command line; tool output is redacted. See README.md.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS="$(cd "$HERE/../.." && pwd)"
SEPOLIA=11155111

die() {
  echo "ens.sh: $*" >&2
  exit 1
}

is_local() { [[ $1 =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]+)?/?$ ]]; }

# Exports the variables these scripts use from a dotenv file (not World or vault keys), skipping any that
# are already set. Tolerates CRLF, `export`, quotes and trailing comments.
load_dotenv() {
  local line key value
  # Only the agent variables these scripts use: the agent service keeps other AGENT_* secrets in the same file.
  local agent_vars='^AGENT_(PRIVATE_KEY|ADDRESS|PREVIOUS_ADDRESS|SUBREGISTRY|RESOLVER|STATUS|PARENT|LABEL|ENDPOINT|VAULT|PAYEE_REGISTRY)$'
  local kv='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$'
  local quoted="^[\"']([^\"']*)[\"']"
  while IFS= read -r line || [[ -n $line ]]; do
    line="${line%$'\r'}"
    [[ $line =~ $kv ]] || continue
    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    [[ $key =~ ^(SEPOLIA_RPC_URL|(DEPLOYER|ATTESTER|PAYEE|ENS)_[A-Z0-9_]+|VAULT_OWNER_(PRIVATE_KEY|ADDRESS))$ ||
      $key == DEMO_VENDOR_CONTROLLER_PRIVATE_KEY || $key =~ ^DEMO_[A-Z]+_PAYOUT_PRIVATE_KEY$ ||
      $key =~ $agent_vars ]] || continue
    if [[ -n ${!key:-} ]]; then continue; fi
    if [[ $value =~ $quoted ]]; then
      value="${BASH_REMATCH[1]}"
    else
      value="${value%%[[:space:]]#*}"
      value="${value%"${value##*[![:space:]]}"}"
    fi
    export "$key=$value"
  done <"$1"
}

# Checks a key's format without printing it (forge echoes values it cannot parse).
require_key() {
  [[ ${!1:-} =~ ^0x[0-9a-fA-F]{64}$ ]] || die "$1 is missing or not 0x followed by 64 hex characters"
}

# Hides the RPC URL, its path and query (where providers put API keys) and private-key bodies.
redact() {
  awk 'function add(v) { if (length(v) >= 8) secret[++n] = v }
    BEGIN {
      url = ENVIRON["FOUNDRY_ETH_RPC_URL"]; add(url)
      path = url; sub(/^[A-Za-z]+:\/\/[^\/?]*\/?/, "", path); add(path)
      for (k in ENVIRON) if (k ~ /_PRIVATE_KEY$/) { v = ENVIRON[k]; sub(/^0x/, "", v); add(v) }
    }
    { for (j = 1; j <= n; j++) while ((i = index($0, secret[j])) > 0) $0 = substr($0, 1, i - 1) "<redacted>" substr($0, i + length(secret[j])); print }'
}

# Runs cast and prints its first output word (cast appends " [1.2e3]" to numbers). Errors are redacted.
run_cast() {
  local out err
  err="$(mktemp)"
  if ! out="$(cast "$@" 2>"$err")"; then
    redact <"$err" >&2
    rm -f "$err"
    return 1
  fi
  rm -f "$err"
  printf '%s\n' "${out%% *}"
}

setup() {
  local dotenv="${DOTENV:-$CONTRACTS/../.env}" rpc
  # The agent key lives in .env.signer (only services/signer and this script read it), not in .env.
  local signer_env="${DOTENV_SIGNER:-$CONTRACTS/../.env.signer}"
  # Never load the real keys against a local RPC: a fork keeps chain id 11155111, so whatever is signed
  # there is also a valid Sepolia transaction.
  if [[ ${SKIP_DOTENV:-0} != 1 && -f $dotenv ]] && ! is_local "${RPC_URL:-}"; then load_dotenv "$dotenv"; fi
  if [[ ${SKIP_DOTENV:-0} != 1 && -f $signer_env ]] && ! is_local "${RPC_URL:-}"; then load_dotenv "$signer_env"; fi
  ENS_DEPLOYMENT="${ENS_DEPLOYMENT:-beta}" # the official Beta: what default ENS clients resolve
  [[ $ENS_DEPLOYMENT =~ ^[a-z0-9_-]+$ && -f $HERE/deployments/$ENS_DEPLOYMENT.env ]] ||
    die "unknown ENS_DEPLOYMENT '$ENS_DEPLOYMENT' (see $HERE/deployments)"
  set -a
  # shellcheck source=/dev/null
  source "$HERE/deployments/$ENS_DEPLOYMENT.env"
  set +a
  rpc="${RPC_URL:-${SEPOLIA_RPC_URL:-}}"
  [[ $rpc =~ ^https?:// && $rpc != *[[:space:]]* ]] || die "set RPC_URL, or SEPOLIA_RPC_URL in .env, to an http(s) URL"
  # forge reads FOUNDRY_ETH_RPC_URL and cast reads ETH_RPC_URL, so the URL stays out of argv.
  export FOUNDRY_ETH_RPC_URL="$rpc" ETH_RPC_URL="$rpc" ENS_DEPLOYMENT
  LOCAL_RPC=0
  if is_local "$rpc"; then LOCAL_RPC=1; fi
}

# Runs after scope_keys, so no child process ever sees a key its command does not sign with.
check_rpc() {
  local chain
  # A fork keeps chain id 11155111: keep its artifacts out of contracts/broadcast/.../11155111.
  if [[ $LOCAL_RPC == 1 && -z ${FOUNDRY_BROADCAST:-} ]]; then FOUNDRY_BROADCAST="$(mktemp -d)" && export FOUNDRY_BROADCAST; fi
  chain="$(run_cast chain-id)"
  [[ $chain == "$SEPOLIA" ]] || die "the RPC serves chain $chain, not Sepolia ($SEPOLIA)"
}

# Gives each command only the key it signs with.
scope_keys() {
  case "$1" in
    check | agent-check | claim-check)
      unset DEPLOYER_PRIVATE_KEY ATTESTER_PRIVATE_KEY AGENT_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY
      ;;
    claim-profile)
      # The demo company's key is its registry controller (DEMO_VENDOR_CONTROLLER in .env).
      if [[ -z ${COMPANY_PRIVATE_KEY:-} && -n ${DEMO_VENDOR_CONTROLLER_PRIVATE_KEY:-} ]]; then
        export COMPANY_PRIVATE_KEY="$DEMO_VENDOR_CONTROLLER_PRIVATE_KEY"
      fi
      require_key COMPANY_PRIVATE_KEY
      unset DEPLOYER_PRIVATE_KEY ATTESTER_PRIVATE_KEY AGENT_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY
      ;;
    seed)
      require_key ATTESTER_PRIVATE_KEY
      unset DEPLOYER_PRIVATE_KEY AGENT_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY
      ;;
    agent-status)
      require_key AGENT_PRIVATE_KEY
      unset DEPLOYER_PRIVATE_KEY ATTESTER_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY
      ;;
    vault-name)
      require_key VAULT_OWNER_PRIVATE_KEY
      unset DEPLOYER_PRIVATE_KEY ATTESTER_PRIVATE_KEY AGENT_PRIVATE_KEY
      ;;
    payout-name)
      # Two signers: the deployer funds the wallet for gas, then the wallet names itself. PAYOUT_KEY names the
      # .env variable holding the wallet's key (e.g. DEMO_VENDOR_PAYOUT_PRIVATE_KEY).
      if [[ -z ${PAYOUT_PRIVATE_KEY:-} && ${PAYOUT_KEY:-} =~ ^DEMO_[A-Z]+_PAYOUT_PRIVATE_KEY$ ]]; then
        export PAYOUT_PRIVATE_KEY="${!PAYOUT_KEY:-}"
      fi
      require_key DEPLOYER_PRIVATE_KEY
      require_key PAYOUT_PRIVATE_KEY
      unset ATTESTER_PRIVATE_KEY AGENT_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY
      ;;
    agent-rotate)
      # Two signers: the deployer moves the ENS role, then the vault's owner moves the vault's agent slot.
      require_key DEPLOYER_PRIVATE_KEY
      require_key VAULT_OWNER_PRIVATE_KEY
      unset ATTESTER_PRIVATE_KEY AGENT_PRIVATE_KEY
      ;;
    *)
      require_key DEPLOYER_PRIVATE_KEY
      unset ATTESTER_PRIVATE_KEY AGENT_PRIVATE_KEY VAULT_OWNER_PRIVATE_KEY COMPANY_PRIVATE_KEY
      ;;
  esac
  if [[ $1 != claim-profile ]]; then unset COMPANY_PRIVATE_KEY; fi
  if [[ $1 != payout-name ]]; then unset PAYOUT_PRIVATE_KEY; fi
  unset DEMO_VENDOR_CONTROLLER_PRIVATE_KEY
  local demo
  for demo in $(compgen -v | grep -E '^DEMO_[A-Z]+_PAYOUT_PRIVATE_KEY$' || true); do unset "$demo"; done
}

# Runs a forge script from contracts/, adding --broadcast only when BROADCAST=1.
forge_script() {
  local target="$1"
  shift
  if [[ ${BROADCAST:-0} == 1 ]]; then set -- "$@" --broadcast --slow; fi
  (cd "$CONTRACTS" && forge script "$target" "$@") 2>&1 | redact
}

# Waits until the chain clock is MIN_COMMITMENT_AGE past the commit. With FAST_FORWARD=1 on a local fork,
# moves anvil's clock instead of sleeping.
wait_commitment_age() {
  local min now ready
  min="$(run_cast call "$ENS_REGISTRAR" "MIN_COMMITMENT_AGE()(uint64)")"
  now="$(run_cast block latest --field timestamp)"
  ready=$((now + min + 1))
  while ((now < ready)); do
    if [[ $LOCAL_RPC == 1 && ${FAST_FORWARD:-0} == 1 ]]; then
      run_cast rpc evm_increaseTime $((ready - now)) >/dev/null
      run_cast rpc evm_mine >/dev/null
    else
      echo "Waiting $((ready - now))s for the commitment to mature..."
      sleep 6
    fi
    now="$(run_cast block latest --field timestamp)"
  done
}

cmd_register() {
  local out
  if [[ -n ${PAYEE_RESOLVER:-} && -n ${ENS_SUBREGISTRY:-} || -z ${PAYEE_RESOLVER:-}${ENS_SUBREGISTRY:-} ]]; then
    die "set exactly one of PAYEE_RESOLVER (payee wildcard) or ENS_SUBREGISTRY (namespace)"
  fi
  if [[ ${BROADCAST:-0} != 1 ]]; then
    forge_script script/ens/RegisterName.s.sol --sig "dryRun()"
    echo "Dry run only. Re-run with BROADCAST=1 to send the commit and register transactions."
    return
  fi
  if [[ -z ${ENS_SECRET:-} ]]; then
    ENS_SECRET="0x$(openssl rand -hex 32)"
    export ENS_SECRET
    echo "Commit salt: $ENS_SECRET (reuse it as ENS_SECRET to resume; register() publishes it anyway)"
  fi
  out="$(forge_script script/ens/RegisterName.s.sol --sig "commit()")" || {
    echo "$out"
    return 1
  }
  echo "$out"
  if [[ $out != *"nothing to do"* ]]; then
    wait_commitment_age
    forge_script script/ens/RegisterName.s.sol --sig "register()"
  fi
  # The payee check needs the PayeeResolver; a namespace (ENS_SUBREGISTRY only) is checked by agent-check.
  if [[ -n ${PAYEE_RESOLVER:-} ]]; then cmd_check; fi
}

# ERC-8004 registration of the agent, then the ENSIP-25 record on its name. The agent id comes from the Registered
# event in the real receipt (a simulation can't know it), or from AGENT_8004_ID to link an existing registration.
cmd_ensip25() {
  local receipt registered
  if [[ -z ${AGENT_8004_ID:-} ]]; then
    forge_script script/ens/AgentIdentity.s.sol --sig "register()"
    if [[ ${BROADCAST:-0} != 1 ]]; then
      echo "Dry run only. With BROADCAST=1 the agent id is read from the receipt and linked to the name."
      return
    fi
    receipt="${FOUNDRY_BROADCAST:-$CONTRACTS/broadcast}/AgentIdentity.s.sol/$SEPOLIA/register-latest.json"
    registered="$(cast keccak 'Registered(uint256,string,address)')"
    AGENT_8004_ID="$(jq -r --arg t "$registered" '[.receipts[].logs[] | select(.topics[0] == $t)][0].topics[1]' "$receipt")"
    [[ $AGENT_8004_ID =~ ^0x[0-9a-fA-F]{64}$ ]] || die "no Registered event in $receipt"
    AGENT_8004_ID="$(cast to-dec "$AGENT_8004_ID")"
    export AGENT_8004_ID
    echo "AGENT_8004_ID=$AGENT_8004_ID"
  fi
  forge_script script/ens/AgentIdentity.s.sol --sig "link()"
}

cmd_check() {
  (cd "$CONTRACTS" && forge script script/ens/CheckName.s.sol) 2>&1 | redact
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    deploy | seed | register | set-resolver | check) ;;
    agent-deploy | agent-setup | agent-status | agent-endpoint | agent-profile | agent-rotate | agent-check) ;;
    agent-ensip25 | agent-parent-profile) ;;
    vault-name) ;;
    claim-deploy | claim-attach | claim-detach | claim | claim-profile | claim-check | claim-revoke) ;;
    payout-name) ;;
    *) die "usage: ens.sh <command>; see the header of this file" ;;
  esac
  setup
  if [[ ($cmd == agent-* || $cmd == vault-name || $cmd == claim* || $cmd == payout-name) && $ENS_DEPLOYMENT != beta ]]; then
    die "$cmd targets the Beta (ENS_DEPLOYMENT=beta)"
  fi
  scope_keys "$cmd"
  check_rpc
  echo "ENS deployment: $ENS_DEPLOYMENT, $([[ $LOCAL_RPC == 1 ]] && echo "local fork" || echo "remote RPC") of chain $SEPOLIA"
  case "$cmd" in
    deploy)
      # One registry backs everything: on a real chain, only a resolver for the existing registry may be deployed.
      if [[ $LOCAL_RPC != 1 && -z ${PAYEE_REGISTRY:-} ]]; then die "set PAYEE_REGISTRY: never deploy a second registry on Sepolia"; fi
      forge_script script/ens/DeployPayeeStack.s.sol
      ;;
    seed) forge_script script/ens/SeedDemoPayee.s.sol ;;
    register) cmd_register ;;
    set-resolver) forge_script script/ens/RegisterName.s.sol --sig "setResolver()" ;;
    check) cmd_check ;;
    agent-deploy) forge_script script/ens/AgentNamespace.s.sol --sig "deploy()" ;;
    agent-setup) forge_script script/ens/AgentNamespace.s.sol --sig "setup()" ;;
    agent-status) forge_script script/ens/AgentNamespace.s.sol --sig "setStatus()" ;;
    agent-endpoint) forge_script script/ens/AgentNamespace.s.sol --sig "setEndpoint()" ;;
    agent-profile) forge_script script/ens/AgentNamespace.s.sol --sig "setProfile()" ;;
    agent-ensip25) cmd_ensip25 ;;
    agent-parent-profile) forge_script script/ens/AgentNamespace.s.sol --sig "setParentProfile()" ;;
    agent-rotate)
      # Each step sees only the key it signs with.
      (unset VAULT_OWNER_PRIVATE_KEY && forge_script script/ens/AgentNamespace.s.sol --sig "rotate()")
      (unset DEPLOYER_PRIVATE_KEY && forge_script script/ens/AgentNamespace.s.sol --sig "rotateVault()")
      ;;
    agent-check) (cd "$CONTRACTS" && forge script script/ens/CheckAgent.s.sol) 2>&1 | redact ;;
    vault-name) forge_script script/ens/VaultName.s.sol ;;
    claim-deploy) forge_script script/ens/ClaimName.s.sol --sig "deploy()" ;;
    claim-attach) forge_script script/ens/ClaimName.s.sol --sig "attach()" ;;
    claim-detach) forge_script script/ens/ClaimName.s.sol --sig "detach()" ;;
    claim) forge_script script/ens/ClaimName.s.sol --sig "claim()" ;;
    claim-profile) forge_script script/ens/ClaimName.s.sol --sig "profile()" ;;
    claim-revoke) forge_script script/ens/ClaimName.s.sol --sig "revoke()" ;;
    claim-check) (cd "$CONTRACTS" && forge script script/ens/CheckClaim.s.sol) 2>&1 | redact ;;
    payout-name)
      (unset PAYOUT_PRIVATE_KEY && forge_script script/ens/PayoutName.s.sol --sig "fund()")
      (unset DEPLOYER_PRIVATE_KEY && forge_script script/ens/PayoutName.s.sol --sig "name()")
      ;;
  esac
}

main "$@"
