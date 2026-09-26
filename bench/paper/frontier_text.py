"""The paper's sentences about frontier rows (Claude models run as agents on the label-free kit), generated so that
their wording always follows the numbers. Differences are stated as payee-0.8b's lead, as in the forest figure: a model
is "tied" with payee-0.8b when the item-level 95% interval contains zero, "ahead" or "behind" only when it excludes
zero, and a family-clustered interval that disagrees is said so. Writes the LaTeX macros \\NFrontierAbstract,
\\NFrontierResults, \\NFrontierCalibration, \\NFrontierRouting, \\NFrontierCost and \\NFrontierConclusion; before any
agent row exists they hold a placeholder or nothing."""
import names

PENDING = "Frontier Claude models are being run on the same label-free kit and prompt as Llama; their rows will be added when scored."


def join(items):
    items = list(items)
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def verb(items):
    return "is" if len(items) == 1 else "are"


def verdict(pair):
    """'tied', 'ahead' (the contender is more accurate than payee-0.8b) or 'behind', from payee-0.8b minus contender."""
    lo, hi = pair["ci_items"]
    return "tied" if lo <= 0 <= hi else ("behind" if lo > 0 else "ahead")


def family_disagrees(pair):
    lo, hi = pair["ci_families"]
    return verdict(pair) != "tied" and lo <= 0 <= hi


def group(agents):
    return names.models(agents, join)


def short(name):
    """A contender's label without 'Claude', once the paragraph has said it."""
    return names.label(name).removeprefix("Claude ")


def ci(lo, hi):
    return f"[{names.signed(100 * lo)}, {names.signed(100 * hi)}]"


def perfect(agents, ana):
    """Agents whose p_safe puts every safe test item above every item that should be held."""
    return [n for n in agents if ana["contenders"][n]["auroc_test"] == 1.0]


def by_verdict(agents, ana):
    groups = {"tied": [], "ahead": [], "behind": []}
    for n in agents:
        groups[verdict(ana["vs_ours"][n]["all"])].append(n)
    return groups


def abstract(agents, ana):
    groups, parts = by_verdict(agents, ana), []
    if groups["tied"]:
        parts.append(f"{group(groups['tied'])} {verb(groups['tied'])} statistically tied with it in accuracy")
    if groups["ahead"]:
        gaps = sorted(-100 * ana["vs_ours"][n]["all"]["delta"] for n in groups["ahead"])
        by = f"{gaps[0]:.1f}" if len(gaps) == 1 else f"{gaps[0]:.1f}--{gaps[-1]:.1f}"
        note = " (their family-clustered intervals include zero)" if all(family_disagrees(ana["vs_ours"][n]["all"]) for n in groups["ahead"]) else ""
        parts.append(f"{group(groups['ahead'])} {verb(groups['ahead'])} {by} points ahead{note}")
    if groups["behind"]:
        parts.append(f"{group(groups['behind'])} {verb(groups['behind'])} behind")
    top = perfect(agents, ana)
    ranking = f" {group(top)} rank every safe item above every held one." if top else ""
    return "Run as agents with many items in one context, " + join(parts) + "." + ranking


def results(agents, ana, res):
    ours = ana["contenders"][names.OURS]
    first, rest = agents[0], agents[1:]
    scores = f"{names.label(first)} scores {res['contenders'][first]['mean_accuracy']:.3f} mean accuracy" + (
        ", " + join(f"{short(n)} {res['contenders'][n]['mean_accuracy']:.3f}" for n in rest) if rest else "")
    leads = []
    for n in agents:
        p = ana["vs_ours"][n]["all"]
        leads.append(f"{names.signed(100 * p['delta'])} over {short(n)} ({ci(*p['ci_items'])}"
                     + ("; tied" if verdict(p) == "tied" else "") + ")")
    disagree = [n for n in agents if family_disagrees(ana["vs_ours"][n]["all"])]
    note = (f"; the family-clustered intervals for {join(short(n) for n in disagree)} include zero" if disagree else "")
    conv = [ana["contenders"][n]["convention_acc"] for n in agents]
    binary = [ana["contenders"][n]["binary_suspicion_acc"] for n in agents]
    tied4 = [n for n in agents if verdict(ana.get("vs_ours4", {}).get(n, {"ci_items": (1, 1)})) == "tied"]
    four = (f" Our 4B fine-tune is statistically tied with {group(tied4)} (its lead "
            f"{join(names.signed(100 * ana['vs_ours4'][n]['delta']) for n in tied4)} points; every interval contains zero)."
            if tied4 else "")
    return (f"Run as agents on the label-free kit, {scores}. payee-0.8b's lead is "
            f"{join(leads)}{note}.{four} On the {ana['dataset']['convention_answers_test']} convention answers they score "
            f"{min(conv):.2f}--{max(conv):.2f} (payee-0.8b {ours['convention_acc']:.2f}), and on binary suspicion by top level "
            f"{min(binary):.3f}--{max(binary):.3f} (payee-0.8b {ours['binary_suspicion_acc']:.3f}).")


def calibration(agents, ana, res):
    ece = sorted((res["contenders"][n]["ece"], n) for n in agents)
    errors = [ana["contenders"][n]["confident_errors"] for n in agents]
    return (f"The Claude models' ECE ranges from {ece[0][0]:.3f} ({short(ece[0][1])}) to {ece[-1][0]:.3f} "
            f"({short(ece[-1][1])}), and they give {min(errors)}--{max(errors)} wrong answers at "
            f"{ana['confident_threshold']:g} confidence or more.")


def routing(agents, ana):
    top = perfect(agents, ana)
    rest = [n for n in agents if n not in top]
    text = ""
    if top:
        c = ana["contenders"][top[0]]
        text = (f"{group(top)} rank every safe test item above every one that should be held "
                f"(AUROC 1.000): a threshold chosen on test would clear all {c['safe_items']} safe items and none of the "
                f"{c['held_items']} others. ")
    if rest:
        text += " ".join(f"{names.label(n)} reaches {ana['contenders'][n]['auroc_test']:.3f} and clears "
                         f"{ana['contenders'][n]['cleared_with_unsafe']['0']} with none held cleared." for n in rest) + " "
    return text + "None of them has a validation run, so their deployed rate is unknown."


def cost(agents, res):
    rows = sorted((res["contenders"][n]["usd_per_1k"], n) for n in agents if res["contenders"][n]["usd_per_1k"] is not None)
    if not rows:
        return ""
    return (f"At list price for the token counts Llama used on the same prompts, the Claude models would cost "
            f"\\${names.usd(rows[0][0])} ({short(rows[0][1])}) to \\${names.usd(rows[-1][0])} ({short(rows[-1][1])}) "
            f"per 1,000 items~\\cite{{anthropic_pricing}}. These are estimates and probably low: Llama's output contains no "
            f"reasoning, which these models can spend and are billed for (Opus 5.5 and Fable 5.1 always do), and their "
            f"latency was not measured.")


def conclusion(agents, ana):
    """A leading space and one sentence about frontier models that are significantly more accurate or rank perfectly."""
    ahead = by_verdict(agents, ana)["ahead"]
    top = perfect(agents, ana)
    parts, count = [], {1: "one", 2: "two", 3: "three", 4: "four"}
    if ahead:
        caveat = " (item-level; the family-clustered intervals include zero)" if all(family_disagrees(ana["vs_ours"][n]["all"]) for n in ahead) else ""
        parts.append(f"{group(ahead)} {verb(ahead)} also more accurate than it{caveat}")
    if top:
        parts.append(f"{count.get(len(top), len(top))} Claude models separate safe from held items perfectly")
    return f" Run as agents, {join(parts)}." if parts else ""


def render(res, status, ana):
    agents = [n for n in res["contenders"] if names.is_agent(status, n)]
    texts = {"Abstract": "", "Results": PENDING, "Calibration": "", "Routing": "", "Cost": "", "Conclusion": ""}
    if agents:
        texts = {"Abstract": abstract(agents, ana), "Results": results(agents, ana, res), "Calibration": calibration(agents, ana, res),
                 "Routing": routing(agents, ana), "Cost": cost(agents, res), "Conclusion": conclusion(agents, ana)}
    return "% generated by paper/frontier_text.py; do not edit\n" + "".join(f"\\newcommand{{\\NFrontier{k}}}{{{v}}}\n" for k, v in texts.items())
