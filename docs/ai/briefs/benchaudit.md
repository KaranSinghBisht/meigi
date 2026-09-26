# benchaudit: Independent audit of the benchmark and fine-tune

Agent type `oh-my-claudecode:verifier`, started Sat 20:54 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

You are the independent auditor for PayeeBench-JA and the payee-0.8b fine-tune in `<workspace>/meigi/bench/`. The team is about to write a paper on them and must not overclaim. Karan, the team lead, asked bluntly: "did we do it properly, or is it bullshit?" Answer that with evidence.

Everything here is read-only: don't edit or commit anything in the repo, and don't retrain. You may run the benchmark's own scoring and statistics scripts, and tests, but only in a temporary git worktree of HEAD (`git worktree add`). Remove it after. Never run anything in the main tree. Don't use the GPU for training.

Audit:
1. **Leakage.**
   - Are the test templates, entities and phrasings really disjoint from train? Check the README's leakage table (sentences shared with train) yourself with a script over `dataset/*.jsonl`.
   - Look for near-duplicate items across splits, e.g. with an n-gram Jaccard measure.
   - Can any `_meta` or field in the test state reveal the label?
2. **Labels.**
   - Sample at least 40 test items across all 17 families. For each, judge whether the four labels (request type, new destination, pressure, suspicion 0–3) are defensible from the text alone.
   - Report the disagreement rate and examples.
   - Are any families trivially separable by a surface cue, e.g. an address pattern that always means suspicion 3?
3. **Evaluation correctness.**
   - Recompute accuracy, ECE and "auto-clear at 1% budget" for payee-0.8b and one baseline from `results/predictions/`, and confirm they match `results/results.json` and README.md.
   - Check the confidence intervals and paired tests (method, n, clustering by item) are computed correctly.
   - Check the 1% threshold was chosen on validation, not test.
4. **Fairness of comparisons.**
   - Did Llama 3.3 70B get the same information as Kev (question strings, criteria, output format)?
   - Is the "+10.3 points over Llama 70B" claim fair, and what caveats does it need?
   - Is "released Kev vs fine-tuned Kev" a fair base-model comparison?
5. **Method description.**
   - From the training scripts and run records (`scripts/train_kev.sh`, `results/runs/*.json`), state exactly what training was done: SFT with LoRA plus a pointer head? Which data, epochs, learning rate, and the calibration step?
   - Is it RL in any sense? It should be no; confirm.
   - Is anything in README.md about the method inaccurate?
6. **Cost claims.** Is the $/1k-items arithmetic right, and are its assumptions stated (60 W, electricity price, token counts, the Workers AI list price for Llama)?
7. **Reproducibility.** Could an outsider rerun it from the repo? What's missing?

Report:
- a verdict per area (SOUND / SOUND WITH CAVEATS / PROBLEM), with evidence (file:line, script output);
- the top issues ranked;
- the exact caveat sentences the paper must include;
- a one-paragraph "audit we ran on ourselves" draft for the paper, in plain, honest language.

Write it to `<scratchpad>/frontier/audit.md` and send the summary back.

## Follow-up instructions
