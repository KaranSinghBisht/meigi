"""Run contenders over PayeeBench-JA and report. Any /v1/systemone-compatible endpoint can be a contender; Jev
(Cloudflare, OpenRouter, TypeSafe) and Claude Haiku join automatically and are skipped, with the reason recorded,
when their key or credit is missing.

    uv run python -m payeebench.evaluate --kev "kev-0.8b (base)=http://127.0.0.1:8101" --kev "payee-0.8b (ours)=http://127.0.0.1:8102"
    uv run python -m payeebench.evaluate --report-only          # re-score saved predictions, redraw charts

Predictions are saved per contender and split under results/predictions/ (reused unless --fresh), the validation run
sets the deployable auto-clear threshold, and the test run is what every headline number reads."""
import argparse
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from . import report
from .costs import Energy
from .llm import ClaudeLLM
from .providers import CloudflareJev, ProviderUnavailable, SystemOne, openrouter_jev, typesafe_jev

log = logging.getLogger("payeebench.evaluate")
BENCH = Path(__file__).resolve().parents[1]
REMOTE = {"jev-cloudflare": CloudflareJev, "jev-openrouter": openrouter_jev, "jev-typesafe": typesafe_jev, "claude-haiku": ClaudeLLM}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load_split(split):
    with (BENCH / "dataset" / f"{split}.jsonl").open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def contenders(a):
    out = []
    for spec in a.kev:
        name, _, url = spec.partition("=")
        out.append(SystemOne(name, url, energy=Energy(a.watts)))
    for spec in a.endpoint:
        name, _, url = spec.partition("=")
        out.append(SystemOne(name, url))
    for key in [r for r in a.remote.split(",") if r]:
        out.append(REMOTE[key]())
    return out


def _load(path):
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return {p["id"]: p for p in map(json.loads, f)}


def run_split(provider, records, path, fresh):
    """Predict every record not already saved; append as we go so an interrupted run resumes."""
    done = {} if fresh else _load(path)
    todo = [r for r in records if r["_meta"]["id"] not in done]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w" if fresh else "a", encoding="utf-8") as f:
        for i, r in enumerate(todo, 1):
            pred = provider(r["state"])
            row = {"id": r["_meta"]["id"], **pred.__dict__}
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            done[row["id"]] = row
            if i % 25 == 0:
                log.info("%s: %d/%d", provider.name, i, len(todo))
    return done


def run_contender(provider, splits, warmup, fresh):
    """-> None when it ran, else the reason it was skipped."""
    first = splits["val"][0]["state"]
    try:
        for _ in range(max(1, warmup)):
            provider(first)                  # probe + warm-up (load, compile, open connections); not scored
    except ProviderUnavailable as e:
        log.warning("skipping %s: %s", provider.name, e)
        return str(e)
    for split, records in splits.items():
        run_split(provider, records, BENCH / "results" / "predictions" / f"{slug(provider.name)}-{split}.jsonl", fresh)
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--kev", action="append", default=[], help="NAME=URL of a local kev.serve (priced by electricity)")
    ap.add_argument("--endpoint", action="append", default=[], help="NAME=URL of any other /v1/systemone endpoint")
    ap.add_argument("--remote", default=",".join(REMOTE), help=f"comma list from {sorted(REMOTE)} (skipped when no key/credit)")
    ap.add_argument("--budget", type=float, default=0.01, help="error budget for auto-clear (share of cleared items that are unsafe)")
    ap.add_argument("--watts", type=float, default=Energy().watts, help="assumed package power of this Mac while serving")
    ap.add_argument("--warmup", type=int, default=3)
    ap.add_argument("--fresh", action="store_true", help="ignore saved predictions")
    ap.add_argument("--report-only", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    splits = {"val": load_split("val"), "test": load_split("test")}
    status_path = BENCH / "results" / "contenders.json"
    status = json.loads(status_path.read_text()) if status_path.exists() else {}
    if not a.report_only:
        for provider in contenders(a):
            reason = run_contender(provider, splits, a.warmup, a.fresh)
            status[provider.name] = {"slug": slug(provider.name), "ran": reason is None, "skipped_because": reason,
                                     "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        status_path.parent.mkdir(parents=True, exist_ok=True)
        status_path.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    report.build(splits, status, a.budget, BENCH / "results")


if __name__ == "__main__":
    main()
