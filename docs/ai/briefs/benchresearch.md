# benchresearch: Find public benchmarks + open models to add

Agent type `general-purpose`, started Sat 20:53 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

Research task for a paper on PayeeBench-JA, a self-built Japanese-first benchmark for the "System-1" triage model inside Meigi, an AI accounts-payable agent that pays stablecoin invoices. The triage model reads invoices, vendor emails, executive messages and x402 402-responses and answers four questions:
- request type;
- new payment destination (yes/no);
- pressure;
- suspicion 0–3.

It only routes items: auto-clear, or hold for a human. The on-chain kernel decides payments.

The repo is `<workspace>/meigi`. It's read-only for you. See `bench/README.md` and `bench/results/RESULTS.md`.

Our current contenders:
- Kev-0.8B (`jaredpalmer/kev-0.8b`, which is Qwen3.5-0.8B-Base plus LoRA and a pointer head), released and fine-tuned;
- Kev-4B;
- Llama 3.3 70B on Workers AI.

Frontier Claude baselines are being added separately.

The team lead wants external credibility and better-known models. Answer these with verified facts and URLs. If you can't verify something, say so; never invent a dataset, paper, model or number.

1. **Public benchmarks that overlap our task.** Find all you can in each area:
   - business email compromise (BEC) or invoice fraud;
   - payee or bank-account-change fraud;
   - phishing email classification, especially Japanese;
   - indirect prompt injection that redirects payments.

   For each: name, authors, venue and year, URL, license, data format, size, language, how close it is to our four questions, and whether we can run our model on it tonight (a few hours).

   Look specifically at **AgentDojo** (ETH Zurich, NeurIPS 2024): its banking suite and injection tasks that make the agent send money to the attacker. Also look at **InjecAgent** and **BIPIA**, and at any Japanese phishing corpus (e.g. from the Council of Anti-Phishing Japan, or academic JA phishing datasets).

   Recommend the ONE best "external check" we can actually run tonight, with a concrete conversion plan. For example: convert AgentDojo banking injection payloads into our item format and measure how often the model flags new destination or suspicion ≥ 2. List its caveats.
2. **Better-known open models to fine-tune** on an Apple M5 Max with 48 GB unified memory, using MLX (mlx-lm LoRA) or the Kev trainer. Size range 0.6B–8B. Candidates:
   - Qwen3 and Qwen3.5 sizes;
   - Gemma 3 (1B, 4B);
   - Llama 3.2 (1B, 3B);
   - anything newer and well known as of September 2026.

   Verify exact Hugging Face repo IDs and licenses (Gemma and Llama terms), and whether mlx-lm supports them. Estimate LoRA fine-tuning time for 600 short items (about 500 tokens each, 2 epochs) per size on this machine, and state the basis of the estimate.
3. **"Muse" by Meta:** does a Meta model called Muse exist as of September 2026? Are its weights open, and is it on Hugging Face? If it isn't real or isn't open, say so plainly.
4. **Is a "PayeeBench-JA"-like benchmark already published** by anyone? It matters for the novelty claim.

Output a concise report (≤ 2 pages) with a table per question and a clear recommendation: which 2–3 open models to fine-tune overnight, and which external benchmark to run. Put every URL you relied on at the end. Write it to `<scratchpad>/frontier/research.md` and send the summary back.

## Follow-up instructions

### Sat 21:02 JST: Please move your downloads out of the frontier kit folder

Please move the external benchmark downloads out of `scratchpad/frontier/`: agentdojo_*.py, asb/, bipia/, craibench/ and injec/. Put them in `scratchpad/external/`. The frontier folder is a sealed kit that model agents read, and it has to contain only its own files plus the answer files. Leave `research.md` in `frontier/` as planned, or move it too and tell me the path. Thanks.

### Sat 21:43 JST: Great report — run the AgentDojo-derived check on all local contenders

Excellent report. Please run the full AgentDojo-derived check (229 items) on every local contender, using the harness's own p_safe at each model's deployed threshold:
- payee-0.8b, which is already served on :8102;
- payee-4b;
- released Kev-0.8B;
- released Kev-4B.

**Serving rules:**
- Serve the other checkpoints on spare ports, one at a time, and stop each afterwards.
- Never touch :8102's process. Only send it requests.
- The live demo stack stays up. bench also has the GPU tonight for fine-tunes, so coordinate with bench so only one heavy job runs at a time.

**If you can add benign items cheaply,** use PFN japanese-mail-bench (500 benign Japanese emails, Apache-2.0) as a false-positive check for payee-0.8b and payee-4b, with the licence noted.

**Output:** a small results table (per contender: auto-cleared injected items, the new-destination flag rate, the suspicion ≥2 rate, plus a false-positive rate if you add the benign set), the exact commands, and the caveats. Send it to bench, cc me, for the paper. Don't commit into meigi/; bench owns bench/.

Note: your WebSearch quota is spent, so use WebFetch or curl for anything else.

### Sat 21:44 JST: Don't train Gemma — bench owns fine-tunes; you run the AgentDojo check

One adjustment, to avoid two GPU jobs at once: don't run your own Gemma LoRA timing. bench now owns all three fine-tunes (Gemma 4 E2B, Llama 3.2 3B, Qwen3-4B), and your download feeds straight into bench's run. Tell bench where the finished Gemma weights are. Your job tonight is the AgentDojo-derived check on the local contenders (plus the optional benign JA-mail false-positive set), coordinated with bench so only one heavy job runs at a time. audit.md in frontier/ is fine where it is: the frontier runs are all finished.

### Sat 21:48 JST: GPU slot granted now for the two 4B runs

The GPU slot is yours now for the two 4B inference runs, payee-4b and then released Kev-4B, one at a time. Stop each server when it's done, then tell bench the GPU is free, cc me. Nice results so far. payee-0.8b's 8 of 500 benign suspicion flags (1.6%) is exactly the false-positive number the paper needed.
