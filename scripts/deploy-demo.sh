#!/usr/bin/env bash
# Builds the landing page and the web app for the public demo and deploys each as a static-assets Cloudflare
# Worker (apps/*/wrangler.jsonc; both are single-page apps at the root of their host). Every VITE_ value is
# compiled into a public bundle, so before deploying, the script checks that no secret from the git-ignored .env
# appears in either build.
#
#   scripts/deploy-demo.sh              # build, check, deploy
#   DRY_RUN=1 scripts/deploy-demo.sh    # build and check only
#
# Needs `npx wrangler login`. Optional: WORKERS_SUBDOMAIN (the account's workers.dev subdomain),
# LANDING_URL / APP_URL, GITHUB_URL, PUBLIC_RPC_URL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WORKERS_SUBDOMAIN="${WORKERS_SUBDOMAIN:-karanbishttt}"
LANDING_URL="${LANDING_URL:-https://meigi.${WORKERS_SUBDOMAIN}.workers.dev}"
APP_URL="${APP_URL:-https://meigi-app.${WORKERS_SUBDOMAIN}.workers.dev}"
PUBLIC_RPC_URL="${PUBLIC_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
REGISTRY="$(jq -er .registry contracts/deployments/11155111.json)"
REGISTRY_FROM_BLOCK=11781105 # block of the v2 registry deployment (docs/runbook.md)

build_landing() {
  VITE_APP_URL="$APP_URL" VITE_GITHUB_URL="${GITHUB_URL:-}" VITE_RPC_URL="$PUBLIC_RPC_URL" \
    VITE_REGISTRY_ADDRESS="$REGISTRY" VITE_REGISTRY_FROM_BLOCK="$REGISTRY_FROM_BLOCK" \
    pnpm --filter @meigi/landing build
}

build_app() {
  VITE_HOSTED=1 VITE_LANDING_URL="$LANDING_URL" VITE_RPC_URL="$PUBLIC_RPC_URL" \
    VITE_REGISTRY_FROM_BLOCK="$REGISTRY_FROM_BLOCK" \
    pnpm --filter @meigi/web build
}

# Fails if any secret-looking .env value (keys, tokens, the private RPC URL) occurs in a build directory.
# Values are never printed, only the variable names.
check_no_secrets() {
  local leaks=0 name value
  [[ -f .env ]] || { echo "no .env to check against" >&2; return 1; }
  while IFS='=' read -r name value; do
    [[ "$name" =~ (PRIVATE_KEY|SIGNING_KEY|TOKEN|SECRET|API_KEY|RPC_URL)$ ]] || continue
    value="${value%\"}"
    value="${value#\"}"
    [[ ${#value} -ge 12 ]] || continue
    # An RPC URL is only secret when it carries a key in its path or query; a bare public host is not.
    [[ "$name" == *RPC_URL && "$value" =~ ^https?://[^/?]+/?$ ]] && continue
    for dir in "$@"; do
      if grep -rqF -- "$value" "$dir" || grep -rqF -- "${value#0x}" "$dir"; then
        echo "refusing to deploy: the value of $name appears in $dir" >&2
        leaks=1
      fi
    done
  done < <(grep -E '^[A-Z0-9_]+=' .env)
  return "$leaks"
}

# Runs from the app directory: wrangler refuses to auto-detect at a workspace root, and the app's
# wrangler.jsonc names the Worker and points at its dist/.
deploy() {
  (cd "$1" && npx wrangler deploy)
}

build_landing
build_app
check_no_secrets apps/landing/dist apps/web/dist
echo "builds are clean: landing → ${LANDING_URL}, app → ${APP_URL}"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "DRY_RUN=1: not deploying"
  exit 0
fi

deploy apps/landing
deploy apps/web
