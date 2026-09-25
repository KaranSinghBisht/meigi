#!/usr/bin/env bash
# The whole PayeeBench-JA pipeline on one Mac: build the data, fine-tune Kev-0.8B, calibrate, serve, evaluate.
# Needs the Kev repo next to meigi (or KEV_DIR) with `uv sync --extra serve` done once. About an hour on an M5 Max.
set -euo pipefail
BENCH="$(cd "$(dirname "$0")/.." && pwd)"
KEV_DIR="${KEV_DIR:-$BENCH/../../kev}"
cd "$BENCH"
mkdir -p runs/logs

uv run python -m payeebench.build --out dataset --nta ../data/nta/raw          # NTA check is skipped if the folder is absent
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

uv run python -m payeebench.evaluate \
  --kev "kev-0.8b (base)=http://127.0.0.1:8101" \
  --kev "kev-0.8b (base, val-fitted T)=http://127.0.0.1:8103" \
  --kev "payee-0.8b (ours)=http://127.0.0.1:8102"
