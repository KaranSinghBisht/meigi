"""Answers produced outside the harness (frontier LLMs run as Claude Code agents, and open models we fine-tuned with mlx-lm,
scored by scripts/mlx_sft_answers.py): the label-free kit the agents work from, and the scorer that puts any answer
file through the same metrics as every other contender.

    uv run python -m payeebench.external kit DIR
    uv run python -m payeebench.external score --name "claude-haiku-4.5 (agent)" --predictions FILE [--model claude-haiku-4-5] [--save]
    uv run python -m payeebench.external score --name "gemma-4-e2b-payee (ours)" --predictions TEST --val-predictions VAL --source sft --save

The condition is the Llama contender's (worker.WorkerLlama): the same system prompt, the item rendered as text, one JSON
object with a probability for every option. Timing is not measured for agent runs; cost is a list-price estimate from
token counts (the answer file's, else the counts measured for Llama 3.3 on the same prompts)."""
import argparse
import json
import logging
from pathlib import Path

import numpy as np

from . import metrics, report
from .evaluate import BENCH, load_split, slug
from .llm import SYSTEM, question_text, render_state, to_probs
from .schema import QUESTIONS, option_keys
from .worker import _format_hint, uniform

log = logging.getLogger("payeebench.external")
USD_PER_M = {"claude-haiku-4-5": (1.0, 5.0), "claude-sonnet-5": (2.0, 10.0), "claude-opus-5-5": (4.0, 20.0), "claude-fable-5-1": (10.0, 50.0)}
REFERENCES = ("payee-0.8b (ours)", "payee-4b (ours, 1 epoch)", "kev-4b (base)", "llama-3.3-70b (worker)")
KIT_README = (Path(__file__).with_name("external_kit.md")).read_text(encoding="utf-8") if Path(__file__).with_name("external_kit.md").exists() else ""


def system_prompt():
    """Exactly what the Llama contender received as its system message."""
    return SYSTEM + question_text() + _format_hint()


def make_kit(out):
    """Label-free test items (id, state, questions, the rendered user message), the prompt and the answer format."""
    out.mkdir(parents=True, exist_ok=True)
    with (out / "test_unlabeled.jsonl").open("w", encoding="utf-8") as f:
        for r in load_split("test"):
            item = {"id": r["_meta"]["id"], "state": r["state"], "questions": QUESTIONS, "user_message": render_state(r["state"])}
            assert "label" not in json.dumps(item["questions"]) and "_meta" not in item
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    (out / "system_prompt.txt").write_text(system_prompt(), encoding="utf-8")
    skeleton = {qid: ({k: 0.0 for k in option_keys(qid)} if q["type"] != "noul" else 0.0) for qid, q in QUESTIONS.items()}
    example = {"id": "payeebench/test/0000", "answer": skeleton}
    (out / "answer_format.json").write_text(json.dumps(example, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "README.md").write_text(KIT_README, encoding="utf-8")
    log.info("kit written to %s", out)


def to_distribution(qid, label, confidence):
    """A label and a confidence in it as a distribution (the rest spread evenly); an approximation for p_safe."""
    keys, c = option_keys(qid), min(1.0, max(0.0, float(confidence)))
    if QUESTIONS[qid]["type"] == "noul":
        yes = label is True or str(label).lower() == "true"
        return {"true": c if yes else 1 - c, "false": 1 - c if yes else c}
    chosen = str(label)
    return {k: c if k == chosen else (1 - c) / (len(keys) - 1) for k in keys}


def parse_line(line):
    """-> (id, probs, approximated) from either the full-distribution format or the label + confidence format."""
    row = json.loads(line)
    if "answer" in row:
        return row["id"], to_probs(row["answer"]), False
    probs = {qid: to_distribution(qid, row["labels"][qid], row["confidence"][qid]) for qid in QUESTIONS}
    return row["id"], probs, True


def load_answers(path, ids):
    answers, approximated, bad = {}, 0, 0
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            item_id, probs, approx = parse_line(line)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            bad += 1
            continue
        answers[item_id] = probs; approximated += approx
    missing = sorted(set(ids) - set(answers))
    return answers, {"answered": len(answers), "unparseable_lines": bad, "missing": len(missing), "label_confidence_format": approximated}


def token_proxy():
    """Mean input/output tokens per item measured for Llama 3.3 on the same prompts (a proxy for other tokenizers)."""
    path = BENCH / "results" / "predictions" / "llama-3-3-70b-worker-test.jsonl"
    rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines()] if path.exists() else []
    if not rows:
        return None
    return float(np.mean([r["input_tokens"] for r in rows])), float(np.mean([r["output_tokens"] for r in rows]))


def predictions(test, answers, model):
    prices = USD_PER_M.get(model)
    proxy = token_proxy() if prices else None       # token counts only matter for a list-price estimate
    cost = (proxy[0] * prices[0] + proxy[1] * prices[1]) / 1e6 if prices and proxy else None
    out = {}
    for r in test:
        item_id = r["_meta"]["id"]
        probs = answers.get(item_id)
        out[item_id] = {"id": item_id, "probs": probs or uniform(), "latency_ms": None, "server_ms": None,
                        "input_tokens": proxy[0] if proxy else None, "output_tokens": proxy[1] if proxy else None,
                        "cost_usd": cost, "cost_estimated": cost is not None, "parse_error": probs is None}
    return out


def paired_against_references(test, preds):
    """Paired accuracy deltas (candidate minus reference) against the saved predictions of the reference contenders."""
    status = json.loads((BENCH / "results" / "contenders.json").read_text(encoding="utf-8"))
    _, _, ok = metrics.per_question(test, preds)
    out = {}
    for name in REFERENCES:
        ref = report.load_predictions(BENCH / "results", status[name]["slug"], "test") if name in status else None
        if ref:
            out[name] = metrics.paired(ok, metrics.per_question(test, ref)[2], len(test))
    return out


def save(name, model, preds, val_preds=None, source="agent"):
    """Add the contender to results/: its predictions (validation too, when given, so it gets a deployed threshold),
    a status entry, and a regenerated report and charts."""
    out = BENCH / "results"
    for split, rows in (("test", preds), ("val", val_preds)):
        if rows:
            path = out / "predictions" / f"{slug(name)}-{split}.jsonl"
            path.write_text("".join(json.dumps(p, ensure_ascii=False) + "\n" for p in rows.values()), encoding="utf-8")
    status_path = out / "contenders.json"
    status = json.loads(status_path.read_text(encoding="utf-8"))
    status[name] = {"slug": slug(name), "kind": "llm", "ran": True, "skipped_because": None, "source": source, "model": model}
    status_path.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report.build({"val": load_split("val"), "test": load_split("test")}, status, 0.01, out)


def score(a):
    test, val = load_split("test"), load_split("val")
    answers, counts = load_answers(a.predictions, [r["_meta"]["id"] for r in test])
    preds, val_preds = predictions(test, answers, a.model), None
    if a.val_predictions:
        val_answers, val_counts = load_answers(a.val_predictions, [r["_meta"]["id"] for r in val])
        val_preds = predictions(val, val_answers, a.model)
        log.info("validation answers: %s", json.dumps(val_counts))
    summary = report.summarize(test, preds, val_preds, val, 0.01)
    log.info("answers: %s", json.dumps(counts))
    log.info("\n".join(report.HEADER + [report.row(a.name, summary)]))
    for ref, c in paired_against_references(test, preds).items():
        log.info("%s vs %s: accuracy %+.1f pts, 95%% CI [%+.1f, %+.1f], McNemar p=%.2g", a.name, ref, 100 * c["delta"],
                 100 * c["ci95"][0], 100 * c["ci95"][1], c["mcnemar_exact_p"])
    if a.save:
        save(a.name, a.model, preds, val_preds, a.source)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("kit", help="write the label-free kit")
    k.add_argument("out")
    s = sub.add_parser("score", help="score an answer file against the test labels")
    s.add_argument("--name", required=True)
    s.add_argument("--predictions", required=True)
    s.add_argument("--model", default="", help=f"one of {sorted(USD_PER_M)}, for the list-price cost estimate")
    s.add_argument("--val-predictions", default="", help="answers for the validation split, for a deployed auto-clear threshold")
    s.add_argument("--source", default="agent", choices=["agent", "sft"], help="agent: a Claude Code agent's answers; sft: our fine-tune of an open model")
    s.add_argument("--save", action="store_true", help="add the contender to results/ (predictions, RESULTS.md, charts)")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if a.cmd == "kit":
        make_kit(Path(a.out))
    else:
        score(a)


if __name__ == "__main__":
    main()
