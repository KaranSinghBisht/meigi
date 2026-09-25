"""Fit a Kev checkpoint's temperature on the PayeeBench validation split and write it into head.pt, so kev.serve
serves calibrated probabilities. Scores raw logits on the exact fp32 torch path (the one Kev's own calibration uses),
with the serving context so no record is skipped. Runs in the Kev repo's environment:

    cd $KEV_DIR && uv run python $BENCH/scripts/calibrate_kev.py --run $BENCH/runs/payee-0.8b --data $BENCH/dataset/val.jsonl
    # baseline arm: copy the released checkpoint first, then refit it on the same records
    cd $KEV_DIR && uv run python $BENCH/scripts/calibrate_kev.py --copy_from jaredpalmer/kev-0.8b --run $BENCH/runs/kev-0.8b-valT --data ...
"""
import argparse
import json
import logging
import shutil
from pathlib import Path

from kev.benchmark import prediction_rows
from kev.checkpoint import LoadOptions, read_meta, resolve_run, write_meta
from kev.data import load_records
from kev.device import default_device
from kev.metrics import fit_temperature, metrics
from kev.predictors import LocalPredictor
from kev.suite import SERVING_CONTEXT

log = logging.getLogger("calibrate_kev")
KEYS = ("acc", "nll", "ece", "brier", "mean_conf", "confident_error_rate", "coverage_at_5pct_error")


def copy_checkpoint(source, run):
    src = Path(resolve_run(source))
    Path(run).mkdir(parents=True, exist_ok=False)
    for f in src.iterdir():
        if f.is_file():
            shutil.copyfile(f.resolve(), Path(run) / f.name)   # not copy2: Hub cache blobs are read-only


def raw_rows(run, data):
    predictor = LocalPredictor(run, default_device(), LoadOptions(temperature=1.0), context=SERVING_CONTEXT)
    rows = []
    for record in load_records(data):
        rows.extend(prediction_rows(record, predictor(record)))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--copy_from", help="copy this checkpoint (Hub id or directory) to --run before fitting")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if a.copy_from:
        copy_checkpoint(a.copy_from, a.run)
    rows = raw_rows(a.run, a.data)
    temperature = fit_temperature(rows, aggregation="micro")
    before, after = metrics(rows), metrics(rows, temperature)
    meta = read_meta(a.run)
    shipped = meta.temperature
    meta.temperature = temperature
    meta.extra["temperature_fit"] = {"data": a.data, "n_questions": len(rows), "method": "min NLL, micro, kev.metrics.fit_temperature",
                                     "value": temperature, "replaced": shipped}
    write_meta(a.run, meta)
    report = {"temperature": temperature, "replaced": shipped, "raw": {k: before[k] for k in KEYS}, "calibrated": {k: after[k] for k in KEYS}}
    Path(a.run, "calibration.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    log.info(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
