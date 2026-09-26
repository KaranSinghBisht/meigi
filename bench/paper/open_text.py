"""The paper's sentences about the open-model fine-tunes (Gemma 4 E2B, Llama 3.2 3B and Qwen3-4B), generated from their
run records (results/runs/*.json), results/runs/not-run.json and the paired intervals in analysis.json, so that the
recipe, the verdicts and any model that did not run always follow the files. Writes \\NOpenModels, \\NOpenResults and
\\NOpenConclusion through make_numbers.py; a model is "tied" with payee-0.8b when the item-level 95% interval contains
zero, as in frontier_text.py."""
import json
from pathlib import Path

import frontier_text
import names
import tables

BENCH = Path(__file__).resolve().parents[1]
RUNS = ((names.QWEN, "qwen3-4b-payee"), (names.GEMMA, "gemma-4-e2b-payee"), (names.LLAMA3B, "llama-3.2-3b-payee"))
CITES = {names.GEMMA: "google2026gemma4e2b", names.LLAMA3B: "meta2024llama32"}
SHORT_BECAUSE = {names.GEMMA: " to fit the overnight window"}   # why a run is shorter than the default two epochs
FAMILY_NOTE = "; the family-clustered interval contains zero"


def plain(name):
    """A fine-tune's model name for running text, without the table's '+ LoRA (ours)'."""
    return names.label(name).replace(" + LoRA (ours)", "").replace(", Kev recipe (ours)", " with the Kev recipe")


def ci(pair):
    return f"[{names.signed(100 * pair['ci_items'][0])}, {names.signed(100 * pair['ci_items'][1])}]"


def recipe(rec):
    """The LoRA settings a run shares with the others: rank, learning rate and effective batch."""
    mantissa, exponent = f"{rec['learning_rate']:.0e}".split("e")
    batch = rec["batch_size"] * (rec.get("grad_accumulation_steps") or 1)
    return (f"rank {rec['lora_parameters']['rank']}, learning rate ${mantissa}\\times10^{{{int(exponent)}}}$, "
            f"effective batch {batch}")


def duration(name, run):
    epochs = run["epochs"]
    return (f"{plain(name)}~\\cite{{{CITES[name]}}} for {epochs:g} epoch{'' if epochs == 1 else 's'} "
            f"({run['wall_seconds'] / 60:.0f} minutes){SHORT_BECAUSE.get(name, '')}")


def sentence():
    """How the open models were fine-tuned and scored, and which of them did not run."""
    paths = {n: BENCH / "results" / "runs" / f"{r}.json" for n, r in RUNS}
    done = {n: json.loads(p.read_text(encoding="utf-8")) for n, p in paths.items() if p.exists()}
    missing = "".join(f" {plain(n)} was {why}." for n, why in tables.not_run().items() if n not in done)
    if not done:
        return ("Three more fine-tunes are scheduled on the same 600 items: Qwen3-4B-Base with the Kev recipe, and Gemma 4 E2B and "
                "Llama 3.2 3B with LoRA in mlx-lm; their rows in Table~\\ref{tab:results} are pending.")
    shared = {recipe(r["recipe"]) for r in done.values()}
    if len(shared) != 1:
        raise ValueError(f"the open-model recipes differ ({shared}); describe each one")
    rows = {r["train_rows"] for r in done.values()}.pop()
    return (f"We also fine-tuned instruction-tuned open models on the same {rows} items with LoRA in mlx-lm~\\cite{{mlxlm2026}} "
            f"({shared.pop()}, loss on the answer JSON only): " + frontier_text.join(duration(n, r) for n, r in done.items())
            + ". Each option is scored by its likelihood in that JSON, left to right." + missing)


def clause(name, ana, first):
    """One open model against payee-0.8b: accuracy verdict, and ranking when its AUROC interval excludes zero. The first
    clause of the sentence names payee-0.8b; later ones refer back to it."""
    acc, auc = ana["vs_ours"][name]["all"], ana["vs_ours"][name]["auroc"]
    verdict, rank = frontier_text.verdict(acc), frontier_text.verdict(auc)
    word = {"tied": "is statistically tied with payee-0.8b in accuracy", "behind": "is less accurate than payee-0.8b",
            "ahead": "is more accurate than payee-0.8b"}[verdict]
    lead = f"payee-0.8b's lead {names.signed(100 * acc['delta'])}, CI {ci(acc)}"
    if not first:
        word, lead = word.replace(" than payee-0.8b", "").replace(" with payee-0.8b", " with it"), lead.split("lead ", 1)[1].replace("CI ", "")
    text = f"our {plain(name)} fine-tune {word} ({lead}{FAMILY_NOTE if frontier_text.family_disagrees(acc) else ''})"
    if rank != "tied":
        conj = "but" if (rank == "ahead") != (verdict == "ahead") else "and"
        text += (f" {conj} ranks safe against held items {'better' if rank == 'ahead' else 'worse'} "
                 f"(AUROC {ana['contenders'][name]['auroc_test']:.3f} against {ana['contenders'][names.OURS]['auroc_test']:.3f}; "
                 f"difference CI {interval(auc['ci_items'])}{family_interval(auc)})")
    return text


def interval(pair, digits=3):
    return f"[{names.signed(pair[0], digits)}, {names.signed(pair[1], digits)}]"


def family_interval(pair):
    """The family-clustered interval of an AUROC difference, when it disagrees with the item-level one."""
    if not frontier_text.family_disagrees(pair):
        return ""
    return f", though the family-clustered interval {interval(pair['ci_families'])} contains zero"


RECIPE_NOTE = (" These gaps are not controlled for recipe (mlx-lm LoRA scored by option likelihood with no fitted temperature, "
               "against the Kev trainer's pointer head and fitted temperature): they compare these recipes on this benchmark, "
               "not a 0.8B model with larger ones.")


def results(res, ana):
    """A leading space, one sentence on the open-model fine-tunes that have results and the recipe caveat; empty before any."""
    done = [n for n in names.PLANNED if n in res["contenders"]]
    if not done:
        return ""
    return " Of the open models, " + "; ".join(clause(n, ana, i == 0) for i, n in enumerate(done)) + "." + RECIPE_NOTE


def conclusion(res, ana):
    """A leading space and the open fine-tunes that match or beat payee-0.8b in accuracy, for the conclusion."""
    close = [n for n in names.PLANNED if n in res["contenders"] and frontier_text.verdict(ana["vs_ours"][n]["all"]) != "behind"]
    if not close:
        return ""
    words = []
    for n in close:
        acc, auc = ana["vs_ours"][n]["all"], ana["vs_ours"][n]["auroc"]
        text = f"our {plain(n)} fine-tune is " + (
            "statistically tied with it in accuracy" if frontier_text.verdict(acc) == "tied" else "more accurate")
        if frontier_text.verdict(auc) == "ahead":
            text += " and ranks safe against held items better" + (" (item level only)" if frontier_text.family_disagrees(auc) else "")
        words.append(text)
    return ", and " + frontier_text.join(words)
