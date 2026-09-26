import sys
from pathlib import Path

import numpy as np
import pytest

from payeebench import metrics, plots

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "paper"))
import frontier_text  # noqa: E402

CONTENDERS = ["kev-0.8b (base)", "kev-0.8b (base, val-fitted T)", "kev-4b (base)", "payee-0.8b (ours)", "payee-4b (ours, 1 epoch)",
              "llama-3.3-70b (worker)", "claude-haiku-4.5 (agent)", "claude-sonnet-5 (agent)", "claude-opus-5.5 (agent)",
              "claude-fable-5.1 (agent)"]


def test_stated_probabilities_on_a_bin_edge_go_to_the_upper_bin():
    conf = np.array([0.3, 0.6, 0.7, 1 - 0.3, 0.6999999999999999, 1.0, 0.0])
    assert metrics.bin_index(conf).tolist() == [3, 6, 7, 7, 7, 9, 0]
    bins = metrics.reliability(conf[:3], np.array([1.0, 0.0, 1.0]))
    assert [b["lo"] for b in bins] == [0.3, 0.6, 0.7]


def test_colours_follow_the_contender_whatever_the_order():
    colours = plots.colors_for(CONTENDERS)
    assert plots.colors_for(list(reversed(CONTENDERS))) == colours
    assert len({colours[n] for n in CONTENDERS if "claude" in n}) == 1          # one hue for the Claude tiers ...
    assert len({plots.hatch_for(n) for n in CONTENDERS if "claude" in n}) == 4  # ... told apart by pattern
    assert len({colours[n] for n in CONTENDERS if "claude" not in n}) == 6


def test_an_unknown_contender_never_takes_a_reserved_colour():
    colours = plots.colors_for(["some new model", *CONTENDERS])
    assert colours["some new model"] not in {colours[n] for n in CONTENDERS}


@pytest.mark.parametrize("ci, word", [((0.02, 0.08), "behind"), ((-0.02, 0.04), "tied"), ((-0.06, -0.01), "ahead")])
def test_frontier_wording_follows_the_interval(ci, word):
    assert frontier_text.verdict({"ci_items": ci}) == word
