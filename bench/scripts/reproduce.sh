#!/usr/bin/env bash
# The whole PayeeBench-JA pipeline on one Mac: build the data, fine-tune Kev-0.8B, calibrate, serve, evaluate.
# Needs the Kev repo next to meigi (or KEV_DIR) with `uv sync --extra serve` done once. About an hour on an M5 Max.
set -euo pipefail
BENCH="$(cd "$(dirname "$0")/.." && pwd)"
KEV_DIR="${KEV_DIR:-$BENCH/../../kev}"
cd "$BENCH"
mkdir -p runs/logs

# Rebuild into a scratch folder and compare with the committed splits, which training always uses. The rebuild is byte
# for byte identical only when meigi/data/nta exists: without it the name checks draw a different train/val split.
check="$(mktemp -d)"
uv run python -m payeebench.build --out "$check"
for split in train val test; do
  cmp -s "$check/$split.jsonl" "dataset/$split.jsonl" \
    || echo "note: rebuilt $split.jsonl differs from dataset/ (NTA files missing?); training uses the committed dataset" >&2
done
rm -rf "$check"
scripts/train_kev.sh payee-0.8b --shared_prefix 1 2>&1 | tee runs/logs/payee-0.8b.log
# the released model with a temperature refitted on our validation split (a fair "calibrated zero-shot" arm)
(cd "$KEV_DIR" && uv run python "$BENCH/scripts/calibrate_kev.py" --copy_from jaredpalmer/kev-0.8b \
    --run "$BENCH/runs/kev-0.8b-valT" --data "$BENCH/dataset/val.jsonl")

scripts/serve_kev.sh jaredpalmer/kev-0.8b 8101 > runs/logs/serve-8101.log 2>&1 &
scripts/serve_kev.sh runs/kev-0.8b-valT 8103 > runs/logs/serve-8103.log 2>&1 &
scripts/serve_kev.sh runs/payee-0.8b 8102 > runs/logs/serve-8102.log 2>&1 &
trap 'kill $(jobs -p) 2>/dev/null' EXIT
for port in 8101 8102 8103; do
  until curl -sf "localhost:$port/v1/models" > /dev/null; do sleep 2; done
done

# optional, ~65 min and ~26 GB: the 4B fine-tune that fits a 48 GB Mac (README, "The fine-tune, on this MacBook")
#   PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.7 PYTORCH_MPS_LOW_WATERMARK_RATIO=0.6 KEV_SIZE=4b \
#     scripts/train_kev.sh payee-4b --shared_prefix 1 --weights_dtype bf16 --checkpointing 1 --epochs 1

uv run python -m payeebench.evaluate \
  --kev "kev-0.8b (base)=http://127.0.0.1:8101" \
  --kev "kev-0.8b (base, val-fitted T)=http://127.0.0.1:8103" \
  --kev "payee-0.8b (ours)=http://127.0.0.1:8102"
