"""Prompt/completion rows for LoRA SFT of open generative models (mlx-lm) on PayeeBench-JA, and the prompts their
scorer reads. The prompt carries the same question text and item rendering the Llama contender received; the
completion is one JSON object with one option per question, as strings, so the scorer can compare option likelihoods.

    uv run python -m payeebench.sft_rows runs/sft-data      # train.jsonl, valid.jsonl, val_items.jsonl, test_items.jsonl
"""
import argparse
import json
import logging
from pathlib import Path

from .evaluate import load_split
from .llm import question_text, render_state
from .schema import QUESTIONS

log = logging.getLogger("payeebench.sft_rows")
INSTRUCTIONS = ("You triage items for the AI accounts-payable agent of a Japanese company: invoices, vendor e-mails, executive "
                "messages and x402 payment-required responses. `payee_on_file` is the vendor master record, when the agent has one. "
                "Answer the four questions about the item with one JSON object that gives exactly one option per question: the "
                "option name for request_type, \"yes\" or \"no\" for new_destination and pressure, and the level \"0\" to \"3\" "
                "for suspicion.")


def prompt(state):
    return f"{INSTRUCTIONS}\n\nQUESTIONS:\n{question_text()}\n\nITEM:\n{render_state(state)}"


def answer_key(qid, label):
    """A label as the string the model writes: option name, yes/no, or the level."""
    if QUESTIONS[qid]["type"] == "noul":
        return "yes" if label else "no"
    return str(label)


def option_labels(qid):
    """Every label a question can take, in option order (the order option_keys uses)."""
    q = QUESTIONS[qid]
    if q["type"] == "noul":
        return [False, True]
    return list(q["criteria"]) if q["type"] == "choice" else list(range(len(q["criteria"])))


def completion(record):
    return json.dumps({qid: answer_key(qid, record["questions"][qid]["label"]) for qid in QUESTIONS}, ensure_ascii=False)


def write(path, rows):
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("out", help="folder for train.jsonl and valid.jsonl (mlx-lm's names) and the scorer's item prompts")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    splits = {s: load_split(s) for s in ("train", "val", "test")}
    write(out / "train.jsonl", ({"prompt": prompt(r["state"]), "completion": completion(r)} for r in splits["train"]))
    write(out / "valid.jsonl", ({"prompt": prompt(r["state"]), "completion": completion(r)} for r in splits["val"]))
    for split in ("val", "test"):     # labels never leave the harness: the scorer sees ids and prompts only
        write(out / f"{split}_items.jsonl", ({"id": r["_meta"]["id"], "prompt": prompt(r["state"])} for r in splits[split]))
    options = {qid: {"type": q["type"], "answers": [answer_key(qid, k) for k in option_labels(qid)]} for qid, q in QUESTIONS.items()}
    (out / "options.json").write_text(json.dumps(options, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log.info("wrote %s", {s: len(rs) for s, rs in splits.items()})


if __name__ == "__main__":
    main()
