# bench: PayeeBench-JA + Kev fine-tune

Agent type `oh-my-claudecode:executor`, started Sat 02:49 JST. Written by the lead Claude Code session;
reproduced verbatim except that local paths are shortened to `<workspace>/`.

## Brief

Build PayeeBench-JA and a fine-tuned "System-1" model for Meigi. This is for ETHGlobal Tokyo 2026 on the From Scratch track: everything must be created now, and public libraries/models are fine.

Context:
- Meigi is payee verification for stablecoin and x402 payments in Japan. An AI accounts-payable agent reads invoices, emails and x402 402-responses before paying.
- A cheap, fast, calibrated "System-1" classifier triages every item. Money only moves through a deterministic on-chain check. The classifier never decides money; it routes items (auto-clear vs hold for a human).
- On stage we want to say: "Jev (TypeSafe's new System-1 model) is great; we fine-tuned an open one on this MacBook and it beats Jev on our benchmark", with accuracy, calibration and cost charts.
- Background is in <workspace>/research/IDEA-MEIGI.md, section 5a. Read it.

Assets:
- The Kev repo (Apache-2.0, jaredpalmer/kev) is cloned at <workspace>/kev, with a working uv env (Python 3.13, torch 2.8, MPS available). Read its README, `skills/kev-finetune` (data format + data-generation references), `scripts/compare_typesafe.py` and `jevbench_paired.py`.
  - Train: `uv run python -m kev.train --data train.jsonl --base Qwen/Qwen3.5-0.8B-Base --init_from jaredpalmer/kev-0.8b --device mps --epochs 2 --lr 2e-5 --batch 1 --accum 8 --out runs/payee-0.8b`. Check the actual flags in the repo; fp32 on MPS.
  - Serve: `kev.serve` exposes the same `/v1/systemone` API as TypeSafe's Jev.
- The machine is an M5 Max with 48 GB.

Deliverables, all in <workspace>/meigi/bench/ (a Python project managed with uv; keep model weights and run dirs under bench/runs/, which is git-ignored):

1. **The question set** (the System-1 schema used in the product):
   - `request_type` (choice): routine_invoice, payee_change, urgent_exec_request, credit_note, other
   - `new_destination` (noul): asks to pay a new or different account/address than before
   - `pressure` (noul): urgency, secrecy or authority pressure
   - `suspicion` (score, 4 levels): clearly benign → very likely a payment-redirection scam
2. **Data:**
   - Japanese-first, some English. Genres: Japanese qualified invoices (適格請求書: 登録番号 T+13 digits, 税率ごとの消費税, 振込先 or wallet address), vendor emails ("振込先変更のお知らせ", reminders, credit notes), fake-CEO/BEC messages, x402 402-response JSON with payTo, and prompt-injection text hidden in invoices.
   - Hard negatives are essential: legitimate payee changes announced properly, urgent-but-legit due-date reminders, routine invoices that mention banks/wallets, polite scams without urgency, scams in keigo.
   - **Sizes:** about 600 train + 100 validation + 150 test. Test must use different templates, companies and phrasings than train (no leakage). Record how you guarded against leakage.
   - Label by construction and spot-check. Fictional companies only; T-numbers must pass the 法人番号 check digit (check = 9 − (Σ Pn·Qn mod 9), Pn = the n-th base digit from the right, Qn = 1 for odd n, 2 for even n).
   - Produce Kev's training JSONL format.
3. **Eval harness:** one script that runs any `/v1/systemone`-compatible endpoint over the test set. It reports:
   - accuracy and macro-F1 per question
   - calibration: ECE plus a reliability diagram PNG
   - the auto-clear rate at a 1% error budget, for the question "is this safe to auto-clear?"
   - p50/p95 latency and $/1k items
4. **Contenders:**
   - (a) base jaredpalmer/kev-0.8b, served locally
   - (b) our fine-tuned kev-0.8b; try 4B too if time and memory allow
   - (c) Jev over the Cloudflare REST API `POST https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run` with body `{"model":"typesafe/jev","input":{state,questions}}` and a Bearer token. The account currently has no AI-Gateway credits (HTTP 402). Make it pluggable and skip it gracefully with a clear note; the harness should also accept OpenRouter's decisions endpoint if an OPENROUTER_API_KEY appears.
   - (d) Optional: an LLM with structured output (Claude Haiku) if ANTHROPIC_API_KEY is set; skip otherwise.
   - Never hardcode keys; read them from env or from <workspace>/meigi/.env. Never print them.
5. **Results:** bench/README.md with the dataset card, the results table and charts (bench/results/*.png, clean enough for a pitch slide), training time on the M5 Max, and honest caveats. If the fine-tune doesn't beat the baseline, say so and explain why.

Rules:
- No git commits (I'll commit).
- No secrets in files.
- Python files under 400 lines, functions under 50 lines, no print-debug noise in committed code (use logging).
- Don't touch other folders of the meigi repo except bench/.
- Long jobs (downloads, training) go in the background with logs under bench/runs/. Check on them instead of blocking.

Report back:
- dataset stats
- the results table
- training time
- where the charts are
- what's needed to add the Jev numbers once credits exist

## Follow-up instructions

### Sat 03:17 JST: Jev contender via our Worker proxy

For the Jev contender, use our deployed Worker instead of the Cloudflare REST API.

- `POST $AI_PROXY_URL/v1/systemone` with the header `Authorization: Bearer $AI_PROXY_TOKEN` and body `{ state, questions }`. Both env vars are in meigi/.env; never print the token.
- It returns Jev's native response.
- For now it returns 402 `{code:"insufficient_credits"}` until the user tops up AI Gateway credits. Make the harness skip Jev on 402 with a clear note, so the Jev row can be filled in later with one command.

Also available: `POST $AI_PROXY_URL/v1/chat` (Llama 3.3 70B, OpenAI-style response). It's an optional LLM-with-structured-output contender if you want one without an Anthropic key.

### Sat 04:57 JST: Check dataset T-numbers against national NTA

Important correctness check. We found that a "fictional" fixture T-number (T2010401000001) belongs to a real company (旭紙業株式会社). A valid check digit doesn't mean the number is unassigned.

A nationwide NTA index now exists at meigi/data/nta/corporations.sqlite: 5,787,472 corporations, with a `number` column holding the 13 digits.

Please check every T-number in bench/dataset/*.jsonl, and anywhere else in bench/, against it:
- Report how many match real companies.
- Replace every match with an unassignable number: use registry-office code 9999 in the base, i.e. digits "9999" + 8 more, with a valid check digit (T8999900000001 and T7999900000002 are examples). Keep the check digit valid and keep items consistent across the train/val/test splits and the leakage rules.
- Re-run the checks that depend on T-numbers.

The model doesn't need retraining if only T-numbers change; say if you disagree. The dataset is committed and will be public, so this matters. Don't commit; tell me when it's done.
