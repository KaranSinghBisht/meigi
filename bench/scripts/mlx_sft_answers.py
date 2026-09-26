"""Answers from an mlx-lm model (base or LoRA-tuned) for the PayeeBench-JA items, in the kit's answer format, so
`payeebench.external score` puts them through the same metrics as every other contender.

Each question is scored by likelihood, in the order of the JSON the model was trained to write: for every option the
log-probability of the answer string so far plus that option, a softmax over the options gives the distribution, and the
most likely option is written before the next question is scored. Runs in an mlx-lm environment, not the bench one:

    uv run --no-project --with mlx-lm==0.31.3 python scripts/mlx_sft_answers.py --model google/gemma-4-E2B-it \\
        --adapter runs/gemma-4-e2b-payee --rows runs/sft-data --split test --out runs/gemma-4-e2b-payee/test_answers.jsonl
"""
import argparse
import json
import logging
import math
import time
from pathlib import Path

import mlx.core as mx
import mlx_compat  # noqa: F401  (lets mlx-lm load Gemma 4 E2B)
from mlx_lm import load
from mlx_lm.models.cache import can_trim_prompt_cache, make_prompt_cache, trim_prompt_cache

log = logging.getLogger("mlx_sft_answers")


class Scorer:
    """Log-probability of continuations after one prompt, re-using the prompt's KV cache when the cache can be trimmed."""

    def __init__(self, model, prompt_ids):
        self.model, self.prompt_ids = model, prompt_ids
        self.cache = make_prompt_cache(model)
        model(mx.array([prompt_ids[:-1]]), cache=self.cache)
        if not can_trim_prompt_cache(self.cache):
            self.cache = None

    def logprob(self, cont_ids):
        if self.cache is not None:
            inputs = [self.prompt_ids[-1], *cont_ids[:-1]]
            logits = self.model(mx.array([inputs]), cache=self.cache)[0]
            trim_prompt_cache(self.cache, len(inputs))
        else:
            logits = self.model(mx.array([self.prompt_ids + cont_ids]))[0][len(self.prompt_ids) - 1:-1]
        logits = logits.astype(mx.float32)
        lp = logits - mx.logsumexp(logits, axis=-1, keepdims=True)
        return float(mx.sum(lp[mx.arange(len(cont_ids)), mx.array(cont_ids)]))


def softmax(scores):
    top = max(scores)
    exp = [math.exp(s - top) for s in scores]
    return [e / sum(exp) for e in exp]


def answer(model, tokenizer, prompt, options):
    """The kit's answer object for one item: a distribution per question, scored left to right."""
    prompt_ids = list(tokenizer.apply_chat_template([{"role": "user", "content": prompt}], add_generation_prompt=True, return_dict=False))
    scorer, text, out = Scorer(model, prompt_ids), "", {}
    for i, (qid, spec) in enumerate(options.items()):
        head = text + ("{" if i == 0 else ", ") + json.dumps(qid) + ': "'
        scores = [scorer.logprob(tokenizer.encode(head + a + '"', add_special_tokens=False)) for a in spec["answers"]]
        probs = softmax(scores)
        best = spec["answers"][probs.index(max(probs))]
        text = head + best + '"'
        dist = dict(zip(spec["answers"], probs))
        out[qid] = dist["yes"] if spec["type"] == "noul" else dist
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--model", required=True, help="Hub id or local path of the base model")
    ap.add_argument("--adapter", default=None, help="mlx-lm LoRA adapter folder (none: the base model, zero-shot)")
    ap.add_argument("--rows", required=True, help="folder written by `python -m payeebench.sft_rows`")
    ap.add_argument("--split", choices=["val", "test"], required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    rows = Path(a.rows)
    options = json.loads((rows / "options.json").read_text(encoding="utf-8"))
    items = [json.loads(line) for line in (rows / f"{a.split}_items.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    model, tokenizer = load(a.model, adapter_path=a.adapter)
    start = time.time()
    with open(a.out, "w", encoding="utf-8") as f:
        for n, item in enumerate(items, 1):
            f.write(json.dumps({"id": item["id"], "answer": answer(model, tokenizer, item["prompt"], options)}, ensure_ascii=False) + "\n")
            if n % 25 == 0:
                log.info("%d/%d items, %.2f s per item", n, len(items), (time.time() - start) / n)
    log.info("wrote %d answers to %s in %.0f s", len(items), a.out, time.time() - start)


if __name__ == "__main__":
    main()
