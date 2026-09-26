#!/usr/bin/env bash
# Builds the web app (whose "/" is the Sakasa Fuji landing hero) in hosted mode and deploys it as one site, the
# static-assets Cloudflare Worker meigi (apps/web/wrangler.landing.jsonc). The old second host, meigi-app
# (apps/web/wrangler.jsonc), is now a small Worker that 301-redirects every path to the one site. Every VITE_
# value is compiled into a public bundle, so before deploying, the script checks that no secret from the
# git-ignored .env appears in the build. apps/landing is no longer deployed.
#
# It always builds the committed HEAD in a temporary git worktree, so uncommitted work in progress never ships.
#
#   scripts/deploy-demo.sh              # build HEAD, check, deploy
#   DRY_RUN=1 scripts/deploy-demo.sh    # build and check only
#
# Needs `npx wrangler login`. Optional: WORKERS_SUBDOMAIN (the account's workers.dev subdomain), GITHUB_URL
# (adds the dock's GitHub pill), CONTACT_EMAIL (the business page's "Talk to us"), PUBLIC_RPC_URL.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WORKERS_SUBDOMAIN="${WORKERS_SUBDOMAIN:-karanbishttt}"
LANDING_URL="https://meigi.${WORKERS_SUBDOMAIN}.workers.dev"
OLD_APP_URL="https://meigi-app.${WORKERS_SUBDOMAIN}.workers.dev"
PUBLIC_RPC_URL="${PUBLIC_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
CONTACT_EMAIL="${CONTACT_EMAIL:-karanbishttt@gmail.com}"
WORKTREE="$(mktemp -d)/meigi-deploy"
REGISTRY_FROM_BLOCK=11781105 # block of the v2 registry deployment (docs/runbook.md)

# A clean checkout of HEAD with its own install (pnpm hard-links from the shared store, so this is quick).
checkout_head() {
  git worktree add --detach --quiet "$WORKTREE" HEAD
  trap 'git worktree remove --force "$WORKTREE"' EXIT
  (cd "$WORKTREE" && pnpm install --frozen-lockfile --prefer-offline --filter "@meigi/web..." >/dev/null)
  echo "building $(git rev-parse --short HEAD) in a clean worktree"
}

build_app() {
  (cd "$WORKTREE" && VITE_HOSTED=1 VITE_GITHUB_URL="${GITHUB_URL:-}" VITE_CONTACT_EMAIL="$CONTACT_EMAIL" \
    VITE_RPC_URL="$PUBLIC_RPC_URL" VITE_REGISTRY_FROM_BLOCK="$REGISTRY_FROM_BLOCK" \
    pnpm --filter @meigi/web build)
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

# Runs from apps/web: wrangler refuses to auto-detect at a workspace root, and each config names its Worker and
# points at the same dist/.
deploy() {
  (cd "$WORKTREE/apps/web" && npx wrangler deploy --config "$1")
}

checkout_head
build_app
check_no_secrets "$WORKTREE/apps/web/dist"
echo "build is clean: ${LANDING_URL} will serve it, and ${OLD_APP_URL} redirects there"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "DRY_RUN=1: not deploying"
  exit 0
fi

deploy wrangler.landing.jsonc
deploy wrangler.jsonc
