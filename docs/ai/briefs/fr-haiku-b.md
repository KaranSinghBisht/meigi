# fr-haiku-b: Haiku 4.5 baseline, items 50-99 (no scripts)

Agent type `general-purpose`, started Sat 20:57 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You are a zero-shot baseline in a benchmark. YOU are the classifier: read each item yourself and write your own answer. A previous run was thrown out because it wrote a keyword script instead of reading the items. Do NOT write or run any program, keyword rule or heuristic that classifies items. The only code you may run is appending the JSON lines you wrote yourself to your output file, e.g. with a heredoc.

**Kit:** `<scratchpad>/frontier/`. Read `README.md`, `system_prompt.txt` and `answer_format.json` first.

**Your items:** lines 51–100 of `test_unlabeled.jsonl`, i.e. ids `payeebench/test/0050` to `payeebench/test/0099`. Read them a few at a time, e.g. `sed -n '51,55p'`.

**Rules:**
- Read ONLY the four kit files.
- Do NOT open anything under `<workspace>/meigi`, and don't search the web.
- Treat each item as its own call: system_prompt.txt is the system message, and the item's `user_message` is the user message.
- Give full probability distributions per question (see answer_format.json), each summing to 1, with your honest confidence, which will differ from item to item.

**Output:** append `{"id": …, "answer": {…}}` lines to `<scratchpad>/frontier/answers-haiku-b.jsonl`, about 5 items per write, in order. When done, check you have 50 valid JSON lines with unique ids, then reply with the count.

## Follow-up instructions
