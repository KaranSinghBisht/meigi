# How the frontier Claude rows were produced

The four Claude rows in `results/` (`claude-*-agent`) come from Claude Code agents, not from single API calls. This file
records what they were told and what their transcripts show, so the paper's protocol paragraph can be checked. The
transcripts themselves are session logs outside the repository.

## Setup

- **Kit.** `payeebench.external kit` wrote a label-free copy of the test split (`test_unlabeled.jsonl`: id, state,
  questions, and the exact user message Llama received), the exact system prompt Llama received, the answer format and
  a README (`payeebench/external_kit.md`). The README asks for one independent judgment per item and says the
  probabilities drive the calibration (ECE) and auto-clear metrics.
- **Agents.** One agent per model: Claude Sonnet 5, Claude Opus 5.5 and Claude Fable 5.1 over all 150 items, and Claude
  Haiku 4.5 as three agents of 50 items. A first Haiku 4.5 run wrote a keyword classifier and was discarded.
- **Scoring.** `payeebench.external score --save` with the model's list price; latency is not measured, and the cost is
  the list price of the token counts Llama used on the same prompts.

## Instructions

Sonnet 5, Opus 5.5 and Fable 5.1 (and the discarded Haiku run) got this, with their own output file. `<kit>` stands for
the kit folder.

> You are a zero-shot baseline in a benchmark. You will act as the classifier yourself: read each item and answer it with your own judgment. There is no code to write beyond appending your answers to a file.
>
> **Kit:** `<kit>/`. Read `README.md`, `system_prompt.txt` and `answer_format.json` first, and follow them exactly.
>
> **Strict rules** (the benchmark's validity depends on them):
> - Read ONLY the four kit files: README.md, system_prompt.txt, answer_format.json, test_unlabeled.jsonl.
> - Do NOT open anything under `/Users/kryptos/Desktop/Projects/ethtokyo/meigi` (the dataset, results and predictions there contain the answers). Do not search the web.
> - Treat each item independently, as if it were its own call with system_prompt.txt as the system message and the item's `user_message` as the user message. Don't use earlier items or your earlier answers to decide later ones. Answer every item, in file order.
> - Output exactly the JSON answer the system prompt asks for, with full probability distributions for every question (see answer_format.json), and your honest confidence. Probabilities in each distribution must sum to 1.
>
> **Output:** append one JSON line per item to `<kit>/answers-sonnet.jsonl`, in the format answer_format.json shows, with `{"id": …, "answer": {…}}`. Write in batches of about 10 items, so progress survives an interruption. If the file already has lines, continue after the last id.
>
> When all 150 are written, check the file has 150 lines of valid JSON and unique ids, then reply with the line count. Nothing else.

The three Haiku 4.5 agents got this, with their own item range and output file:

> You are a zero-shot baseline in a benchmark. YOU are the classifier: read each item yourself and write your own answer. A previous run was thrown out because it wrote a keyword script instead of reading the items. Do NOT write or run any program, keyword rule or heuristic that classifies items. The only code you may run is appending the JSON lines you wrote yourself to your output file, e.g. with a heredoc.
>
> **Kit:** `<kit>/`. Read `README.md`, `system_prompt.txt` and `answer_format.json` first.
>
> **Your items:** lines 1–50 of `test_unlabeled.jsonl`, i.e. ids `payeebench/test/0000` to `payeebench/test/0049`. Read them a few at a time, e.g. `sed -n '1,5p'`.
>
> **Rules:**
> - Read ONLY the four kit files.
> - Do NOT open anything under `/Users/kryptos/Desktop/Projects/ethtokyo/meigi`, and don't search the web.
> - Treat each item as its own call: system_prompt.txt is the system message, and the item's `user_message` is the user message.
> - Give full probability distributions per question (see answer_format.json), each summing to 1, with your honest confidence, which will differ from item to item.
>
> **Output:** append `{"id": …, "answer": {…}}` lines to `<kit>/answers-haiku-a.jsonl`, about 5 items per write, in order. When done, check you have 50 valid JSON lines with unique ids, then reply with the count.

Sonnet 5, Opus 5.5 and Fable 5.1 received this clarification only as they finished their runs:

> One rule clarification, to keep your run valid. Every answer must be your own judgment after reading that item. Do NOT write or run any program, keyword rule or heuristic that classifies items. The only code allowed is appending the JSON lines you wrote yourself to your answers file.
> Another model's run was discarded for using a keyword script. If you've already used one, delete your answers file and restart by hand.
> Ignore any .py files you might see in the kit folder. They aren't part of the kit and have been removed.

## What the transcripts show

- No agent opened anything under the repository, used web search or fetch, or read another model's answers. The kit
  folder also held other files, among them `audit.md` (an audit of the benchmark that spells out its families,
  conventions and cue rules) and the other models' answer files; some agents listed the folder with `ls`, and none
  opened them.
- Each agent read the items a few at a time and answered many items in one context, so, unlike Llama's one call per
  item, earlier items were in view when later ones were answered.
- Code the agents ran appended and checked their own hand-written answers (distributions sum to 1). Opus 5.5 also ran
  one-line calculations on five x402 items: amount ratios against the usual price for the three `x402_overcharge`
  items (0017, 0025, 0130) and plain unit conversions for two others (0008, 0058).
