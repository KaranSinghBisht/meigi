"""The paper's generated tables: Table I (families and their labels), Table II (results, one block per kind of
contender, with a row for each planned fine-tune not yet scored) and Table III (the external checks). Called by
make_numbers.py."""
import json
from pathlib import Path

import analysis
import names
from names import LLAMA, OURS

BENCH = Path(__file__).resolve().parents[1]

QS = ("request_type", "new_destination", "pressure", "suspicion")


def load(path):
    return json.loads((BENCH / path).read_text(encoding="utf-8"))


def pct(x, digits=0):
    return f"{100 * x:.{digits}f}\\%"


def family_rows():
    """Per family: items per split and the label combinations that occur; a star marks a convention label."""
    stats = load("dataset/stats.json")
    combos = {}
    for split in ("train", "val", "test"):
        for line in (BENCH / "dataset" / f"{split}.jsonl").read_text(encoding="utf-8").splitlines():
            r = json.loads(line)
            q = r["questions"]
            combos.setdefault(r["_meta"]["family"], set()).add(
                (q["request_type"]["label"], q["new_destination"]["label"], q["pressure"]["label"], q["suspicion"]["label"]))
    short = {"routine_invoice": "routine", "payee_change": "change", "urgent_exec_request": "exec", "credit_note": "credit", "other": "other"}
    rows = []
    for fam in stats["train"]["families"]:
        cs, star = sorted(combos[fam], key=str), analysis.CONVENTIONS.get(fam, ())
        levels = sorted({c[3] for c in cs})
        cells = {"request_type": "/".join(sorted({short[c[0]] for c in cs})),
                 "new_destination": "/".join(sorted({"Y" if c[1] else "N" for c in cs}, reverse=True)),
                 "pressure": "/".join(sorted({"Y" if c[2] else "N" for c in cs}, reverse=True)),
                 "suspicion": "--".join(str(x) for x in levels[:: max(1, len(levels) - 1)])}
        marked = [cells[q] + ("$^*$" if q in star else "") for q in QS]
        n = "/".join(str(stats[s]["families"].get(fam, 0)) for s in ("train", "val", "test"))
        rows.append(f"\\texttt{{{fam.replace('_', chr(92) + '_')}}} & {n} & " + " & ".join(marked) + " \\\\")
    return rows


GROUPS = (("kev", "Kev decision models, served locally"), ("sft", "Open generative models, LoRA SFT, local (ours)"),
          ("llm", "Zero-shot LLM"), ("agent", "Claude models run as Claude Code agents (indicative)"))


def group_of(name, status):
    st = status.get(name, {})
    if st.get("source") == "agent":
        return "agent"
    if st.get("source") == "sft" or name in (names.GEMMA, names.LLAMA3B):
        return "sft"
    return "llm" if st.get("kind") == "llm" else "kev"


def result_row(name, s, status, ana):
    q, dep = s["questions"], s["autoclear"].get("deployed")
    oracle = pct(s["autoclear"]["oracle"]["legit_cleared"])
    ac = f"{pct(dep['legit_cleared'])} ({dep['false_clears']}) / {oracle}" if dep and dep["threshold"] is not None else f"-- / {oracle}"
    lat = f"{s['latency_ms']['p50']:,.0f}" if s["latency_ms"] else "--"
    cost = "--" if s["usd_per_1k"] is None else names.usd(s["usd_per_1k"])
    mark = "$^\\ddagger$" if names.is_agent(status, name) else ("$^\\dagger$" if name == LLAMA else "")
    cells = [f"{q[k]['accuracy']:.3f}" for k in QS] + [f"{s['mean_accuracy']:.3f}", f"{s['ece']:.3f}",
                                                       f"{ana['contenders'][name]['auroc_test']:.3f}", ac, lat, cost]
    text = names.label(name).replace("+ val. temperature", "+ temp.\\ refit on val.")
    return (f"\\textbf{{{text}}}" if name == OURS else text) + f"{mark} & " + " & ".join(cells) + " \\\\"


def table_rows(res, status, ana):
    """Table II body: one block per kind of contender, with a pending row for each planned fine-tune not yet scored."""
    rows = []
    for key, title in GROUPS:
        members = [n for n in res["contenders"] if group_of(n, status) == key]
        pending = [n for n in names.PLANNED if n not in res["contenders"] and group_of(n, status) == key]
        if not members and not pending:
            continue
        rows += (["\\midrule"] if rows else []) + [f"\\multicolumn{{11}}{{@{{}}l}}{{\\emph{{{title}}}}} \\\\"]
        rows += [result_row(n, res["contenders"][n], status, ana) for n in members]
        rows += [f"{names.label(n)} & \\multicolumn{{10}}{{c}}{{\\emph{{{not_run().get(n, 'pending: training scheduled')}}}}} \\\\" for n in pending]
    return rows


def not_run():
    """Planned contenders that will not get a result, and why (results/runs/not-run.json, written when a window closes)."""
    path = BENCH / "results" / "runs" / "not-run.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def external_rows(ana):
    """Table III body: the AgentDojo-derived and benign-mail counts per local contender."""
    rows = []
    for name, e in ana["external"].items():
        cells = [f"{e['injected_cleared']}", f"{e['in_scope']['new_dest']}", f"{e['in_scope']['susp2']}",
                 f"{e['redirect']['new_dest']} / {e['redirect']['susp2']}", f"{e['pfn']['new_dest']}", f"{e['pfn']['susp2']}"]
        rows.append(f"{names.label(name)} & " + " & ".join(cells) + " \\\\")
    return rows
