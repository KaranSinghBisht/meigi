"""mlx-lm 0.31.3 cannot load Gemma 4 E2B: the checkpoint carries k/v projections and k-norms for the KV-shared layers,
which mlx-lm's model does not have, so strict loading fails. Importing this module drops exactly those weights (the
shared layers read the keys and values of an earlier layer). Run `python scripts/mlx_compat.py lora ...` in place of
`python -m mlx_lm.lora ...`; scripts/mlx_sft_answers.py imports it."""
import re
import sys

import mlx_lm.models.gemma4 as gemma4
from mlx.utils import tree_flatten

SHARED_KV = re.compile(r"self_attn\.(k_proj|v_proj|k_norm)\.")
_sanitize = gemma4.Model.sanitize


def sanitize(self, weights):
    weights = _sanitize(self, weights)
    have = {k for k, _ in tree_flatten(self.parameters())}
    return {k: v for k, v in weights.items() if k in have or not SHARED_KV.search(k)}


gemma4.Model.sanitize = sanitize

if __name__ == "__main__" and sys.argv[1:2] == ["lora"]:
    from mlx_lm import lora

    sys.argv = ["mlx_lm.lora", *sys.argv[2:]]
    lora.main()
