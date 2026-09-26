# PayeeBench-JA frontier kit (test split, labels removed)

This folder is everything a model needs to answer the 150 PayeeBench-JA test items under the same condition as the
Llama 3.3 70B contender. It contains no labels and no metadata that implies them.

| file | what it is |
|---|---|
| `test_unlabeled.jsonl` | 150 items, one per line: `id` (stable, e.g. `payeebench/test/0000`), `state` (the item), `questions` (the 4 System-1 questions: type, instructions, criteria), `user_message` (the item rendered as text: exactly the user message Llama received) |
| `system_prompt.txt` | exactly the system message Llama received (task, the 4 questions with their options, the JSON shape) |
| `answer_format.json` | the shape of one answer line |

## The condition (match it)

Llama was called once per item, independently: system message = `system_prompt.txt`, user message = the item's
`user_message`, temperature 0, at most 300 output tokens, no tools, no other items, no labels. Answer each item the same
way: on its own, from those two texts alone. Do not read any other file, search the web, compare items, or revise
earlier answers after seeing later items.

## Output: `answers.jsonl`, one line per item

```json
{"id": "payeebench/test/0000", "answer": {"request_type": {"routine_invoice": 0.1, "payee_change": 0.8, "urgent_exec_request": 0.05, "credit_note": 0.05, "other": 0.0}, "new_destination": 0.9, "pressure": 0.2, "suspicion": {"0": 0.05, "1": 0.1, "2": 0.35, "3": 0.5}}}
```

- `request_type` and `suspicion`: a probability for every option (they are renormalised if they do not sum to 1).
- `new_destination` and `pressure`: the probability of yes, in [0, 1].
- The probabilities should say how sure the model is: they drive the calibration (ECE) and the auto-clear metric.

A simpler form is accepted but is less faithful for auto-clear (the rest of the mass is spread evenly):

```json
{"id": "payeebench/test/0000", "labels": {"request_type": "payee_change", "new_destination": true, "pressure": false, "suspicion": 3}, "confidence": {"request_type": 0.8, "new_destination": 0.9, "pressure": 0.8, "suspicion": 0.5}}
```

A missing or unparseable item is scored as a uniform distribution (a failure) and counted.

## Scoring (run from the repo, not by the model)

```bash
cd /Users/kryptos/Desktop/Projects/ethtokyo/meigi/bench && uv run python -m payeebench.external score --name "claude-haiku-4.5 (agent)" --model claude-haiku-4-5 --predictions /path/to/answers.jsonl
```

It prints the same row as `results/RESULTS.md` (accuracy and macro-F1 per question, ECE, legit items auto-cleared at a
1% error budget, latency, $ per 1k) and paired accuracy deltas with 95% CIs and McNemar p against payee-0.8b, payee-4b,
Kev-4B and Llama. Add `--save` to put the row into `results/` (predictions, RESULTS.md, charts).

- `--model` is one of `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5-5`, `claude-fable-5-1`.
- Latency is not measured for agent runs (`n/a`).
- Cost is a list-price estimate: the token counts measured for Llama 3.3 on the same prompts, multiplied by the model's
  input and output price per million tokens.
- Deployed auto-clear needs a validation run, so it is `n/a`; the oracle figure (threshold chosen on test) is given, as
  for Llama.
