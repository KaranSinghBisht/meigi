#!/usr/bin/env bash
# Serve a Kev checkpoint on this Mac with TypeSafe's /v1/systemone API (MLX, bf16, calibrated temperature from head.pt).
#
#   scripts/serve_kev.sh jaredpalmer/kev-0.8b 8101        # released model
#   scripts/serve_kev.sh runs/payee-0.8b 8102             # our fine-tune (path relative to bench/)
#
# Runs in the foreground; put it in the background yourself (logs: runs/logs/serve-<port>.log in reproduce.sh).
set -euo pipefail
BENCH="$(cd "$(dirname "$0")/.." && pwd)"
KEV_DIR="${KEV_DIR:-$BENCH/../../kev}"
RUN="${1:?usage: serve_kev.sh <checkpoint dir or hub id> <port>}"
PORT="${2:?port}"
[[ -d "$BENCH/$RUN" ]] && RUN="$BENCH/$RUN"
cd "$KEV_DIR"
exec uv run --extra serve python -m kev.serve --run "$RUN" --port "$PORT"
