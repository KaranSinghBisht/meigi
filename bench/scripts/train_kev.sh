#!/usr/bin/env bash
# Fine-tune a released Kev checkpoint on PayeeBench-JA on this Mac (MPS, fp32), then fit its temperature on the
# validation split. Runs inside the Kev repo's uv environment.
#
#   scripts/train_kev.sh payee-0.8b                      # Kev-0.8B, the recipe in the README
#   KEV_SIZE=4b scripts/train_kev.sh payee-4b --checkpointing 1
#   SKIP_CALIBRATION=1 scripts/train_kev.sh smoke --max_steps 2    # timing check, no calibration
#
# Extra arguments go to kev.train and override the defaults below.
set -euo pipefail
BENCH="$(cd "$(dirname "$0")/.." && pwd)"
KEV_DIR="${KEV_DIR:-$BENCH/../../kev}"
SIZE="${KEV_SIZE:-0.8b}"
case "$SIZE" in
  0.8b) BASE="Qwen/Qwen3.5-0.8B-Base"; REV="dc7cdfe2ee4154fa7e30f5b51ca41bfa40174e68" ;;
  4b)   BASE="Qwen/Qwen3.5-4B-Base";   REV="1001bb4d826a52d1f399e183466143f4da7b741b" ;;
  *) echo "KEV_SIZE must be 0.8b or 4b" >&2; exit 2 ;;
esac
NAME="${1:?usage: train_kev.sh <run-name> [kev.train flags]}"; shift
OUT="$BENCH/runs/$NAME"
mkdir -p "$BENCH/runs/logs"
cd "$KEV_DIR"
START=$(date +%s)
uv run python -m kev.train --data "$BENCH/dataset/train.jsonl" --base "$BASE" --base_revision "$REV" \
  --init_from "jaredpalmer/kev-$SIZE" --device mps --epochs 2 --lr 2e-5 --batch 1 --accum 8 --max_state 512 \
  --out "$OUT" "$@"
echo "train_wall_seconds=$(( $(date +%s) - START ))"
if [[ -f "$OUT/head.pt" && -z "${SKIP_CALIBRATION:-}" ]]; then
  uv run python "$BENCH/scripts/calibrate_kev.py" --run "$OUT" --data "$BENCH/dataset/val.jsonl"
fi
