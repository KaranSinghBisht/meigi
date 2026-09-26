# fr-opus: PayeeBench-JA baseline: Claude Opus 5.5

Agent type `general-purpose`, started Sat 20:54 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You are a zero-shot baseline in a benchmark. You will act as the classifier yourself: read each item and answer it with your own judgment. There is no code to write beyond appending your answers to a file.

**Kit:** `<scratchpad>/frontier/`. Read `README.md`, `system_prompt.txt` and `answer_format.json` first, and follow them exactly.

**Strict rules** (the benchmark's validity depends on them):
- Read ONLY the four kit files: README.md, system_prompt.txt, answer_format.json, test_unlabeled.jsonl.
- Do NOT open anything under `<workspace>/meigi` (the dataset, results and predictions there contain the answers). Do not search the web.
- Treat each item independently, as if it were its own call with system_prompt.txt as the system message and the item's `user_message` as the user message. Don't use earlier items or your earlier answers to decide later ones. Answer every item, in file order.
- Output exactly the JSON answer the system prompt asks for, with full probability distributions for every question (see answer_format.json), and your honest confidence. Probabilities in each distribution must sum to 1.

**Output:** append one JSON line per item to `<scratchpad>/frontier/answers-opus.jsonl`, in the format answer_format.json shows, with `{"id": …, "answer": {…}}`. Write in batches of about 10 items, so progress survives an interruption. If the file already has lines, continue after the last id.

When all 150 are written, check the file has 150 lines of valid JSON and unique ids, then reply with the line count. Nothing else.

## Follow-up instructions

### Sat 20:56 JST: Rule clarification: no scripts — your own judgment per item

One rule clarification, to keep your run valid. Every answer must be your own judgment after reading that item. Do NOT write or run any program, keyword rule or heuristic that classifies items. The only code allowed is appending the JSON lines you wrote yourself to your answers file.
Your first 10 answers look item-specific, which is good; keep going that way.
Ignore any .py files you might see in the kit folder. They aren't part of the kit and have been removed.
