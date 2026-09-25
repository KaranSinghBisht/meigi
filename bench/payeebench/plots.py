"""Pitch-slide charts (PNG, light surface): accuracy per question, reliability, auto-clear, latency and cost.
Colours follow the contender, never its rank; values are labelled selectively and RESULTS.md is the table view."""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import PathPatch  # noqa: E402
from matplotlib.path import Path  # noqa: E402

from .schema import QUESTION_IDS  # noqa: E402

SURFACE, INK, INK2, MUTED, GRID, AXIS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]   # validated order
FIXED = [("(ours)", 0), ("kev-0.8b (base)", 1), ("val-fitted", 2), ("4b", 3), ("jev", 6), ("claude", 4)]
REFERENCE = "#b9b8b1"      # estimates that are not measured contenders
MIN_BIN = 10               # reliability bins with fewer answers are noise, not signal
QUESTION_LABELS = {"request_type": "Request type", "new_destination": "New destination", "pressure": "Pressure", "suspicion": "Suspicion"}

plt.rcParams.update({"font.family": ["Helvetica Neue", "Arial", "DejaVu Sans"], "font.size": 13, "axes.edgecolor": AXIS,
                     "axes.labelcolor": INK2, "xtick.color": INK2, "ytick.color": INK2, "axes.facecolor": SURFACE,
                     "figure.facecolor": SURFACE, "savefig.facecolor": SURFACE, "axes.spines.top": False, "axes.spines.right": False})


def colors_for(names):
    """Stable colour per contender: a fixed slot for known contenders, then unused slots in order."""
    out, used = {}, set()
    for name in names:
        slot = next((s for pat, s in FIXED if pat in name.lower() and s not in used), None)
        if slot is None:
            slot = next(s for s in range(len(SLOTS)) if s not in used)
        used.add(slot); out[name] = SLOTS[slot]
    return out


def _frame(ax, grid_axis="y"):
    ax.grid(axis=grid_axis, color=GRID, linewidth=1, linestyle="-")
    ax.set_axisbelow(True)
    ax.tick_params(length=0)


def _rounded_bar(pos, width, length, rx, ry, horizontal):
    """One closed path, square at the baseline with rounded (quadratic) corners at the data end, so there is no seam.
    rx, ry: corner size in x and y data units."""
    if horizontal:
        rx, ry = min(rx, length), min(ry, width / 2)
        y0, y1, x1 = pos - width / 2, pos + width / 2, length
        pts = [(0, y0), (x1 - rx, y0), (x1, y0), (x1, y0 + ry), (x1, y1 - ry), (x1, y1), (x1 - rx, y1), (0, y1), (0, y0)]
    else:
        rx, ry = min(rx, width / 2), min(ry, length)
        x0, x1, y1 = pos - width / 2, pos + width / 2, length
        pts = [(x0, 0), (x0, y1 - ry), (x0, y1), (x0 + rx, y1), (x1 - rx, y1), (x1, y1), (x1, y1 - ry), (x1, 0), (x0, 0)]
    codes = [Path.MOVETO, Path.LINETO, Path.CURVE3, Path.CURVE3, Path.LINETO, Path.CURVE3, Path.CURVE3, Path.LINETO, Path.CLOSEPOLY]
    return Path(pts, codes)


def _draw_bars(ax, bars, horizontal=False, radius_px=7):
    """Add rounded bars. Call after limits and layout are final: the radius is set in pixels."""
    (x0, y0), (x1, y1) = ax.transData.transform([(0, 0), (1, 1)])
    rx, ry = radius_px / abs(x1 - x0), radius_px / abs(y1 - y0)
    for pos, width, length, color in bars:
        if length > 0:
            ax.add_patch(PathPatch(_rounded_bar(pos, width, length, rx, ry, horizontal), facecolor=color, edgecolor="none", lw=0, zorder=2))


def _legend(ax, names, colors, loc="lower right", extra=None, anchor=None, ncol=1, lines=()):
    handles = [plt.Line2D([], [], marker="s", linestyle="", markersize=11, color=colors[n]) for n in names]
    labels = [f"{n}{extra[n] if extra else ''}" for n in names]
    for label, color in lines:
        handles.append(plt.Line2D([], [], color=color, linewidth=1.2)); labels.append(label)
    return ax.legend(handles, labels, loc=loc, bbox_to_anchor=anchor, ncol=ncol, frameon=False, labelcolor=INK, handletextpad=0.4, columnspacing=1.6)


def accuracy_chart(result, colors, path):
    names = list(result["contenders"])
    groups = list(QUESTION_IDS) + ["mean"]
    fig, ax = plt.subplots(figsize=(12, 6.2))
    width, bars = min(0.8 / len(names), 0.26), []
    for i, name in enumerate(names):
        s = result["contenders"][name]
        values = [s["questions"][q]["accuracy"] for q in QUESTION_IDS] + [s["mean_accuracy"]]
        for g, v in enumerate(values):
            x = g + (i - (len(names) - 1) / 2) * (width + 0.02)
            bars.append((x, width, v, colors[name]))
            if g == len(groups) - 1 or "(ours)" in name:
                ax.text(x, v + 0.015, f"{v:.0%}", ha="center", va="bottom", fontsize=11, color=INK)
    ax.set_xticks(range(len(groups)), [QUESTION_LABELS.get(g, "Mean of 4") for g in groups])
    ax.set_ylim(0, 1.08); ax.set_yticks([0, 0.25, 0.5, 0.75, 1.0], ["0%", "25%", "50%", "75%", "100%"])
    ax.set_xlim(-0.6, len(groups) - 0.4)
    _frame(ax)
    _legend(ax, names, colors, loc="lower left", anchor=(0, 1.0), ncol=len(names))
    ax.set_title(f"PayeeBench-JA test accuracy ({result['n_items']} unseen items, new templates)", loc="left", color=INK, fontsize=15, pad=44)
    fig.tight_layout()
    _draw_bars(ax, bars)
    fig.savefig(path, dpi=200); plt.close(fig)


def reliability_chart(result, colors, path):
    names = list(result["contenders"])
    fig, ax = plt.subplots(figsize=(7.5, 7))
    ax.plot([0, 1], [0, 1], color=AXIS, linewidth=1.2, zorder=1)
    total = 4 * result["n_items"]
    for name in names:
        bins = [b for b in result["contenders"][name]["reliability"] if b["n"] >= MIN_BIN]
        xs, ys = [b["confidence"] for b in bins], [b["accuracy"] for b in bins]
        ax.plot(xs, ys, color=colors[name], linewidth=2, solid_capstyle="round", zorder=3)
        sizes = [(8 + 14 * (b["n"] / total) ** 0.5) ** 2 for b in bins]    # dot area grows with the answers in the bin
        ax.scatter(xs, ys, s=sizes, color=colors[name], edgecolors=SURFACE, linewidths=2, zorder=4)
    ax.set_xlim(0.2, 1.01); ax.set_ylim(0, 1.02)
    ax.set_xlabel("Stated confidence (top answer)"); ax.set_ylabel("Share correct")
    _frame(ax, "both")
    extra = {n: f"  (ECE {result['contenders'][n]['ece']:.3f})" for n in names}
    _legend(ax, names, colors, loc="lower right", extra=extra, lines=[("perfectly calibrated", AXIS)])
    ax.set_title("Is 0.9 confidence right 90% of the time?", loc="left", color=INK, fontsize=15, pad=14)
    fig.text(0.01, 0.01, f"All 4 questions pooled, top answer, 10 bins.\nDot area grows with the answers in a bin; bins with fewer than {MIN_BIN} are not drawn.", color=MUTED, fontsize=10)
    fig.tight_layout(rect=(0, 0.05, 1, 1)); fig.savefig(path, dpi=200); plt.close(fig)


def autoclear_chart(result, colors, path):
    """Share of legitimate items that go straight to the payment kernel, at the threshold chosen on validation."""
    names = list(result["contenders"])
    fig, ax = plt.subplots(figsize=(11, 1.6 + 1.25 * len(names)))
    bars = []
    for i, name in enumerate(names):
        ac = result["contenders"][name]["autoclear"]
        pick = ac.get("deployed", ac["oracle"])
        y = len(names) - 1 - i
        bars.append((y, 0.5, pick["legit_cleared"], colors[name]))
        ax.text(pick["legit_cleared"] + 0.01, y, f"{pick['legit_cleared']:.0%} of legit items, {pick['false_clears']} unsafe let through",
                va="center", fontsize=12, color=INK)
    ax.set_yticks(range(len(names)), list(reversed(names)))
    ax.set_xlim(0, 1); ax.set_xticks([0, 0.25, 0.5, 0.75, 1.0], ["0%", "25%", "50%", "75%", "100%"])
    ax.set_ylim(-0.6, len(names) - 0.4)
    _frame(ax, "x")
    ax.set_title(f"Auto-cleared without a human (threshold fixed on validation at a {result['budget']:.0%} error budget)",
                 loc="left", color=INK, fontsize=14, pad=14)
    fig.tight_layout()
    _draw_bars(ax, bars, horizontal=True)
    fig.savefig(path, dpi=200); plt.close(fig)


def speed_cost_chart(result, colors, path):
    names = list(result["contenders"])
    lat = {n: result["contenders"][n]["latency_ms"]["p50"] for n in names}
    cost = {n: result["contenders"][n]["usd_per_1k"] for n in names if result["contenders"][n]["usd_per_1k"]}
    refs = {"Jev list price (est.)": result.get("jev_list_price_per_1k"), "Kev-0.8B on cloud L4 (est.)": result.get("l4_cloud_usd_per_1k")}
    cost.update({k: v for k, v in refs.items() if v})
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(13, 1.8 + 0.9 * max(len(lat), len(cost))))
    for ax, data, unit, title in ((a1, lat, "ms", "p50 latency per item (4 questions)"), (a2, cost, "$", "Cost per 1,000 items (log scale)")):
        keys = list(data)
        for i, k in enumerate(keys):
            y = len(keys) - 1 - i
            ax.barh(y, data[k], 0.5, color=colors.get(k, REFERENCE), lw=0)
            label = f"{data[k]:.0f} ms" if unit == "ms" else f"${data[k]:.4f}" if data[k] >= 0.001 else f"${data[k]:.6f}"
            ax.text(data[k] * 1.08 if unit == "$" else data[k] + max(data.values()) * 0.02, y, label, va="center", fontsize=11, color=INK)
        ax.set_yticks(range(len(keys)), list(reversed(keys)))
        _frame(ax, "x")
        ax.set_title(title, loc="left", color=INK, fontsize=14, pad=12)
    a1.set_xlim(0, max(lat.values()) * 1.35)
    fig.text(0.01, 0.01, "Local Kev: measured on an M5 Max; cost = electricity at an assumed 60 W and ¥31/kWh. Grey bars are estimates, not measurements.",
             color=MUTED, fontsize=10)
    a2.set_xscale("log"); a2.set_xlim(min(cost.values()) / 3, max(cost.values()) * 30)
    fig.tight_layout(rect=(0, 0.04, 1, 1)); fig.savefig(path, dpi=200); plt.close(fig)


def draw_all(result, out_dir):
    names = list(result["contenders"])
    colors = colors_for(names)
    accuracy_chart(result, colors, out_dir / "accuracy.png")
    reliability_chart(result, colors, out_dir / "reliability.png")
    autoclear_chart(result, colors, out_dir / "autoclear.png")
    speed_cost_chart(result, colors, out_dir / "latency_cost.png")
