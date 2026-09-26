"""How the paper names contenders: display labels and LaTeX macro keys, and how it prints signed differences and
money. Colours, bar patterns and markers come from payeebench.plots, so a contender looks the same here as in the
slide charts (every Claude tier shares one hue)."""
from payeebench.plots import CLAUDE_TIERS

OURS, OURS4, LLAMA = "payee-0.8b (ours)", "payee-4b (ours, 1 epoch)", "llama-3.3-70b (worker)"
BASE, BASE_T, BASE4 = "kev-0.8b (base)", "kev-0.8b (base, val-fitted T)", "kev-4b (base)"
GEMMA, LLAMA3B, QWEN = "gemma-4-e2b-payee (ours)", "llama-3.2-3b-payee (ours)", "qwen3-4b-payee (ours)"
PLANNED = (QWEN, GEMMA, LLAMA3B)         # the overnight fine-tunes: a pending row until their results land
KEYS = {BASE: "Base", BASE_T: "BaseT", BASE4: "BaseFour", OURS: "Ours", OURS4: "OursFour", LLAMA: "Llama",
        GEMMA: "Gemma", LLAMA3B: "LlamaSmall", QWEN: "QwenFour"}
LABELS = {BASE: "Kev-0.8B (released)", BASE_T: "Kev-0.8B + val. temperature", BASE4: "Kev-4B (released)",
          OURS: "payee-0.8b (ours)", OURS4: "payee-4b (ours, 1 epoch)", LLAMA: "Llama 3.3 70B",
          GEMMA: "Gemma 4 E2B + LoRA (ours)", LLAMA3B: "Llama 3.2 3B + LoRA (ours)", QWEN: "Qwen3-4B, Kev recipe (ours)"}


def tier(name):
    """The Claude tier word in a contender name, or None."""
    low = name.lower()
    return next((word for word in CLAUDE_TIERS if word in low), None) if "claude" in low else None


def key(name):
    """LaTeX macro prefix, letters only: 'Opus' for the agent row, 'OpusApi' for a Messages API row of the same model."""
    if name in KEYS:
        return KEYS[name]
    word = tier(name)
    if word:
        return word.title() + ("" if "(agent)" in name else "Api")
    return "".join(c for c in name.title() if c.isalpha())


def label(name):
    """'Claude Sonnet 5' from 'claude-sonnet-5 (agent)'; fixed labels for the measured contenders."""
    if name in LABELS:
        return LABELS[name]
    words = name.replace("(agent)", "").strip().split("-")
    return " ".join(w.title() if w.isalpha() else w for w in words)


def models(names, join):
    """A list of contenders for running text: 'Claude Sonnet 5, Opus 5.5 and Fable 5.1' rather than repeating 'Claude'."""
    labels = [label(n) for n in names]
    if len(labels) > 1 and all(t.startswith("Claude ") for t in labels):
        return "Claude " + join(t.removeprefix("Claude ") for t in labels)
    return join(labels)


def is_agent(status, name):
    return status.get(name, {}).get("source") == "agent"


def signed(x, digits=1):
    """A signed number with a typographic minus (U+2212), as the paper prints differences."""
    return f"{x:+.{digits}f}".replace("-", "\u2212")


def usd(x):
    """US$ to two significant figures, the one format the text, the table and the cost figure share."""
    return f"{x:#.2g}".rstrip(".") if x < 100 else f"{x:.0f}"
