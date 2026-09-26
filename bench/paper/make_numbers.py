"""Every number the paper prints, generated from the bench artifacts (nothing is typed by hand):

    results/results.json, results/contenders.json   scores, costs, contender status
    paper/generated/analysis.json                    paired and family-clustered statistics, routing, conventions (analysis.py)
    results/runs/*.json                              training, calibration, trainer pins and out-of-domain provenance
    dataset/stats.json, dataset/leakage.json         dataset card and leakage guards
    payeebench/costs.py                              the electricity and cloud assumptions

    cd bench && uv run python paper/analysis.py && uv run python paper/make_numbers.py   # writes paper/generated/*.tex

Frontier rows (Claude models run as agents, `payeebench.external score --save`) join the tables and the generated
frontier sentences (frontier_text.py) as soon as they are in results/; their wording follows the paired 95% interval."""
import json
import logging
import sys
from pathlib import Path

BENCH = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BENCH))
import analysis
import frontier_text
import names
import open_text
import tables
from names import BASE, BASE4, LLAMA, OURS, OURS4

from payeebench import costs, metrics
from payeebench.plots import MIN_BIN
from payeebench.providers import JEV_USD_PER_M_INPUT

OUT = BENCH / "paper" / "generated"
QS = ("request_type", "new_destination", "pressure", "suspicion")
log = logging.getLogger("make_numbers")


def load(path):
    return json.loads((BENCH / path).read_text(encoding="utf-8"))


def pct(x, digits=0):
    return f"{100 * x:.{digits}f}\\%"


def pts(x):
    return names.signed(100 * x)


def macro_name(*parts):
    """A LaTeX-safe macro name: letters only (digits spelled out)."""
    words = {"0": "Zero", "1": "One", "2": "Two", "3": "Three", "4": "Four", "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine"}
    raw = "".join(p[:1].upper() + p[1:] for p in parts)
    return "".join(words.get(c, c) for c in raw if c.isalnum())


def latex_p(p):
    if p >= 0.01:
        return f"{p:.2f}"
    mantissa, exponent = f"{p:.1e}".split("e")
    return f"{mantissa}\\times 10^{{{int(exponent)}}}"


def keys_for(res):
    """Macro prefix per contender; two contenders must never share one, or one would overwrite the other's numbers."""
    keys = {name: names.key(name) for name in res["contenders"]}
    clash = sorted(k for k in set(keys.values()) if list(keys.values()).count(k) > 1)
    if clash:
        raise ValueError(f"contenders share a macro key: {clash}")
    return keys


def dataset_numbers(ana):
    stats, leak, ds = load("dataset/stats.json"), load("dataset/leakage.json"), ana["dataset"]
    n = {s: stats[s]["n"] for s in stats}
    ja = sum(stats[s]["languages"]["ja"] for s in stats)
    tt, sl = leak["templates_shared_with_train"], leak["sentences_shared_with_train"]["test"]
    jac, benign = leak["nearest_train_5gram_jaccard"], ds["held_benign_families"]
    out = {"NTotal": str(sum(n.values())), "NTrain": str(n["train"]), "NVal": str(n["val"]), "NTest": str(n["test"]),
           "PctJa": pct(ja / sum(n.values())), "NFamilies": str(ds["families"]), "SafeTest": str(stats["test"]["safe_to_autoclear"]),
           "TemplatesTest": str(tt["test"]["picks"]), "TemplatesTestShared": str(tt["test"]["shared"]),
           "SentTest": f"{sl['sentences']:,}", "SentTestShared": str(sl["shared"]),
           "JaccardTest": f"{jac['test']['mean']:.2f}", "JaccardVal": f"{jac['val']['mean']:.2f}",
           "NRenamed": str(len(leak["checks"]["renamed_from_registry"])), "NNta": f"{leak['checks']['nta_corporations']:,}",
           "NTNumbers": str(leak["checks"]["t_numbers"]), "NCompanies": f"{leak['checks']['company_names']:,}",
           "RegisteredMatches": str(leak["checks"]["registered_matches"]),
           "ConstantFamilies": str(ds["constant_families"]), "VaryingFamilies": str(ds["families"] - ds["constant_families"]),
           "FamilyMajority": f"{ds['family_majority_test_acc']:.3f}", "ConventionAnswers": str(ds["convention_answers_test"]),
           "HeldTest": str(ds["held_test"]), "HeldBenign": str(ds["held_benign_test"]), "HeldAttacks": str(ds["held_test"] - ds["held_benign_test"]),
           "HeldNotices": str(benign.get("notice", 0)), "HeldChanges": str(benign.get("change_legit", 0)), "HeldExec": str(benign.get("exec_legit", 0)),
           "InvoiceLayoutsTest": str(ds["layouts"]["test"]["invoice"]), "XLayoutsTest": str(ds["layouts"]["test"]["x402"]),
           "InjectionTextsTest": str(sum(ds["injection_texts"]["test"].values())),
           "SwapPoisoned": str(ds["swap_variants_test"].get("poisoned_wallet", 0))}
    for cue, key in (("free_mail", "FreeMail"), ("swift", "Swift"), ("personal_account", "Personal")):
        counts = ds["cues"][cue]
        if not all(c["items"] == c["with_label"] and c["legitimate"] == 0 for c in counts.values()):
            raise ValueError(f"cue {cue} no longer decides its label; the paper's sentence about it must change")
        out[f"{key}All"] = str(sum(c["items"] for c in counts.values()))
    return out


def contender_numbers(res, ana, keys):
    out = {}
    for name, s in res["contenders"].items():
        k, a = keys[name], ana["contenders"][name]
        out.update({f"{k}Mean": f"{s['mean_accuracy']:.3f}", f"{k}Ece": f"{s['ece']:.3f}", f"{k}MeanConf": f"{s['mean_confidence']:.3f}",
                    f"{k}Susp": f"{s['questions']['suspicion']['accuracy']:.3f}", f"{k}SuspMae": f"{s['questions']['suspicion']['mae']:.2f}",
                    f"{k}Auroc": f"{a['auroc_test']:.3f}", f"{k}ClearZero": str(a["cleared_with_unsafe"]["0"]),
                    f"{k}ClearOne": str(a["cleared_with_unsafe"]["1"]), f"{k}BinSusp": f"{a['binary_suspicion_acc']:.3f}",
                    f"{k}BinSuspMass": f"{a['binary_suspicion_mass_acc']:.3f}", f"{k}ConfErrors": str(a["confident_errors"]),
                    f"{k}ConvAcc": f"{a['convention_acc']:.2f}", f"{k}EceBeforeFix": f"{a['ece_before_fix']:.3f}",
                    f"{k}InjNewDest": str(a["injection_redirect"]["new_destination"]), f"{k}InjSusp": str(a["injection_redirect"]["suspicion"])})
        if a["auroc_val"] is not None:
            out[f"{k}AurocVal"] = f"{a['auroc_val']:.3f}"
        if s["latency_ms"]:
            out.update({f"{k}Pfifty": f"{s['latency_ms']['p50']:,.0f}", f"{k}Pninetyfive": f"{s['latency_ms']['p95']:,.0f}"})
        if s["usd_per_1k"] is not None:
            out[f"{k}Cost"] = names.usd(s["usd_per_1k"])
        dep = s["autoclear"].get("deployed")
        if dep and dep["threshold"] is not None:
            out.update({f"{k}Deployed": pct(dep["legit_cleared"]), f"{k}DeployedN": str(dep["cleared"] - dep["false_clears"]),
                        f"{k}FalseClears": str(dep["false_clears"]), f"{k}Threshold": f"{dep['threshold']:.3f}"})
        if "deployed_bootstrap" in a:
            lo, hi = a["deployed_bootstrap"]["safe_cleared_ci"]
            out.update({f"{k}DeployedLo": pct(lo), f"{k}DeployedHi": pct(hi)})
    return out


def binary_phrase(ana):
    """How the binary-suspicion comparison with Llama is worded: one statement when both readings agree."""
    ours, llama = ana["contenders"][OURS], ana["contenders"][LLAMA]
    if (ours["binary_suspicion_acc"], llama["binary_suspicion_acc"]) == (ours["binary_suspicion_mass_acc"], llama["binary_suspicion_mass_acc"]):
        return "whether the side is read from the top level or from the probability mass (an even split counting as held, as in routing)"
    return (f"by top level, and {llama['binary_suspicion_mass_acc']:.3f} against {ours['binary_suspicion_mass_acc']:.3f} by probability "
            "mass (an even split counting as held, as in routing)")


def reminders_language(rem):
    words = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six"}
    ja = rem["langs"].get("ja", 0)
    return f"all {words.get(ja, ja)} in Japanese" if ja == rem["rated_3"] else f"{words.get(ja, ja)} of them in Japanese"


def clear_gaps(ana):
    """Smallest and largest gap, in items, between payee-0.8b and Kev-4B or Llama at zero or one held item cleared."""
    ours = ana["contenders"][OURS]["cleared_with_unsafe"]
    gaps = [abs(ours[k] - ana["contenders"][n]["cleared_with_unsafe"][k]) for n in (BASE4, LLAMA) for k in ("0", "1")]
    return {"ClearGapMin": str(min(gaps)), "ClearGapMax": str(max(gaps))}


def ece_standing(res):
    """Where payee-0.8b's ECE ranks, in words, so no superlative outlives the numbers."""
    ours = res["contenders"][OURS]["ece"]
    better = [n for n, s in res["contenders"].items() if s["ece"] < ours]
    if not better:
        return "the lowest we measured"
    if better == [OURS4]:
        return f"lower than every model's except our 4B fine-tune's ({res['contenders'][OURS4]['ece']:.3f})"
    return "lower than every model's except " + frontier_text.join(f"{names.label(n)} ({res['contenders'][n]['ece']:.3f})" for n in better)


def detail_numbers(res, ana):
    """One-off facts the text cites: families, the worst Llama bin, benign reminders the fine-tune calls scams."""
    fam, rem = res["contenders"], ana["contenders"][OURS]["reminder_gentle"]
    bins = [b for b in fam[LLAMA]["reliability"] if b["n"] >= MIN_BIN and b["confidence"] < 0.9]
    worst = max(bins, key=lambda b: b["n"])
    base_other = [fam[n]["questions"][q]["accuracy"] for n in (BASE, BASE4) for q in QS if q != "suspicion"]
    return {"LlamaInjection": f"{fam[LLAMA]['by_family']['injection_redirect']['accuracy']:.2f}",
            "OursInjection": f"{fam[OURS]['by_family']['injection_redirect']['accuracy']:.2f}",
            "InjectionN": str(fam[OURS]["by_family"]["injection_redirect"]["n"]),
            "OursSwap": f"{fam[OURS]['by_family']['invoice_swap']['accuracy']:.2f}", "SwapN": str(fam[OURS]["by_family"]["invoice_swap"]["n"]),
            "RemindersRated": str(rem["rated_3"]), "RemindersN": str(rem["n"]), "RemindersLang": reminders_language(rem),
            "RemindersPmax": f"{rem['p3_max']:.2f}", "RemindersPmin": f"{rem['p3_min']:.2f}",
            "BaseOtherMin": f"{min(base_other):.2f}", "BaseOtherMax": f"{max(base_other):.2f}",
            "LlamaBinConf": f"{worst['confidence']:.2f}", "LlamaBinAcc": f"{worst['accuracy']:.2f}", "LlamaBinN": str(worst["n"]),
            "LlamaParseErrors": str(fam[LLAMA]["parse_errors"]), "MinBin": str(MIN_BIN),
            "JevCost": names.usd(res["jev_list_price_per_1k"]), "LfourCost": names.usd(res["l4_cloud_usd_per_1k"]),
            "LlamaOverLfour": f"{fam[LLAMA]['usd_per_1k'] / res['l4_cloud_usd_per_1k']:.0f}", "OursEceStanding": ece_standing(res),
            "LlamaOverOurs": f"{round(fam[LLAMA]['usd_per_1k'] / fam[OURS]['usd_per_1k'], -2):,.0f}"}


def interval_macros(prefix, view, scale=100, digits=1):
    """Delta, item-level and (when present) family-clustered interval of one paired view."""
    def fmt(x):
        return names.signed(scale * x, digits)
    out = {f"{prefix}Delta": fmt(view["delta"]), f"{prefix}Lo": fmt(view["ci_items"][0]), f"{prefix}Hi": fmt(view["ci_items"][1])}
    if "ci_families" in view:
        out.update({f"{prefix}FamLo": fmt(view["ci_families"][0]), f"{prefix}FamHi": fmt(view["ci_families"][1])})
    return out


def paired_numbers(ana, keys):
    """payee-0.8b minus each contender: item and family-clustered intervals, sign test, and the per-view deltas."""
    out = {}
    for name, p in ana["vs_ours"].items():
        k = "Vs" + keys[name]
        out.update({**interval_macros(k, p["all"]), f"{k}P": latex_p(p["all"]["sign_p"]),
                    f"{k}Better": str(p["all"]["items_better"]), f"{k}Worse": str(p["all"]["items_worse"])})
        for view, tag in (("without_conventions", "Nc"), ("binary_suspicion", "Bin"), ("binary_suspicion_mass", "BinMass"),
                          ("cleared_0", "ClearZero"), ("cleared_1", "ClearOne")):
            out.update(interval_macros(k + tag, p[view]))
        out.update(interval_macros(k + "Auroc", p["auroc"], scale=1, digits=3))
        for q in QS:
            out.update(interval_macros(macro_name(k, q), p["per_question"][q]))
    for name, p in ana["vs_ours4"].items():
        out.update(interval_macros("FourVs" + keys[name], p))
    return out


def method_numbers(res):
    """Recipe, trainer pins, statistics and pricing constants, read from the run records and the harness code."""
    small, big = load("results/runs/payee-0.8b.json"), load("results/runs/payee-4b.json")
    rec, tr = small["recipe"], small["trainer"]
    mantissa, exponent = f"{rec['lr']:.0e}".split("e")
    return {"Epochs": str(rec["epochs"]), "Lr": f"{mantissa}\\times10^{{{int(exponent)}}}", "Batch": str(rec["batch"]), "Accum": str(rec["accum"]),
            "Params": f"{small['trainable_params_millions']:.1f}M", "ParamsFour": f"{big['trainable_params_millions']:.1f}M",
            "Rank": str(small["lora_rank"]), "Bins": str(metrics.BINS), "Budget": pct(res["budget"]),
            "Resamples": f"{analysis.SAMPLES:,}", "JevPrice": f"{JEV_USD_PER_M_INPUT:.3f}",
            "KevCommit": tr["kev_commit"], "InitSnapshot": tr["init_snapshot"][:7], "InitSnapshotFour": big["trainer"]["init_snapshot"][:7],
            "BaseRevision": small["base_revision"][:7], "WeightDecay": f"{tr['weight_decay']:g}", "ClipNorm": f"{tr['grad_clip_norm']:g}",
            "ClippedSteps": str(tr["clipped_steps"]), "PNone": pct(tr["augmentation"]["p_none"]),
            "PNoneDistract": pct(tr["augmentation"]["p_none_distract"]), "PDistract": pct(tr["augmentation"]["p_distract"]),
            "Confident": f"{analysis.CONFIDENT:.1f}"}


def run_numbers():
    small, big = load("results/runs/payee-0.8b.json"), load("results/runs/payee-4b.json")
    fg = load("results/runs/forgetting-transfer-v4.json")
    out = {"TrainMin": f"{small['wall_seconds'] / 60:.0f}", "TrainSteps": str(small["optimizer_steps"]),
           "TrainStep": f"{small['median_step_seconds']:.0f}", "TrainPeakGpu": f"{small['peak_device_bytes'] / 1e9:.1f}",
           "TempOurs": f"{small['calibration_on_val']['temperature']:.2f}",
           "FourMin": f"{big['wall_seconds'] / 60:.0f}", "FourSteps": str(big["optimizer_steps"]),
           "TempFour": f"{big['calibration_on_val']['temperature']:.2f}",
           "Watts": f"{costs.ASSUMED_WATTS:.0f}", "UsdKwh": f"{costs.TOKYO_USD_PER_KWH:.2f}", "LfourHour": f"{costs.L4_USD_PER_HOUR:.2f}",
           "LfourRps": f"{costs.L4_REQUESTS_PER_SECOND:.1f}"}
    for name, key in (("kev-0.8b", "FgBase"), ("payee-0.8b", "FgOurs"), ("kev-4b", "FgBaseFour"), ("payee-4b", "FgOursFour")):
        out.update({f"{key}Acc": f"{fg[name]['acc']:.3f}", f"{key}Ece": f"{fg[name]['ece']:.3f}", f"{key}Conf": pct(fg[name]["confident_error_rate"], 1)})
    out["FgN"] = str(fg["payee-0.8b"]["n"])
    return out


def external_numbers(ana):
    e, base = ana["external"][OURS], ana["external"][BASE]
    return {"ExtInjected": str(e["injected"]), "ExtScope": str(e["in_scope"]["n"]), "ExtRedirect": str(e["redirect"]["n"]),
            "ExtGoals": str(e["design"]["goal"]), "ExtAttacks": str(e["design"]["attack"]), "ExtCarriers": str(e["design"]["carrier"]),
            "ExtClean": str(e["clean"]),
            "ExtPfn": str(e["pfn"]["n"]), "ExtOursCleared": str(e["injected_cleared"]), "ExtOursOffGoal": str(e["cleared_off_goal"]),
            "ExtOursNewDest": str(e["in_scope"]["new_dest"]), "ExtOursSusp": str(e["in_scope"]["susp2"]),
            "ExtBaseNewDest": str(base["in_scope"]["new_dest"]), "ExtBaseSusp": str(base["in_scope"]["susp2"]),
            "ExtOursPfnSusp": str(e["pfn"]["susp2"]), "ExtOursPfnSuspPct": pct(e["pfn"]["susp2"] / e["pfn"]["n"], 1),
            "ExtOursPfnNewDest": str(e["pfn"]["new_dest"]),
            "ExtFourPfnSusp": str(ana["external"][OURS4]["pfn"]["susp2"]), "ExtFourCleared": str(ana["external"][OURS4]["injected_cleared"])}


def validity_numbers(ana, keys):
    out = {}
    for name, v in ana["agent_validity"].items():
        if name in keys:
            out[f"{keys[name]}Distinct"] = str(v["distinct"])
        else:
            out.update({"DiscardedDistinct": str(v["distinct"]), "DiscardedMostCommon": str(v["most_common"]), "DiscardedN": str(v["n"])})
    return out


def main():
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    res, status, ana = load("results/results.json"), load("results/contenders.json"), load("paper/generated/analysis.json")
    keys = keys_for(res)
    numbers = {**dataset_numbers(ana), **contender_numbers(res, ana, keys), **detail_numbers(res, ana), **paired_numbers(ana, keys),
               **run_numbers(), **method_numbers(res), **external_numbers(ana), **validity_numbers(ana, keys),
               "OpenModels": open_text.sentence(), **clear_gaps(ana), "LlamaBinPhrase": binary_phrase(ana),
               "OpenResults": open_text.results(res, ana), "OpenConclusion": open_text.conclusion(res, ana)}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "numbers.tex").write_text("% generated by paper/make_numbers.py from bench/results, bench/dataset and analysis.json; do not edit\n"
                                     + "".join(f"\\newcommand{{\\N{k}}}{{{v}}}\n" for k, v in sorted(numbers.items())), encoding="utf-8")
    (OUT / "table_results.tex").write_text("\n".join(tables.table_rows(res, status, ana)) + "\n", encoding="utf-8")
    (OUT / "table_families.tex").write_text("\n".join(tables.family_rows()) + "\n", encoding="utf-8")
    (OUT / "table_external.tex").write_text("\n".join(tables.external_rows(ana)) + "\n", encoding="utf-8")
    (OUT / "frontier.tex").write_text(frontier_text.render(res, status, ana), encoding="utf-8")
    log.info("wrote %d numbers, 2 tables and the frontier sentences to %s", len(numbers), OUT)


if __name__ == "__main__":
    main()
