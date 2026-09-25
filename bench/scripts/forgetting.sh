#!/usr/bin/env bash
# Did the fine-tune forget general skills? Score a served model on Kev's frozen "new sources" development suite
# (transfer-v4: 764 records from datasets and policies Kev never trained on) through the same /v1/systemone API.
#
#   scripts/forgetting.sh 8101 kev-0.8b     # released model
#   scripts/forgetting.sh 8102 payee-0.8b   # fine-tune
set -euo pipefail
BENCH="$(cd "$(dirname "$0")/.." && pwd)"
KEV_DIR="${KEV_DIR:-$BENCH/../../kev}"
PORT="${1:?port}"; NAME="${2:?name}"
OUT="$BENCH/runs/forgetting/$NAME"
rm -rf "$OUT"; mkdir -p "$(dirname "$OUT")"
cd "$KEV_DIR"
uv run python -m kev.benchmark --remote "http://127.0.0.1:$PORT" --suite evals/v4/transfer-v4 --out "$OUT" --remote-concurrency 1 > "$OUT.log" 2>&1
python3 -c "import json,sys; r=json.load(open('$OUT/report.json'))['clean']; print('$NAME', {k: round(r[k], 3) for k in ('n', 'acc', 'ece', 'brier')})"
