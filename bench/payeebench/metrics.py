"""Scores from saved predictions: accuracy and macro-F1 per question, calibration (ECE and reliability bins), the
auto-clear rate at an error budget, latency and cost, and a paired comparison of two contenders."""
import math

import numpy as np

from .schema import QUESTION_IDS, QUESTIONS, is_safe, label_key, option_keys, p_safe

BINS = 10


def question_arrays(records, preds, qid):
    """-> (label index per item, probability matrix [items x options]) for one question."""
    keys = option_keys(qid)
    y = np.array([keys.index(label_key(qid, r["questions"][qid]["label"])) for r in records])
    p = np.array([[preds[r["_meta"]["id"]]["probs"][qid][k] for k in keys] for r in records])
    return y, p


def macro_f1(y, yhat, k):
    scores = []
    for c in range(k):
        tp = int(((yhat == c) & (y == c)).sum())
        denom = int((yhat == c).sum()) + int((y == c).sum())
        if (y == c).any():
            scores.append(2 * tp / denom if denom else 0.0)
    return float(np.mean(scores))


def ece(conf, correct, bins=BINS):
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf >= lo) & ((conf < hi) if hi < 1 else (conf <= hi))
        if m.any():
            total += m.mean() * abs(correct[m].mean() - conf[m].mean())
    return float(total)


def reliability(conf, correct, bins=BINS):
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf >= lo) & ((conf < hi) if hi < 1 else (conf <= hi))
        if m.any():
            out.append({"lo": float(lo), "hi": float(hi), "n": int(m.sum()), "accuracy": float(correct[m].mean()), "confidence": float(conf[m].mean())})
    return out


def per_question(records, preds):
    """Accuracy, macro-F1 and ECE per question, plus the pooled top-label confidence/correctness of every answer."""
    out, conf_all, ok_all = {}, [], []
    for qid in QUESTION_IDS:
        y, p = question_arrays(records, preds, qid)
        yhat, conf = p.argmax(1), p.max(1)
        ok = (yhat == y).astype(float)
        out[qid] = {"accuracy": float(ok.mean()), "macro_f1": macro_f1(y, yhat, p.shape[1]), "ece": ece(conf, ok)}
        if QUESTIONS[qid]["type"] == "score":
            out[qid]["mae"] = float(np.abs(p @ np.arange(p.shape[1]) - y).mean())
        conf_all.append(conf); ok_all.append(ok)
    return out, np.concatenate(conf_all), np.concatenate(ok_all)


def _clear_groups(scores, unsafe):
    """Descending distinct scores with cumulative cleared/unsafe counts (ties are cleared together)."""
    order = np.argsort(-scores, kind="stable")
    s, bad = scores[order], np.cumsum(unsafe[order])
    ends = np.r_[np.flatnonzero(s[1:] != s[:-1]), len(s) - 1]
    return s[ends], ends + 1, bad[ends]


def best_threshold(scores, unsafe, budget):
    """Lowest threshold whose cleared set has an unsafe share <= budget, or None when even the top group fails."""
    thresholds, cleared, bad = _clear_groups(scores, unsafe)
    ok = np.flatnonzero(bad <= budget * cleared)
    return float(thresholds[ok[-1]]) if len(ok) else None


def cleared_at(scores, safe, threshold):
    take = scores >= threshold if threshold is not None else np.zeros(len(scores), bool)
    n_clear, false_clears = int(take.sum()), int((take & ~safe).sum())
    return {"threshold": threshold, "auto_clear_rate": n_clear / len(scores), "legit_cleared": int((take & safe).sum()) / max(1, int(safe.sum())),
            "cleared": n_clear, "false_clears": false_clears, "false_clear_rate": false_clears / n_clear if n_clear else 0.0}


def safe_scores(records, preds):
    scores = np.array([p_safe(preds[r["_meta"]["id"]]["probs"]) for r in records])
    safe = np.array([is_safe({q: r["questions"][q]["label"] for q in QUESTION_IDS}) for r in records])
    return scores, safe


def autoclear(test, val, budget):
    """Oracle: the best threshold chosen on the test items themselves (what an ideal ranking allows).
    Deployed: the threshold chosen on validation at the same budget, applied to test (what you would actually get)."""
    s_test, safe_test = test
    oracle = cleared_at(s_test, safe_test, best_threshold(s_test, ~safe_test, budget))
    out = {"budget": budget, "oracle": oracle}
    if val is not None:
        s_val, safe_val = val
        out["deployed"] = cleared_at(s_test, safe_test, best_threshold(s_val, ~safe_val, budget))
    return out


def latency(preds):
    wall = np.array([p["latency_ms"] for p in preds.values()])
    server = [p["server_ms"] for p in preds.values() if p.get("server_ms") is not None]
    out = {"p50": float(np.percentile(wall, 50)), "p95": float(np.percentile(wall, 95))}
    if server:
        out.update(server_p50=float(np.percentile(server, 50)), server_p95=float(np.percentile(server, 95)))
    return out


def usd_per_1k(preds):
    costs = [p.get("cost_usd") for p in preds.values()]
    return 1000 * float(np.mean(costs)) if costs and all(c is not None for c in costs) else None


def mcnemar_exact(b, c):
    n, k = b + c, min(b, c)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n) if n else 1.0


def paired(ok_a, ok_b, items, samples=10000, seed=0):
    """Candidate a minus reference b on the same answers: accuracy delta with an item-clustered bootstrap CI (an item's
    four answers are resampled together) and the exact McNemar p on discordant answers."""
    d = (ok_a - ok_b).reshape(len(QUESTION_IDS), items).sum(0)       # per-item delta, summed over questions
    rng = np.random.default_rng(seed)
    boots = d[rng.integers(0, items, (samples, items))].sum(1) / (items * len(QUESTION_IDS))
    lo, hi = np.percentile(boots, [2.5, 97.5])
    right, wrong = int(((ok_a == 1) & (ok_b == 0)).sum()), int(((ok_a == 0) & (ok_b == 1)).sum())
    return {"delta": float((ok_a - ok_b).mean()), "ci95": [float(lo), float(hi)], "newly_right": right, "newly_wrong": wrong,
            "mcnemar_exact_p": mcnemar_exact(right, wrong)}
