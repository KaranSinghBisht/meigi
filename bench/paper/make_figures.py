"""The paper's figures, drawn from results/results.json and paper/generated/analysis.json with the palette of
payeebench.plots (the slide charts in results/*.png), at print size and as vector PDF.

    cd bench && uv run python paper/make_figures.py      # writes paper/figures/*.pdf (run paper/analysis.py first)

Colour follows the contender in every figure; the Claude tiers share one hue and differ by marker and label."""
import json
import sys
from pathlib import Path

BENCH = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BENCH))
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import names

from payeebench.plots import (
    AXIS,
    GRID,
    INK,
    INK2,
    MIN_BIN,
    MUTED,
    colors_for,
    marker_for,
)

OUT = BENCH / "paper" / "figures"
SKIP = {names.BASE_T}            # same answers as the released 0.8B; it stays in the table only
plt.rcParams.update({"font.family": ["Helvetica Neue", "Arial", "DejaVu Sans"], "font.size": 7.5, "axes.edgecolor": AXIS,
                     "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2, "axes.facecolor": "white",
                     "figure.facecolor": "white", "savefig.facecolor": "white", "axes.spines.top": False, "axes.spines.right": False,
                     "axes.linewidth": 0.6, "xtick.major.size": 0, "ytick.major.size": 0, "pdf.fonttype": 42})


def style(name, colors):
    """(colour, marker) of a contender, as in the slide charts: Claude tiers share a hue and differ by marker."""
    return colors[name], marker_for(name)


def frame(ax, axis="y"):
    ax.grid(axis=axis, color=GRID, linewidth=0.5)
    ax.set_axisbelow(True)


def forest(res, ana, colors):
    """Paired lead of payee-0.8b in mean accuracy over each contender: item-bootstrap (thick) and family-clustered
    (thin) 95% intervals."""
    rows = sorted((n for n in ana["vs_ours"] if n not in SKIP), key=lambda n: ana["vs_ours"][n]["all"]["delta"])
    fig, ax = plt.subplots(figsize=(3.4, 0.45 + 0.125 * len(rows)))
    for y, name in enumerate(rows):
        p = ana["vs_ours"][name]["all"]
        color, marker = style(name, colors)
        ax.plot([100 * v for v in p["ci_families"]], [y, y], color=MUTED, linewidth=0.8, zorder=2)
        ax.plot([100 * v for v in p["ci_items"]], [y, y], color=INK, linewidth=2.2, zorder=3, solid_capstyle="butt")
        ax.scatter([100 * p["delta"]], [y], s=26, marker=marker, color=color, edgecolors="white", linewidths=0.8, zorder=4)
        ax.text(100 * p["ci_families"][1] + 0.8, y, names.signed(100 * p["delta"]), va="center", fontsize=6.5, color=INK)
    ax.axvline(0, color=INK2, linewidth=0.7, zorder=1)
    ax.set_yticks(range(len(rows)), [names.label(n) for n in rows])
    ax.set_xlabel("payee-0.8b's lead (accuracy points)")
    lo = min(100 * ana["vs_ours"][n]["all"]["ci_families"][0] for n in rows)
    hi = max(100 * ana["vs_ours"][n]["all"]["ci_families"][1] for n in rows)
    ax.set_xlim(min(lo - 1, -5), hi + 5)
    frame(ax, "x")
    fig.tight_layout(pad=0.3)
    fig.savefig(OUT / "forest.pdf")
    plt.close(fig)


def reliability_panel(ax, res, group, colors, title):
    ax.plot([0, 1], [0, 1], color=AXIS, linewidth=0.8, zorder=1, label="perfectly calibrated")
    total = 4 * res["n_items"]
    for name in group:
        s = res["contenders"][name]
        bins = [b for b in s["reliability"] if b["n"] >= MIN_BIN]
        xs, ys = [b["confidence"] for b in bins], [b["accuracy"] for b in bins]
        color, marker = style(name, colors)
        ax.plot(xs, ys, color=color, linewidth=1.1, zorder=3, label=f"{names.label(name)} (ECE {s['ece']:.3f})",
                marker=marker, markersize=3.5, markeredgewidth=0)
        ax.scatter(xs, ys, s=[(2.5 + 6 * (b["n"] / total) ** 0.5) ** 2 for b in bins], marker=marker, color=color,
                   edgecolors="white", linewidths=0.7, zorder=4)
    ax.set_xlim(0.2, 1.01); ax.set_ylim(0, 1.02)
    ax.set_xlabel("Stated confidence (top answer)"); ax.set_ylabel("Share correct")
    ax.set_title(title, loc="left", fontsize=7.5, color=INK)
    frame(ax, "both")
    ax.legend(loc="center left", bbox_to_anchor=(1.02, 0.5), frameon=False, fontsize=5.8, handlelength=1.4, markerscale=1)


def reliability(res, status, colors):
    def local(n):
        return status[n].get("kind", "systemone") == "systemone" or status[n].get("source") == "sft"
    near = [n for n in res["contenders"] if n not in SKIP and local(n)]
    far = [n for n in res["contenders"] if not local(n)]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(7.0, 1.7))
    reliability_panel(a1, res, near, colors, "(a) Local models: released Kev and our fine-tunes")
    reliability_panel(a2, res, far, colors, "(b) LLMs, not fine-tuned")
    fig.tight_layout(pad=0.3, w_pad=0.8)
    fig.savefig(OUT / "reliability.pdf")
    plt.close(fig)


def main():
    res = json.loads((BENCH / "results" / "results.json").read_text(encoding="utf-8"))
    status = json.loads((BENCH / "results" / "contenders.json").read_text(encoding="utf-8"))
    ana = json.loads((BENCH / "paper" / "generated" / "analysis.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for stale in ("accuracy.pdf", "autoclear.pdf", "speed_cost.pdf", "tradeoff.pdf", "cost.pdf"):
        (OUT / stale).unlink(missing_ok=True)
    colors = colors_for(list(res["contenders"]))
    forest(res, ana, colors)
    reliability(res, status, colors)


if __name__ == "__main__":
    main()
