import json
import random

import numpy as np

from payeebench import metrics, report
from payeebench.evaluate import load_split, slug
from payeebench.schema import QUESTIONS, label_key, option_keys


def fake_predictions(records, skill, seed):
    """Noisy one-hot-ish answers: right with probability `skill`, confidence loosely tracking correctness."""
    rng = random.Random(seed)
    out = {}
    for r in records:
        probs = {}
        for qid in QUESTIONS:
            keys = option_keys(qid)
            truth = label_key(qid, r["questions"][qid]["label"])
            pick = truth if rng.random() < skill else rng.choice([k for k in keys if k != truth])
            top = rng.uniform(0.55, 0.99)
            probs[qid] = {k: top if k == pick else (1 - top) / (len(keys) - 1) for k in keys}
        out[r["_meta"]["id"]] = {"id": r["_meta"]["id"], "probs": probs, "latency_ms": rng.uniform(80, 200), "server_ms": 50.0,
                                 "input_tokens": 600, "output_tokens": 100, "cost_usd": 1e-6}
    return out


def test_report_builds_tables_and_charts(tmp_path):
    splits = {"val": load_split("val"), "test": load_split("test")}
    status = {}
    for name, skill in (("kev-0.8b (base)", 0.6), ("payee-0.8b (ours)", 0.9)):
        status[name] = {"slug": slug(name), "ran": True, "skipped_because": None}
        for split, records in splits.items():
            path = tmp_path / "predictions" / f"{slug(name)}-{split}.jsonl"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("".join(json.dumps(p) + "\n" for p in fake_predictions(records, skill, hash((name, split)) % 1000).values()))
    status["jev (cloudflare)"] = {"slug": "jev-cloudflare", "ran": False, "skipped_because": "HTTP 402"}
    result = report.build(splits, status, 0.01, tmp_path)
    ours, base = result["contenders"]["payee-0.8b (ours)"], result["contenders"]["kev-0.8b (base)"]
    assert ours["mean_accuracy"] > base["mean_accuracy"]
    assert result["skipped"] == {"jev (cloudflare)": "HTTP 402"}
    for chart in ("accuracy", "reliability", "autoclear", "latency_cost"):
        assert (tmp_path / f"{chart}.png").stat().st_size > 10_000
    assert "payee-0.8b (ours)" in (tmp_path / "RESULTS.md").read_text()


def test_autoclear_threshold_respects_budget():
    scores = np.array([0.99, 0.98, 0.97, 0.5, 0.4])
    safe = np.array([True, True, False, True, False])
    t = metrics.best_threshold(scores, ~safe, 0.0)
    assert t == 0.98
    assert metrics.cleared_at(scores, safe, t)["false_clears"] == 0
