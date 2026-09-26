"""The run record of an mlx-lm LoRA fine-tune (results/runs/<name>.json), from its adapter config and training log, so
the paper can cite the recipe, wall time and memory of every model it reports.

    python3 scripts/mlx_run_record.py gemma-4-e2b-payee runs/logs/gemma-4-e2b-payee.log --wall 812
"""
import argparse
import json
import logging
import re
from pathlib import Path

BENCH = Path(__file__).resolve().parents[1]
ITER = re.compile(r"Iter (\d+): Train loss ([\d.]+).*?Peak mem ([\d.]+) GB")
VAL = re.compile(r"Iter (\d+): Val loss ([\d.]+)")
KEEP = ("model", "fine_tune_type", "num_layers", "batch_size", "grad_accumulation_steps", "iters", "learning_rate",
        "lora_parameters", "mask_prompt", "max_seq_length", "seed", "save_every", "grad_checkpoint", "optimizer")


def record(name, log_text, wall):
    config = json.loads((BENCH / "runs" / name / "adapter_config.json").read_text(encoding="utf-8"))
    train = [(int(i), float(loss), float(mem)) for i, loss, mem in ITER.findall(log_text)]
    val = [(int(i), float(loss)) for i, loss in VAL.findall(log_text)]
    rows = sum(1 for _ in (BENCH / "runs" / "sft-data" / "train.jsonl").open(encoding="utf-8"))
    return {"run": name, "trainer": "mlx-lm LoRA SFT (scripts/train_mlx.sh)", "recipe": {k: config.get(k) for k in KEEP},
            "train_rows": rows, "epochs": round(config["iters"] * config["batch_size"] / rows, 2), "wall_seconds": wall,
            "peak_memory_gb": max((m for _, _, m in train), default=None),
            "train_loss_last": train[-1][1] if train else None, "val_loss": val,
            "provenance": "runs/<run>/adapter_config.json and runs/logs/<run>.log (git-ignored); wall time from train_mlx.sh"}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("name")
    ap.add_argument("log")
    ap.add_argument("--wall", type=float, required=True, help="training wall time in seconds")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    out = BENCH / "results" / "runs" / f"{a.name}.json"
    out.write_text(json.dumps(record(a.name, Path(a.log).read_text(encoding="utf-8"), a.wall), indent=2) + "\n", encoding="utf-8")
    logging.getLogger("mlx_run_record").info("wrote %s", out)


if __name__ == "__main__":
    main()
