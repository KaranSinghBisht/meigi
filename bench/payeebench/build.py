"""Build PayeeBench-JA: train / val / test JSONL in Kev's labelled-request format, plus stats.json and leakage.json.

    uv run python -m payeebench.build --out dataset [--nta ../data/nta/raw]

Records: {"state": {...}, "questions": {qid: {type, instructions, criteria, label}}, "_meta": {id, split, family, ...}}.
Kev's trainer reads `state` + `questions` (labels included) and keeps `_meta`; the eval harness strips both labels and
metadata before anything is sent to a model (schema.request_body)."""
import argparse
import csv
import json
import logging
import random
import re
from collections import Counter
from pathlib import Path

from . import families, leakage
from .entities import EntityFactory
from .schema import QUESTION_IDS, is_safe, labelled_questions
from .tnumber import is_valid_t_number

log = logging.getLogger("payeebench.build")
SIZES = {"train": 600, "val": 100, "test": 150}
T_NUMBER = re.compile(r"(?<![0-9A-Za-z])T\d{13}(?!\d)")


def load_registry(nta_dir):
    """Real corporate numbers and names from the NTA Tokyo bulk files, to keep fictional ones from colliding."""
    numbers, names = set(), set()
    if not nta_dir or not Path(nta_dir).is_dir():
        return numbers, names
    for path in sorted(Path(nta_dir).glob("*.csv")):
        with path.open(encoding="utf-8", newline="") as f:
            for row in csv.reader(f):
                if len(row) > 6:
                    numbers.add(row[1]); names.add(row[6])
    log.info("NTA registry: %d numbers, %d names", len(numbers), len(names))
    return numbers, names


def build_split(split, n, seed, used, avoid_numbers, avoid_names=frozenset()):
    rng = random.Random(f"{seed}:{split}")
    fac = EntityFactory(split, rng, used, avoid_numbers, avoid_names)
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
    return records, fac.log


def stats(records):
    labels = {q: Counter(str(r["questions"][q]["label"]) for r in records) for q in QUESTION_IDS}
    return {"n": len(records), "families": dict(Counter(r["_meta"]["family"] for r in records)),
            "languages": dict(Counter(r["_meta"]["lang"] for r in records)),
            "channels": dict(Counter(r["state"]["channel"] for r in records)),
            "safe_to_autoclear": sum(r["_meta"]["safe"] for r in records), "labels": labels,
            "chars": {"mean": round(sum(len(leakage.flat_text(r["state"])) for r in records) / len(records)),
                      "max": max(len(leakage.flat_text(r["state"])) for r in records)}}


def check(splits, logs, registry_names):
    """Hard guarantees: every T-number in every text passes the check digit, and no fictional company name is a
    registered Tokyo corporation (when the NTA file is available)."""
    for records in splits.values():
        for r in records:
            for t in T_NUMBER.findall(leakage.flat_text(r["state"])):
                if not is_valid_t_number(t):
                    raise AssertionError(f"{r['_meta']['id']}: invalid T-number {t}")
    names = set().union(*(lg["company"] for lg in logs.values()))
    collisions = sorted(names & registry_names)
    if collisions:
        raise AssertionError(f"fictional company names collide with the NTA registry: {collisions[:5]}")
    return {"t_numbers_valid": True, "company_names": len(names), "nta_names_checked": len(registry_names)}


def write_jsonl(path, records):
    with path.open("w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", default="dataset")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--nta", default="", help="directory with NTA 法人番号 CSVs (optional collision check)")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    numbers, names = load_registry(a.nta)
    used, splits, logs = set(), {}, {}
    for split, n in SIZES.items():
        splits[split], logs[split] = build_split(split, n, a.seed, used, frozenset(numbers), frozenset(names))
    checks = check(splits, logs, names)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for split, records in splits.items():
        write_jsonl(out / f"{split}.jsonl", records)
    report = leakage.report(splits, logs)
    report["checks"] = checks
    (out / "leakage.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "stats.json").write_text(json.dumps({s: stats(r) for s, r in splits.items()}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log.info("wrote %s", ", ".join(f"{s}={len(r)}" for s, r in splits.items()))


if __name__ == "__main__":
    main()
