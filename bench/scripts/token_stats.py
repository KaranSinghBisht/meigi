"""Token lengths of PayeeBench records under a Kev base tokenizer, and whether each fits Kev's training context.
Runs in the Kev repo's environment (it imports kev):

    cd $KEV_DIR && uv run python $BENCH/scripts/token_stats.py --data $BENCH/dataset/train.jsonl --max_state 768
"""
import argparse
import json
import logging

import numpy as np
from kev.data import load_records, materialize
from kev.model import fits, load_tokenizer, training_context, user_tokens

log = logging.getLogger("token_stats")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", nargs="+", required=True)
    ap.add_argument("--base", default="Qwen/Qwen3.5-0.8B-Base")
    ap.add_argument("--revision", default="dc7cdfe2ee4154fa7e30f5b51ca41bfa40174e68")
    ap.add_argument("--max_state", type=int, default=384)
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    tok = load_tokenizer(a.base, revision=a.revision)
    ctx = training_context(a.max_state)
    out = {}
    for path in a.data:
        recs = [materialize(r) for r in load_records(path)]
        lengths = np.array([len(user_tokens(tok, r["state"])) for r in recs])
        fit = sum(fits(r, tok, **ctx) for r in recs)
        out[path] = {"n": len(recs), "state_tokens": {"mean": int(lengths.mean()), "p95": int(np.percentile(lengths, 95)), "max": int(lengths.max())},
                     "over_384": int((lengths > 384).sum()), f"fit_at_max_state_{a.max_state}": fit}
    log.info(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
