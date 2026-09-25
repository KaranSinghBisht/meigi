"""Build PayeeBench-JA: train / val / test JSONL in Kev's labelled-request format, plus stats.json and leakage.json.

    uv run python -m payeebench.build --out dataset     # uses meigi/data/nta when present (registry.py)

Records: {"state": {...}, "questions": {qid: {type, instructions, criteria, label}}, "_meta": {id, split, family, ...}}.
Kev's trainer reads `state` + `questions` (labels included) and keeps `_meta`; the eval harness strips both labels and
metadata before anything is sent to a model (schema.request_body)."""
import argparse
import json
import logging
import random
import re
from collections import Counter
from pathlib import Path

from . import families, leakage, registry
from .entities import EntityFactory
from .schema import QUESTION_IDS, QUESTIONS, SAFE_TYPES, MAX_SAFE_SUSPICION, is_safe, labelled_questions
from .tnumber import is_unassignable, is_valid_t_number

log = logging.getLogger("payeebench.build")
SIZES = {"train": 600, "val": 100, "test": 150}
T_NUMBER = re.compile(r"(?<![0-9A-Za-z])T\d{13}(?!\d)")
NTA = Path(__file__).resolve().parents[2] / "data" / "nta"


def build_split(split, n, seed, used, avoid_numbers, avoid_names=frozenset(), registered=None):
    rng = random.Random(f"{seed}:{split}")
    fac = EntityFactory(split, rng, used, avoid_numbers, avoid_names, registered)
    plan = [fam for fam, k in families.allocate(n).items() for _ in range(k)]
    rng.shuffle(plan)
    records, seen = [], set()
    for family in plan:
        for _ in range(20):
            it = families.sample(family, fac, rng)
            key = json.dumps(it["state"], sort_keys=True, ensure_ascii=False)
            if key not in seen:
                seen.add(key)
                break
        else:
            raise RuntimeError(f"could not draw a distinct {family} item")
        meta = {"id": f"payeebench/{split}/{len(records):04d}", "split": split, **it["meta"], "safe": is_safe(it["labels"])}
        records.append({"state": it["state"], "questions": labelled_questions(it["labels"]), "_meta": meta})
    fac.log["renamed"] = set(fac.renamed.values())
    return records, fac.log


def stats(records):
    labels = {q: Counter(str(r["questions"][q]["label"]) for r in records) for q in QUESTION_IDS}
    return {"n": len(records), "families": dict(Counter(r["_meta"]["family"] for r in records)),
            "languages": dict(Counter(r["_meta"]["lang"] for r in records)),
            "channels": dict(Counter(r["state"]["channel"] for r in records)),
            "safe_to_autoclear": sum(r["_meta"]["safe"] for r in records), "labels": labels,
            "chars": {"mean": round(sum(len(leakage.flat_text(r["state"])) for r in records) / len(records)),
                      "max": max(len(leakage.flat_text(r["state"])) for r in records)}}


def check(splits, logs, nationwide):
    """Hard guarantees: every T-number passes the check digit and sits in the never-issued 9999 office range, and (with
    the nationwide index) no T-number and no company name in the output belongs to a registered corporation."""
    numbers = set()
    for records in splits.values():
        for r in records:
            for t in T_NUMBER.findall(leakage.flat_text(r["state"])):
                if not (is_valid_t_number(t) and is_unassignable(t)):
                    raise AssertionError(f"{r['_meta']['id']}: T-number {t} is invalid or outside the 9999 range")
                numbers.add(t[1:])
    names = set().union(*(lg["company"] for lg in logs.values()))
    out = {"t_numbers": len(numbers), "t_numbers_valid_and_unassignable": True, "company_names": len(names),
           "renamed_from_registry": sorted(set().union(*(lg["renamed"] for lg in logs.values())))}
    if nationwide is None:
        return {**out, "nta_nationwide_checked": False}
    bad_numbers, bad_names = nationwide.registered_numbers(numbers), nationwide.registered_names(names)
    if bad_numbers or bad_names:
        raise AssertionError(f"registered corporations in the output: numbers {bad_numbers[:3]}, names {bad_names[:3]}")
    return {**out, "nta_nationwide_checked": True, "nta_corporations": nationwide.size, "registered_matches": 0}


def write_jsonl(path, records):
    with path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", default="dataset")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--nta", default=str(NTA / "raw"), help="NTA Tokyo bulk CSVs the split is drawn against (registry.py)")
    ap.add_argument("--registry", default=str(NTA / "corporations.sqlite"), help="nationwide NTA index for renames and checks")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    numbers, names = registry.tokyo_sets(a.nta)
    nationwide = registry.nationwide(a.registry)
    registered = nationwide.has_name if nationwide else None
    used, splits, logs = set(), {}, {}
    for split, n in SIZES.items():
        splits[split], logs[split] = build_split(split, n, a.seed, used, frozenset(numbers), frozenset(names), registered)
    checks = check(splits, logs, nationwide)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for split, records in splits.items():
        write_jsonl(out / f"{split}.jsonl", records)
    report = leakage.report(splits, logs)
    report["checks"] = checks
    (out / "leakage.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    questions = {"questions": QUESTIONS, "safe_to_autoclear": {"types": list(SAFE_TYPES), "max_suspicion": MAX_SAFE_SUSPICION,
                 "p_safe": "P(type in types) * P(new_destination = false) * P(suspicion <= max_suspicion)"}}
    (out / "questions.json").write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "stats.json").write_text(json.dumps({s: stats(r) for s, r in splits.items()}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log.info("wrote %s", ", ".join(f"{s}={len(r)}" for s, r in splits.items()))


if __name__ == "__main__":
    main()
