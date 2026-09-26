# Fine-tuning Q&A (for judges)

Every number here comes from [`bench/README.md`](../bench/README.md) and [`bench/results/RESULTS.md`](../bench/results/RESULTS.md).

## "Why fine-tune a model at all?"

Before the AP agent pays anything, a **System-1 triage model** reads every invoice, e-mail, chat message and x402
response. It answers four typed questions: what kind of request is this, does it pay a new account, is there
pressure to skip checks, and how likely is it a redirection scam. From those answers it routes the document:
- **auto-clear**, straight to the payment kernel;
- **hold**, for a verified human (World ID).

That model has to be:
- **fast and cheap:** it runs on every document, before every payment;
- **calibrated:** the auto-clear decision is "is P(safe) above a threshold?", so the confidence has to be honest;
- **Japanese-first:** 適格請求書, 振込先, 登録番号, 返還インボイス;
- **local:** invoices are private business data.

Off the shelf, nothing fit:
- **The released Kev models** (small open System-1 models) are poor at the question that matters most, suspicion,
  with 0.39 accuracy. They're also miscalibrated, with ECE 0.13, so at a 1% error budget they auto-clear 0% of
  legitimate invoices. A human would have to look at everything.
- **A big LLM** (Llama 3.3 70B) scores 0.815, takes 2 s per document, and is the most gullible to injected
  instructions: 0.29 on invoices hiding a "pay this account instead" instruction.

**Our fine-tune** (`payee-0.8b`) scores:
- 0.918 mean accuracy;
- ECE 0.024;
- 45% of legitimate invoices auto-cleared at a 1% error budget;
- 39 ms per document, on a laptop.

**And it never moves money.** It only decides which invoices a human must look at. Paying the right company is
enforced by the deterministic kernel and the chain: the vault reverts `PayeeMismatch` whatever the model says.

## "What did you fine-tune?"

- **Base:** Kev-0.8B (`jaredpalmer/kev-0.8b`, Apache-2.0). It's built on `Qwen/Qwen3.5-0.8B-Base` with a LoRA adapter
  (rank 16) and a pointer head that answers typed questions (choice, yes/no, 0–3 score) with probabilities.
- **What trains:** the LoRA adapter and the head, 11.3M parameters. The 0.8B backbone stays frozen.
- **Data:** the 600 training items of PayeeBench-JA, our own benchmark.
- **Calibration:** one temperature (T = 1.23), fitted on the 100 validation items.
- **Also tried:** a 4B version. It scored +2.0 points, which isn't significant (p = 0.11), at four times the
  latency, so we ship the 0.8B.

## "How did you fine-tune it?"

| | |
|---|---|
| trainer | Kev's own trainer (`kev.train`), starting from the released checkpoint (`scripts/train_kev.sh`) |
| hardware | our MacBook (M5 Max, 48 GB), PyTorch on MPS, fp32 |
| recipe | 2 epochs, lr 2e-5 (OneCycle), batch 1 × grad-accumulation 8 = 150 optimizer steps, max state 512 tokens |
| time | **39 minutes**, plus 3 minutes to fit the temperature |
| serving | MLX bf16 through `kev.serve` on localhost; the agent calls `/v1/systemone` |
| 4B | 62 min for 1 epoch. The released recipe didn't fit in 48 GB, so we used a bf16 frozen backbone, gradient checkpointing and a 26 GB MPS memory cap |

No test item was used for training, calibration, threshold choice or any recipe decision.

## "What's the benchmark?"

**PayeeBench-JA**, built for this problem:
- **Size:** 850 items: 600 train, 100 validation, 150 test.
- **Language:** about 71% Japanese (604 of 850 items).
- **Families:** 17 of them, including routine 適格請求書, polite and urgent BEC, fake-CEO requests, silently swapped
  振込先, prompt injections hidden in HTML comments or white text, credit notes, and x402 responses.
- **Hard negatives** a naive model gets wrong: an announced, legitimate bank change; an urgent overdue notice to the
  same account; an office relocation notice.
- **Leakage guards:** test uses test-only layouts, phrasings and entities. It shares 0 companies, people or accounts
  with train, and 0 of 90 template choices. Nearest-neighbour text similarity is 0.16 for test, against 0.47 for
  validation.
- **Every identifier is provably fictional:** T-numbers use registry office 9999, which no corporation has. Company
  names are checked against all 5.79M NTA corporate-number records (closed included), and phone numbers use exchanges
  Japan never assigns.

**Metrics:**
- per-question accuracy and macro-F1;
- **ECE** (calibration);
- **the auto-clear rate at a 1% error budget**, with the threshold chosen on validation, as deployed. This is the
  number the product cares about.
- how many unsafe items got through;
- p50/p95 latency;
- cost per 1,000 items.

## "What are the results?"

Test split, 150 items and 600 answers, each model scored once:

| model | mean acc | suspicion | ECE | legit auto-cleared @1% | p50 |
|---|---|---|---|---|---|
| Kev-0.8B released | 0.747 | 0.393 | 0.134 | 0% | 38 ms |
| Kev-4B released | 0.795 | 0.413 | 0.120 | 16% | 169 ms |
| Llama 3.3 70B | 0.815 | 0.560 | 0.076 | (not run on validation) | 2,047 ms |
| **payee-0.8b (ours)** | **0.918** | **0.787** | **0.024** | **45%** | **39 ms** |
| payee-4b (ours) | 0.938 | 0.813 | 0.016 | 67% | 165 ms |

- **Against the released 0.8B:** +17.2 points (95% CI +14.2 to +20.2, McNemar p = 1e-25).
- **Against Kev-4B:** +12.3 points.
- **Against Llama 3.3 70B:** +10.3 points, 50 times faster.

## Questions to expect, and honest answers

- **"Isn't the data synthetic?"**
  - Yes. The test split uses new layouts, phrasings and entities, but the same world model. Real mail is messier:
    OCR noise, threads, attachments.
  - Next step: evaluate on real, consented invoices and set the production threshold there, with a margin.
- **"Did it forget general skills?"**
  - Accuracy held on Kev's own out-of-domain suite (0.651 → 0.637).
  - Calibration there got worse (ECE 0.049 → 0.225).
  - So we serve the fine-tune only for these four questions.
- **"Why not just use GPT or Claude?"**
  - Cost and latency on every document.
  - Privacy: business invoices shouldn't leave the machine.
  - An LLM that reads the document can be steered by it; Llama scored 0.29 on hidden-instruction invoices.
  - Our agent does use an LLM, but only to propose (deliberately gullible) and to explain. The kernel and the chain
    decide.
- **"What about Jev?"** Not run: its hosted endpoint needed credits we didn't have. The harness is ready
  (`--remote jev-worker`).
- **"What does it get wrong?"**
  - It let one unsafe item through: an invoice whose 振込先 moved to another bank under the same account name. That's
    literal comparison, which System-1 models are weak at by design, and it's exactly what the kernel's exact registry
    match catches.
  - The remaining misses are the 0/1 suspicion boundary on new reminder phrasings, and level 2 vs 3 on polite scams.

**One line for stage:** "We fine-tuned a 0.8B model on this MacBook in 39 minutes. It beats a 70B LLM at spotting
payment-redirection scams, at 39 ms, and its confidence is honest enough to let half the legitimate invoices through
untouched. But it still can't move money: only the chain can."
