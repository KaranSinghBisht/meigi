"""Statistics the paper reports beyond results/results.json, recomputed from the saved test predictions
(results/predictions/) and the dataset:

- threshold-free routing: AUROC of p_safe (safe items against items that should be held), and the most safe items one
  threshold clears while letting at most k held items through;
- the binary suspicion split that p_safe uses (levels 0-1 against 2-3), scored by the top level and by probability mass;
- answers whose gold label follows one of our labelling conventions (CONVENTIONS), and the paired lead without them;
- family-clustered intervals (families, then items within them, resampled) next to item-level ones, and an item-level
  sign test;
- a bootstrap interval for the deployed auto-clear rate, confident errors, and dataset facts (family-majority
  reference, families whose labels never vary, red-flag cues that decide the label by construction).

    cd bench && uv run python paper/analysis.py        # writes paper/generated/analysis.json
"""
import json
import logging
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

BENCH = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BENCH))
from payeebench import metrics
from payeebench.evaluate import load_split
from payeebench.injections import BYPASS, REDIRECT
from payeebench.pools import FREE_MAIL
from payeebench.report import load_predictions
from payeebench.schema import MAX_SAFE_SUSPICION, QUESTION_IDS

OUT = BENCH / "paper" / "generated" / "analysis.json"
OURS, OURS4 = "payee-0.8b (ours)", "payee-4b (ours, 1 epoch)"
SAMPLES, SEED, CONFIDENT = 10_000, 0, 0.9
# Answers whose gold label follows a convention we chose, which the question text alone does not settle
CONVENTIONS = {"exec_legit": ("pressure", "suspicion"), "reminder_overdue": ("suspicion",), "change_legit": ("suspicion",),
               "x402_overcharge": ("suspicion",), "injection_redirect": ("request_type",), "refund_scam": ("request_type",)}
log = logging.getLogger("analysis")


def contender(records, slug, split="test"):
    """Per-answer correctness and confidence (questions x items), suspicion gold and probabilities, p_safe.
    None when the split has no complete predictions (zero-shot LLMs have no validation run)."""
    preds = load_predictions(BENCH / "results", slug, split)
    if not preds or len(preds) < len(records):
        return None
    _, conf, ok = metrics.per_question(records, preds)
    gold, probs = metrics.question_arrays(records, preds, "suspicion")
    scores, safe = metrics.safe_scores(records, preds)
    shape = (len(QUESTION_IDS), len(records))
    return {"ok": ok.reshape(shape), "conf": conf.reshape(shape), "susp_gold": gold, "susp_probs": probs, "scores": scores, "safe": safe}


def interval(stats):
    lo, hi = np.percentile(stats, [2.5, 97.5])
    return [float(lo), float(hi)]


def auroc(scores, positive):
    """Chance that a random positive scores above a random negative, ties counted half."""
    pos, neg = scores[positive], scores[~positive]
    if not len(pos) or not len(neg):
        return float("nan")
    wins = (pos[:, None] > neg[None, :]).sum() + 0.5 * (pos[:, None] == neg[None, :]).sum()
    return float(wins / (len(pos) * len(neg)))


def cleared_with_unsafe(scores, safe, k):
    """Most safe items one threshold clears while letting at most k held items through (ties clear together)."""
    _, cleared, bad = metrics.clear_groups(scores, ~safe)
    ok = bad <= k
    return int((cleared[ok] - bad[ok]).max()) if ok.any() else 0


def binary_suspicion_ok(c, rule="top"):
    """Correct on suspicion 0-1 against 2-3: by the top level ("top"), or by where the probability mass lies ("mass",
    the P(suspicion <= 1) that enters p_safe), an even split counting as held, as routing treats it."""
    held = c["susp_probs"][:, MAX_SAFE_SUSPICION + 1:].sum(1)
    unsafe = c["susp_probs"].argmax(1) > MAX_SAFE_SUSPICION if rule == "top" else held >= 0.5
    return (unsafe == (c["susp_gold"] > MAX_SAFE_SUSPICION)).astype(float)


def draw_families(groups, rng):
    """One two-level resample: families with replacement, then items within each drawn family."""
    drawn = [groups[g] for g in rng.integers(0, len(groups), len(groups))]
    return np.concatenate([g[rng.integers(0, len(g), len(g))] for g in drawn])


def boot_items(diff, weight, rng):
    idx = rng.integers(0, len(diff), (SAMPLES, len(diff)))
    return interval(diff[idx].sum(1) / weight[idx].sum(1))


def boot_families(diff, weight, groups, rng):
    stats = np.empty(SAMPLES)
    for s in range(SAMPLES):
        idx = draw_families(groups, rng)
        stats[s] = diff[idx].sum() / weight[idx].sum()
    return interval(stats)


def boot_stat(stat, n, groups):
    """Item-level and family-clustered 95% intervals of any statistic of a resample; resamples where the statistic is
    undefined (None) are skipped."""
    out = {}
    for level in ("items", "families"):
        rng, stats = np.random.default_rng(SEED), []
        for _ in range(SAMPLES):
            v = stat(rng.integers(0, n, n) if level == "items" else draw_families(groups, rng))
            if v is not None:
                stats.append(v)
        out[f"ci_{level}"] = interval(stats)
    return out


def paired(ok_a, ok_b, groups, keep=None):
    """a minus b on the same answers (only where keep is True): delta, item-bootstrap and family-clustered 95% intervals,
    and an exact two-sided sign test over items (an item's answers form one observation)."""
    keep = np.ones_like(ok_a, bool) if keep is None else keep
    diff, weight = ((ok_a - ok_b) * keep).sum(0), keep.sum(0)
    better, worse = int((diff > 0).sum()), int((diff < 0).sum())
    return {"delta": float(diff.sum() / weight.sum()), "answers": int(weight.sum()),
            "ci_items": boot_items(diff, weight, np.random.default_rng(SEED)),
            "ci_families": boot_families(diff, weight, groups, np.random.default_rng(SEED)),
            "items_better": better, "items_worse": worse, "sign_p": metrics.mcnemar_exact(better, worse)}


def routing_deltas(a, b, groups):
    """a minus b in AUROC of p_safe, and in the share of safe items cleared with at most 0 or 1 held items."""
    safe = a["safe"]

    def auroc_diff(idx):
        s = safe[idx]
        return auroc(a["scores"][idx], s) - auroc(b["scores"][idx], s) if s.any() and not s.all() else None

    def clear_diff(k):
        def stat(idx):
            s = safe[idx]
            if not s.any():
                return None
            return (cleared_with_unsafe(a["scores"][idx], s, k) - cleared_with_unsafe(b["scores"][idx], s, k)) / s.sum()
        return stat

    everything = np.arange(len(safe))
    out = {"auroc": {"delta": auroc_diff(everything), **boot_stat(auroc_diff, len(safe), groups)}}
    for k in (0, 1):
        out[f"cleared_{k}"] = {"delta": clear_diff(k)(everything), **boot_stat(clear_diff(k), len(safe), groups)}
    return out


def deployed_interval(c, threshold):
    """Safe share cleared and held items cleared when test items are resampled with the threshold kept."""
    rng = np.random.default_rng(SEED)
    idx = rng.integers(0, len(c["safe"]), (SAMPLES, len(c["safe"])))
    take, safe = (c["scores"] >= threshold)[idx], c["safe"][idx]
    shares = (take & safe).sum(1) / np.maximum(1, safe.sum(1))
    return {"safe_cleared_ci": interval(shares), "mean_held_cleared": float((take & ~safe).sum(1).mean())}


def family_items(records, family):
    return np.array([i for i, r in enumerate(records) if r["_meta"]["family"] == family])


def rated_scam(c, records, family):
    """How often a family's items get suspicion level 3 as the top answer, with the range of P(level 3) when they do."""
    idx = family_items(records, family)
    hit = c["susp_probs"][idx].argmax(1) == 3
    p3 = c["susp_probs"][idx, 3][hit]
    langs = Counter(records[i]["_meta"]["lang"] for i in idx[hit])
    return {"n": len(idx), "rated_3": int(hit.sum()), "p3_min": float(p3.min()) if hit.any() else None,
            "p3_max": float(p3.max()) if hit.any() else None, "langs": dict(langs)}


def ece_before_fix(c):
    """ECE as the harness computed it before the bin-edge fix (np.linspace edges, strict upper bound): a stated 0.3, 0.6
    or 0.7 fell into the bin below. Kept to show what the fix changed."""
    conf, ok = c["conf"].ravel(), c["ok"].ravel()
    edges, total = np.linspace(0, 1, metrics.BINS + 1), 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf >= lo) & ((conf < hi) if hi < 1 else (conf <= hi))
        if m.any():
            total += m.mean() * abs(ok[m].mean() - conf[m].mean())
    return float(total)


def convention_mask(records):
    return np.array([[q in CONVENTIONS.get(r["_meta"]["family"], ()) for r in records] for q in QUESTION_IDS])


def model_stats(c, val, records, summary):
    """Everything per contender that results.json does not already hold."""
    susp, conv = c["susp_probs"].argmax(1), convention_mask(records)
    injected = family_items(records, "injection_redirect")
    out = {"auroc_test": auroc(c["scores"], c["safe"]), "auroc_val": auroc(val["scores"], val["safe"]) if val else None,
           "safe_items": int(c["safe"].sum()), "held_items": int((~c["safe"]).sum()),
           "cleared_with_unsafe": {str(k): cleared_with_unsafe(c["scores"], c["safe"], k) for k in (0, 1, 2)},
           "binary_suspicion_acc": float(binary_suspicion_ok(c).mean()), "binary_suspicion_mass_acc": float(binary_suspicion_ok(c, "mass").mean()),
           "within_one_level": float((np.abs(susp - c["susp_gold"]) <= 1).mean()),
           "confident_errors": int(((c["conf"] >= CONFIDENT) & (c["ok"] == 0)).sum()), "ece_before_fix": ece_before_fix(c),
           "convention_acc": float(c["ok"][conv].mean()), "other_acc": float(c["ok"][~conv].mean()),
           "reminder_gentle": rated_scam(c, records, "reminder_gentle"),
           "injection_redirect": {"n": len(injected), **{q: int(c["ok"][i, injected].sum()) for i, q in enumerate(QUESTION_IDS)}}}
    dep = summary["autoclear"].get("deployed")
    if dep and dep["threshold"] is not None:
        out["deployed_bootstrap"] = deployed_interval(c, dep["threshold"])
    return out


def pair_stats(a, b, records, groups):
    """payee-0.8b against one other contender, on every view the paper reports."""
    conv = convention_mask(records)
    per_q = {}
    for i, q in enumerate(QUESTION_IDS):
        only = np.zeros_like(conv)
        only[i] = True
        per_q[q] = paired(a["ok"], b["ok"], groups, only)
    binary = {rule: paired(binary_suspicion_ok(a, rule)[None], binary_suspicion_ok(b, rule)[None], groups) for rule in ("top", "mass")}
    return {"all": paired(a["ok"], b["ok"], groups), "without_conventions": paired(a["ok"], b["ok"], groups, ~conv),
            "per_question": per_q, "binary_suspicion": binary["top"], "binary_suspicion_mass": binary["mass"],
            **routing_deltas(a, b, groups)}


def family_majority(train, test):
    """Mean test accuracy of answering every item with its family's most common training labels."""
    votes = defaultdict(Counter)
    for r in train:
        for q in QUESTION_IDS:
            votes[(r["_meta"]["family"], q)][json.dumps(r["questions"][q]["label"])] += 1
    hits = [json.dumps(r["questions"][q]["label"]) == votes[(r["_meta"]["family"], q)].most_common(1)[0][0]
            for r in test for q in QUESTION_IDS]
    return float(np.mean(hits))


def cue_counts(splits):
    """Red flags that decide a label by construction: items carrying each cue per split, and how many of those carry
    the label it predicts (suspicion 3 for a free-mail sender or an overseas SWIFT account; fake_exec for a chat sender
    tagged as a personal account). Also how many legitimate items (suspicion 0-1, safe or held) carry it."""
    def sender(r):
        return r["state"].get("from") or ""
    cues = {"free_mail": (lambda r: any(f"@{d}" in sender(r) for d in FREE_MAIL), lambda r: r["questions"]["suspicion"]["label"] == 3),
            "swift": (lambda r: "SWIFT" in json.dumps(r["state"], ensure_ascii=False), lambda r: r["questions"]["suspicion"]["label"] == 3),
            "personal_account": (lambda r: "個人アカウント" in sender(r) or "personal account" in sender(r),
                                 lambda r: r["_meta"]["family"] == "fake_exec")}
    out = {}
    for cue, (has, label) in cues.items():
        out[cue] = {split: {"items": sum(map(has, rs)), "with_label": sum(has(r) and label(r) for r in rs),
                            "legitimate": sum(has(r) and r["questions"]["suspicion"]["label"] <= MAX_SAFE_SUSPICION for r in rs)}
                    for split, rs in splits.items()}
    return out


def dataset_stats(splits):
    combos = defaultdict(set)
    for rs in splits.values():
        for r in rs:
            combos[r["_meta"]["family"]].add(tuple(json.dumps(r["questions"][q]["label"]) for q in QUESTION_IDS))
    test = splits["test"]
    held = [r for r in test if not r["_meta"]["safe"]]
    benign = [r for r in held if r["questions"]["suspicion"]["label"] <= MAX_SAFE_SUSPICION]
    layouts = {split: {kind: len({r["_meta"]["template"] for r in rs if r["_meta"]["template"].startswith(kind + ".")})
                       for kind in ("invoice", "x402")} for split, rs in splits.items()}
    return {"family_majority_test_acc": family_majority(splits["train"], test), "layouts": layouts,
            "injection_texts": {split: {"redirect": len(REDIRECT[split]), "bypass": len(BYPASS[split])} for split in ("train", "test")},
            "constant_families": sum(len(v) == 1 for v in combos.values()), "families": len(combos),
            "held_test": len(held), "held_benign_test": len(benign), "held_benign_families": dict(Counter(r["_meta"]["family"] for r in benign)),
            "swap_variants_test": dict(Counter(f for r in test if r["_meta"]["family"] == "invoice_swap" for f in r["_meta"]["flags"])),
            "convention_answers_test": int(convention_mask(test).sum()), "conventions": {f: list(q) for f, q in CONVENTIONS.items()},
            "cues": cue_counts(splits)}


EXTERNAL = {"kev-0.8b": "kev-0.8b (base)", "kev-4b": "kev-4b (base)", "payee-0.8b": "payee-0.8b (ours)", "payee-4b": "payee-4b (ours, 1 epoch)"}
REDIRECT_OFF_GOAL = "injection_task_7"      # AgentDojo's password-change goal moves no money


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def external_stats():
    """Counts from the AgentDojo-derived and benign PFN checks (results/external/), at each model's deployed threshold."""
    out = {}
    for short, name in EXTERNAL.items():
        ad = read_jsonl(BENCH / "results" / "external" / f"preds-{short}-agentdojo_banking.jsonl")
        pfn = read_jsonl(BENCH / "results" / "external" / f"preds-{short}-pfn_benign.jsonl")
        injected = [r for r in ad if r["meta"]["attack"]]
        scope = [r for r in injected if not r["meta"]["ood_carrier"]]
        redirect = [r for r in scope if r["meta"]["goal"] != REDIRECT_OFF_GOAL]
        cleared = [r for r in injected if r["cleared"]]

        def flags(rows):
            return {"n": len(rows), "new_dest": sum(r["answers"]["new_destination"] for r in rows),
                    "susp2": sum(r["answers"]["suspicion"] >= 2 for r in rows)}
        out[name] = {"injected": len(injected), "injected_cleared": len(cleared), "clean": len(ad) - len(injected),
                     "design": {k: len({r["meta"][k] for r in injected}) for k in ("goal", "attack", "carrier")},
                     "cleared_off_goal": sum(r["meta"]["goal"] == REDIRECT_OFF_GOAL for r in cleared),
                     "in_scope": flags(scope), "redirect": flags(redirect), "pfn": flags(pfn),
                     "clean_bill_cleared": any(r["cleared"] for r in ad if not r["meta"]["attack"] and r["meta"]["carrier"] == "bill")}
    return out


def agent_validity(res, status):
    """Distinct answers per agent row (a keyword script repeats itself), and the same for the discarded first Haiku run."""
    def distinct(rows, key):
        counts = Counter(json.dumps(r[key], sort_keys=True) for r in rows)
        return {"n": len(rows), "distinct": len(counts), "most_common": counts.most_common(1)[0][1]}
    out = {n: distinct(read_jsonl(BENCH / "results" / "predictions" / f"{status[n]['slug']}-test.jsonl"), "probs")
           for n in res["contenders"] if status[n].get("source") == "agent"}
    discarded = BENCH / "results" / "frontier-discarded" / "claude-haiku-4.5-run1-answers.jsonl"
    if discarded.exists():
        out["discarded claude-haiku-4.5 run 1"] = distinct(read_jsonl(discarded), "answer")
    return out


def main():
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    res = json.loads((BENCH / "results" / "results.json").read_text(encoding="utf-8"))
    status = json.loads((BENCH / "results" / "contenders.json").read_text(encoding="utf-8"))
    splits = {s: load_split(s) for s in ("train", "val", "test")}
    test = splits["test"]
    families = np.array([r["_meta"]["family"] for r in test])
    groups = [np.flatnonzero(families == f) for f in np.unique(families)]
    models = {n: contender(test, status[n]["slug"]) for n in res["contenders"]}
    missing = [n for n, c in models.items() if c is None]
    if missing:
        raise ValueError(f"no complete test predictions for {missing} in results/predictions/")
    vals = {n: contender(splits["val"], status[n]["slug"], "val") for n in res["contenders"]}
    out = {"generated_from": "results/results.json, results/predictions/*-test.jsonl, dataset/*.jsonl", "samples": SAMPLES, "seed": SEED,
           "confident_threshold": CONFIDENT, "dataset": dataset_stats(splits),
           "contenders": {n: model_stats(models[n], vals[n], test, res["contenders"][n]) for n in models},
           "vs_ours": {n: pair_stats(models[OURS], models[n], test, groups) for n in models if n != OURS},
           "vs_ours4": {n: paired(models[OURS4]["ok"], models[n]["ok"], groups) for n in models if status[n].get("source") == "agent"},
           "external": external_stats(), "agent_validity": agent_validity(res, status)}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log.info("wrote %s (%d contenders)", OUT, len(models))


if __name__ == "__main__":
    main()
