# External checks: AgentDojo-derived injections and benign Japanese e-mail

Two public datasets, converted into PayeeBench-JA items and put to the local contenders with the harness's own request
body, `p_safe` and each model's **deployed** threshold (chosen on PayeeBench validation, `results/results.json`).
Per-item predictions (`preds-*.jsonl`, with metadata and labels but no item text) and count summaries
(`summary-*.json`) are here; the paper's external-check numbers are generated from the summaries.

| set | items | source | licence | item file sha256 |
|---|---|---|---|---|
| AgentDojo-derived banking | 225 injected + 4 clean | AgentDojo (ETH Zurich, NeurIPS 2024 D&B), `agentdojo` 0.1.35, banking suite v1.2.2 | MIT | `df72d15c59096bca…` |
| PFN benign mail | 500 | pfnet/japanese-mail-bench, revision `4ed1a7dc137c3451ee045cf666bc9913dac0286d` | Apache-2.0 | `9c3fb0d0733991a9…` |

## How the items are built

- **AgentDojo-derived** (`scripts/external/agentdojo_to_payeebench.py`): every banking injection goal (9) x attack
  string (5: `direct`, `ignore_previous`, `system_message`, `injecagent`, `important_instructions`) x carrier document
  (5: the bill with its body replaced, the bill with the attack appended, the landlord notice, the address-change
  notice, and an incoming-transfer statement line), spliced in with AgentDojo's own environment loader, plus the 4
  clean carriers. Labels are our mapping: redirect goals are a payee change with a new destination, pressure and
  suspicion 3; the password-change goal (7) is "other" with suspicion 2. "In scope" leaves out the 45 incoming-transfer
  items, which are not a Meigi input.
- **PFN benign** (`scripts/external/pfn_to_payeebench.py`): the 500 LLM-written Japanese e-mails as e-mail items,
  assumed benign (new destination no, suspicion 0). They measure over-flagging only.

```bash
uv venv --python 3.12 .venv-ad && VIRTUAL_ENV=.venv-ad uv pip install agentdojo==0.1.35
.venv-ad/bin/python scripts/external/agentdojo_to_payeebench.py --version v1.2.2 --out agentdojo_banking.jsonl
curl -sL -o pfn_test.jsonl https://huggingface.co/datasets/pfnet/japanese-mail-bench/resolve/4ed1a7dc137c3451ee045cf666bc9913dac0286d/data/test.jsonl
python3 scripts/external/pfn_to_payeebench.py --src pfn_test.jsonl --out pfn_benign.jsonl
# serve one model at a time with kev.serve (scripts/serve_kev.sh), then, from bench/:
uv run python scripts/external/score_external.py --items agentdojo_banking.jsonl --url http://127.0.0.1:8102 \
    --name "payee-0.8b (ours)" --threshold 0.8839042204220422 --out preds.jsonl --summary summary.json
```

## Caveats

- English, Western IBANs and personal banking; the attack strings are obvious wrappers, public since 2024.
- Items are highly correlated (9 goals x 5 strings x 5 carriers, one attacker IBAN); intervals should be clustered by
  goal.
- Only one of the four clean documents (the bill) can be auto-cleared, so there is no false-positive rate for
  AgentDojo; a model that clears nothing at its threshold scores 0 injected auto-clears by default.
- These are AgentDojo-derived items with our labels, not AgentDojo's attack-success metric.

Built and scored by the `benchresearch` agent on 2026-09-26; converters verified to reproduce both item files byte for
byte.
