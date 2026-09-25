"""Turn saved predictions into results/results.json, results/RESULTS.md and the charts."""
import itertools
import json
import logging
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np

from . import metrics, plots
from .costs import l4_usd_per_1k
from .providers import JEV_USD_PER_M_INPUT
from .schema import QUESTION_IDS

log = logging.getLogger("payeebench.report")


def load_predictions(out_dir, slug, split):
    path = out_dir / "predictions" / f"{slug}-{split}.jsonl"
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as f:
        return {p["id"]: p for p in map(json.loads, f)}


def breakdown(records, ok, key):
    """Mean answer accuracy per value of a metadata field (family, language)."""
    groups = defaultdict(list)
    per_item = ok.reshape(len(QUESTION_IDS), len(records)).mean(0)
    for r, v in zip(records, per_item):
        groups[r["_meta"][key]].append(v)
    return {k: {"n": len(v), "accuracy": float(np.mean(v))} for k, v in sorted(groups.items())}


def summarize(test, preds, val_preds, val, budget):
    questions, conf, ok = metrics.per_question(test, preds)
    val_scores = metrics.safe_scores(val, val_preds) if val_preds else None
    tokens = [p["input_tokens"] for p in preds.values() if p.get("input_tokens") is not None]
    return {"n_items": len(test), "questions": questions,
            "mean_accuracy": float(np.mean([q["accuracy"] for q in questions.values()])),
            "mean_macro_f1": float(np.mean([q["macro_f1"] for q in questions.values()])),
            "ece": metrics.ece(conf, ok), "mean_confidence": float(conf.mean()), "reliability": metrics.reliability(conf, ok),
            "autoclear": metrics.autoclear(metrics.safe_scores(test, preds), val_scores, budget),
            "latency_ms": metrics.latency(preds), "usd_per_1k": metrics.usd_per_1k(preds),
            "input_tokens_per_item": float(np.mean(tokens)) if tokens else None,
            "parse_errors": sum(bool(p.get("parse_error")) for p in preds.values()),
            "by_family": breakdown(test, ok, "family"), "by_language": breakdown(test, ok, "lang"), "_ok": ok}


def comparisons(summaries, n_items):
    out = {}
    for a, b in itertools.combinations(summaries, 2):
        out[f"{b} vs {a}"] = metrics.paired(summaries[b]["_ok"], summaries[a]["_ok"], n_items)
    return out


def _cell(q):
    return f"{q['accuracy']:.3f} / {q['macro_f1']:.3f}"


def markdown(result):
    head = ["| Contender | " + " | ".join(f"{q} acc / F1" for q in QUESTION_IDS) + " | Mean acc | ECE | Legit auto-cleared @1% budget: deployed (oracle) | p50 / p95 ms | $ per 1k |",
            "|---|" + "---|" * (len(QUESTION_IDS) + 5)]
    rows = []
    for name, s in result["contenders"].items():
        ac = s["autoclear"]
        deployed = f"{ac['deployed']['legit_cleared']:.0%}, {ac['deployed']['false_clears']} unsafe cleared" if "deployed" in ac else "n/a"
        cost = f"{s['usd_per_1k']:.5f}" if s["usd_per_1k"] is not None else "n/a"
        rows.append(f"| {name} | " + " | ".join(_cell(s["questions"][q]) for q in QUESTION_IDS)
                    + f" | {s['mean_accuracy']:.3f} | {s['ece']:.3f} | {deployed} ({ac['oracle']['legit_cleared']:.0%})"
                    + f" | {s['latency_ms']['p50']:.0f} / {s['latency_ms']['p95']:.0f} | {cost} |")
    lines = ["# PayeeBench-JA results", "", f"Test split, {result['n_items']} items x 4 questions. Generated {result['generated']}.", "", *head, *rows, ""]
    for name, reason in result["skipped"].items():
        lines.append(f"- **{name}**: skipped ({reason})")
    for pair, c in result["comparisons"].items():
        lines.append(f"- {pair}: accuracy {100 * c['delta']:+.1f} pts, 95% CI [{100 * c['ci95'][0]:+.1f}, {100 * c['ci95'][1]:+.1f}], "
                     f"{c['newly_right']} newly right / {c['newly_wrong']} newly wrong, McNemar p={c['mcnemar_exact_p']:.2g}")
    if result["jev_list_price_per_1k"] is not None:
        lines.append(f"- Jev at list price (${JEV_USD_PER_M_INPUT}/M input tokens) would cost about ${result['jev_list_price_per_1k']:.4f} per 1k items "
                     "(estimated from Kev's token counts; Jev's tokenizer may differ).")
    return "\n".join(lines) + "\n"


def family_table(result):
    """Mean answer accuracy per family and language, one column per contender."""
    names = list(result["contenders"])
    first = result["contenders"][names[0]]
    lines = ["", "## Accuracy by family and language (mean over the 4 questions)", "",
             "| group | n | " + " | ".join(names) + " |", "|---|---|" + "---|" * len(names)]
    for key in ("by_family", "by_language"):
        for group, v in first[key].items():
            cells = " | ".join(f"{result['contenders'][n][key][group]['accuracy']:.3f}" for n in names)
            lines.append(f"| {group} | {v['n']} | {cells} |")
    return "\n".join(lines) + "\n"


def build(splits, status, budget, out_dir):
    summaries, skipped = {}, {}
    for name, st in status.items():
        test, val = load_predictions(out_dir, st["slug"], "test"), load_predictions(out_dir, st["slug"], "val")
        if not st["ran"] or not test or len(test) < len(splits["test"]):
            skipped[name] = st.get("skipped_because") or "no complete test predictions"
            continue
        summaries[name] = summarize(splits["test"], test, val if val and len(val) == len(splits["val"]) else None, splits["val"], budget)
    # Jev bills the same System-1 request Kev receives, so estimate its price from those token counts, not an LLM prompt's
    tokens = [s["input_tokens_per_item"] for n, s in summaries.items() if s["input_tokens_per_item"] and status[n].get("kind", "systemone") == "systemone"]
    result = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "n_items": len(splits["test"]), "budget": budget,
              "comparisons": comparisons(summaries, len(splits["test"])), "skipped": skipped,
              "jev_list_price_per_1k": 1000 * float(np.mean(tokens)) * JEV_USD_PER_M_INPUT / 1e6 if tokens else None,
              "l4_cloud_usd_per_1k": l4_usd_per_1k(),
              "contenders": {n: {k: v for k, v in s.items() if k != "_ok"} for n, s in summaries.items()}}
    (out_dir / "results.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if summaries:
        (out_dir / "RESULTS.md").write_text(markdown(result) + family_table(result), encoding="utf-8")
        plots.draw_all(result, out_dir)
    log.info("scored %d contenders, skipped %d; wrote %s", len(summaries), len(skipped), out_dir)
    return result
