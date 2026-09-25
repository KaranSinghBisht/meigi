#!/usr/bin/env bash
# payee.eth on ENSv2 (Sepolia). Usage: script/ens/ens.sh <deploy|seed|register|set-resolver|check>
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

# Exports the variables these scripts use from a dotenv file (not World or agent keys), skipping any that
# are already set. Tolerates CRLF, `export`, quotes and trailing comments.
load_dotenv() {
  local line key value
  local kv='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$'
  local quoted="^[\"']([^\"']*)[\"']"
  while IFS= read -r line || [[ -n $line ]]; do
    line="${line%$'\r'}"
    [[ $line =~ $kv ]] || continue
    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    [[ $key =~ ^(SEPOLIA_RPC_URL|(DEPLOYER|ATTESTER|PAYEE|ENS)_[A-Z0-9_]+)$ ]] || continue
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
  local dotenv="${DOTENV:-$CONTRACTS/../.env}" rpc chain
  # Never load the real keys against a local RPC: a fork keeps chain id 11155111, so whatever is signed
  # there is also a valid Sepolia transaction.
  if [[ ${SKIP_DOTENV:-0} != 1 && -f $dotenv ]] && ! is_local "${RPC_URL:-}"; then load_dotenv "$dotenv"; fi
  ENS_DEPLOYMENT="${ENS_DEPLOYMENT:-hackathon}"
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
  if is_local "$rpc"; then
    LOCAL_RPC=1
    # Keep a fork's artifacts out of contracts/broadcast/.../11155111.
    if [[ -z ${FOUNDRY_BROADCAST:-} ]]; then FOUNDRY_BROADCAST="$(mktemp -d)" && export FOUNDRY_BROADCAST; fi
  fi
  chain="$(run_cast chain-id)"
  [[ $chain == "$SEPOLIA" ]] || die "the RPC serves chain $chain, not Sepolia ($SEPOLIA)"
}

# Gives each command only the key it signs with.
scope_keys() {
  case "$1" in
    check) unset DEPLOYER_PRIVATE_KEY ATTESTER_PRIVATE_KEY ;;
    seed)
      require_key ATTESTER_PRIVATE_KEY
      unset DEPLOYER_PRIVATE_KEY
      ;;
    *)
      require_key DEPLOYER_PRIVATE_KEY
      unset ATTESTER_PRIVATE_KEY
      ;;
  esac
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
  : "${PAYEE_RESOLVER:?set PAYEE_RESOLVER}"
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
  cmd_check
}

cmd_check() {
  (cd "$CONTRACTS" && forge script script/ens/CheckName.s.sol) 2>&1 | redact
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    deploy | seed | register | set-resolver | check) ;;
    *) die "usage: ens.sh <deploy|seed|register|set-resolver|check>" ;;
  esac
  setup
  scope_keys "$cmd"
  echo "ENS deployment: $ENS_DEPLOYMENT, $([[ $LOCAL_RPC == 1 ]] && echo "local fork" || echo "remote RPC") of chain $SEPOLIA"
  case "$cmd" in
    deploy) forge_script script/ens/DeployPayeeStack.s.sol ;;
    seed) forge_script script/ens/SeedDemoPayee.s.sol ;;
    register) cmd_register ;;
    set-resolver) forge_script script/ens/RegisterName.s.sol --sig "setResolver()" ;;
    check) cmd_check ;;
  esac
}

main "$@"
