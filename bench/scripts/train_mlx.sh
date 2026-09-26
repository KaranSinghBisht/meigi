#!/usr/bin/env bash
# LoRA SFT of an open generative model on the 600 PayeeBench-JA train items with mlx-lm, on this Mac, then its answers
# for the validation and test items (scripts/mlx_sft_answers.py). Score them with payeebench.external afterwards.
#
#   uv run python -m payeebench.sft_rows runs/sft-data                         # once
#   scripts/train_mlx.sh gemma-4-e2b-payee google/gemma-4-E2B-it
#   scripts/train_mlx.sh llama-3.2-3b-payee mlx-community/Llama-3.2-3B-Instruct --grad-checkpoint
#
# Two epochs at batch 4 (150 steps each), an adapter saved after every epoch, all layers, rank 8, learning rate 2e-5
# (1e-4 diverged for Llama 3.2 3B after about 60 steps), loss on the answer only. Extra arguments go to mlx_lm.lora and
# override these. scripts/mlx_compat.py lets mlx-lm 0.31.3 load Gemma 4 E2B.
set -euo pipefail
BENCH="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${1:?usage: train_mlx.sh <run-name> <model> [mlx_lm.lora flags]}"; MODEL="${2:?model}"; shift 2
OUT="$BENCH/runs/$NAME"
ROWS="$BENCH/runs/sft-data"
MLX=(uv run --no-project --with mlx-lm==0.31.3 python)
TRAIN_ROWS=$(wc -l < "$ROWS/train.jsonl")
EPOCH=$(( (TRAIN_ROWS + 3) / 4 ))
LOG="$BENCH/runs/logs/$NAME.log"
mkdir -p "$OUT" "$BENCH/runs/logs"
cd "$BENCH"
START=$(date +%s)
"${MLX[@]}" scripts/mlx_compat.py lora --model "$MODEL" --train --data "$ROWS" --fine-tune-type lora --num-layers -1 \
  --batch-size 4 --iters $(( 2 * EPOCH )) --learning-rate 2e-5 --mask-prompt --max-seq-length 3072 --seed 0 \
  --save-every "$EPOCH" --steps-per-report 10 --steps-per-eval "$EPOCH" --val-batches 25 --adapter-path "$OUT" "$@" 2>&1 | tee "$LOG"
WALL=$(( $(date +%s) - START ))
echo "train_wall_seconds=$WALL" | tee -a "$LOG"
python3 scripts/mlx_run_record.py "$NAME" "$LOG" --wall "$WALL"
for split in test val; do     # test first, so a stopped window still leaves test answers
  "${MLX[@]}" scripts/mlx_sft_answers.py --model "$MODEL" --adapter "$OUT" --rows "$ROWS" --split "$split" \
    --out "$OUT/${split}_answers.jsonl"
done
echo "total_wall_seconds=$(( $(date +%s) - START ))"
