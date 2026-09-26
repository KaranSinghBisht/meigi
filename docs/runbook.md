# Runbook

Everything runs from the repo root, with secrets in a git-ignored `.env` (never commit it). The services bind
127.0.0.1 by default (`VERIFIER_HOST`, `AGENT_HOST`, `X402_DEMO_HOST`), so the venue network can't reach them.

## Live deployment (Sepolia)

| Contract | Address |
|---|---|
| PayeeRegistry | `0x205c977cF1f4Ed42e51a48759550eF40160A6396` (from block 11781105) |
| PayeeResolver (parent `payee.eth`) | `0x096ebC07eE87fbb19FF920a5c81b2Ad5c9104A1e` |
| PayRouter | `0xbA95BA5D4a2244cce46a76920f411B225116850C` |
| MockJPYC (`mJPYC`) | `0xEcA2B093682a46B14b143474d188A120bA2d0EC2` |
| AgentVault | `0x87A798CD92dE1340B1b761dd45196AC82bEF793B` |

This is deployment v2: the registry, resolver, router and vault were all redeployed after the first two
security-review rounds (only MockJPYC is unchanged); a third round mutation-tested those fixes and needed no redeploy.
v1 (`deployments/11155111-v1.json`) is retired. Later, on 2026-09-26, the resolver alone was redeployed so that disputed
payees publish their status and the `meigi.tNumber` / `meigi.registry` pointers, never a claimant's name or payout. `payee.eth` points at it on both ENSv2 deployments; the
previous resolver `0xe3Fa…25dA` is unused.
All are verified on Sourcify. Timelocks: 72h for payout changes, rotations and dispute resolutions; in the vault, 1h before a new vendor, a new
payout or raised caps apply (lowered caps apply at once).

**Mizuhiki (Awaji testnet, chain 6497):** deployed on 2026-09-26 (blocks 2387847–2387849): PayeeRegistry
`0x4dbF8b5C3da46996C156AC3d17B16a230387b7C4` and PayRouter `0x589E7f274Cd5E87d71443993AC30b39E2E70659e`, paying in
Mizuhiki's predeployed MJPY, with the same 72h change delay. No AgentVault or ENS on Awaji. Registrations, real MJPY and
MUSD router payments, a refused payment and a live x402 purchase are in `docs/mizuhiki.md`, with every tx hash.

Demo fixtures, fictional companies marked as such in their on-chain evidence:
- `T2011001234567` 株式会社メイギ商事: the AP-agent vendor. The vault approves it with caps of ¥500k per invoice and ¥1M per 30 days.
- `T8999900000001` 株式会社フジデータ: the x402 demo's dataset merchant (invoice-OCR training data). Registry
  office 9999 doesn't exist, so no real company can ever hold this number.
- `T6999900000003` 株式会社ミナトGPUクラウド: the x402 demo's GPU-compute merchant (inference and GPU-minutes).
  Same office-9999 fixture pattern; registered via `contracts/script/seed-demo.sh`.
- `T3999905000001` 合同会社ベイサイド・アドバイザリー: the fake-CEO example's payee. It is registered but deliberately
  **not** approved in the vault, so the agent holds it and a forced payment reverts `VendorNotApproved`
  (registered on 2026-09-26 in `0xdd058c9f…b5af`).
- `T2010401000001` is **frozen by a dispute** (on-chain status `Disputed`). It was registered in error: the number
  belongs to a real company (旭紙業株式会社). So it pays nothing and resolves to nothing. Never reuse it.
- Fixture numbers and names were checked against the nationwide NTA data (all 5,787,472 corporate-number records,
  closed included): none of these fixtures exists.

## ENS

`payee.eth` is registered on both Sepolia ENSv2 deployments, and both point at the v2 PayeeResolver:
- **ENSv2 Beta** (the official deployment; viem's default Sepolia Universal Resolver `0xeEeE…EeEe`). Stock viem
  and ethers 6.17 resolve `t2011001234567.payee.eth` with no configuration, and ENS's app and explorer show it.
- **Hackathon deployment** (Universal Resolver proxy `0xd26f2040D083Af1cD2962ba303F4BEa0c4faf142`).

Check: `EXPECT_ADDR=0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4 contracts/script/ens/ens.sh check`
(set `ENS_DEPLOYMENT=beta` for the Beta). Scripts and details: `contracts/script/ens/README.md`.

### The agent's ENS mandate goes live (MandateGate)

Only after Karan's video, and only on the lead's word. The demo must never depend on the gate being healthy.

1. **Order.**
   1. ens commits the gate's constructor check (efd4574), and contracts-review passes it.
   2. ens runs `ens.sh mandate-deploy` (it asserts the wiring), then `ens.sh mandate-wire`: the owner makes the gate
      the vault's agent.
   3. Set these in the root `.env`:
      - `SIGNER_VIA_GATE=1`;
      - `MANDATE_GATE_ADDRESS=<the gate>`;
      - `MANDATE_PRINCIPAL=4999900000005`;
      - `SEPOLIA_RPC_FALLBACK_URL=https://sepolia.gateway.tenderly.co`.

      Then restart the pair: `scripts/ap-stack.sh --stop && SIGNER_VERIFY_APPROVAL=1 scripts/ap-stack.sh`. The
      signer refuses to start unless the gate is the vault's agent, forwards to this vault, enforces
      `ap.t4999900000005.payee.eth` and names its key.
   4. `curl -s localhost:8796/health` shows `"via":"gate"`, and `curl -s localhost:8788/vault` shows the mandate
      `live: true`.
2. **The live rehearsal spends as little as possible.** It uses ¥1,100 invoices from Meigi Shoji in their own series,
   MS-2026-72xx, and never the numbers of 01 or 07. Run it with `pnpm --filter @meigi/agent mandate:rehearsal`:
   1. `run 01`: paid through the gate (**tx A**).
   2. `analyze 02`, and keep its id.
   3. ens runs `ens.sh mandate-revoke` (**tx B**).
   4. `pay <id>` holds `mandate_not_live`, and `analyze 03` holds at analysis. `audit` shows the `signer.simulate`
      entry with `MandateNotLive`, and nothing was broadcast.
   5. ens runs `ens.sh mandate-issue` (**tx C**).
   6. `run 04`: paid through the gate again (**tx D**).

   It costs ¥2,200. The 30-day cap has ¥828,500 left after the 07 rehearsal, and judging, the finalist stage and
   one retry need ¥561,000.
3. **Evidence for the ENS judges** (a short section of `docs/ens.md`): tx A (sent to the gate; the vault emits
   `InvoicePaid`), tx B, the audit entry with the `MandateNotLive` simulation, tx C and tx D.
4. **Don't run `ens.sh agent-rotate` while the gate is wired.** It refuses, because the vault's agent is the gate. To
   change the agent's key, Haruka issues `ap.t4999900000005.payee.eth` to the new key (`ens.sh mandate-revoke`, then
   `MANDATE_HOLDER=<new key> ens.sh mandate-issue`). Or unwire first.
5. **Rollback, if anything is off:** ens runs `ens.sh mandate-unwire`, which hands the vault back to the key. Set
   `SIGNER_VIA_GATE=0`, restart the pair, and tell the lead. `/health` then shows `"via":"vault"`. The signer won't
   start while the flag and the chain disagree, so a half-done rollback shows up at once.

## Services

| Port | Service | Start |
|---|---|---|
| 8787 | verifier (attester) | `pnpm --filter @meigi/verifier start` |
| 8796 | Signer: the only process with the agent key (`.env.signer`); signs `payInvoice` only | started by `scripts/ap-stack.sh` |
| 8788 | AP agent: no key; pays through the signer | `scripts/ap-stack.sh` starts and supervises the signer, then the agent; `--stop` stops both; `--pause-signer` and `--resume-signer` stop and restart the signer alone (demo check 10) |
| 8790 | x402 demo (merchant + facilitator + guarded buyer) | `pnpm --filter @meigi/x402-demo start` |
| 8102 | System-1 triage: our fine-tuned payee-0.8b (`kev.serve`) | see `bench/README.md` |
| 11434 | Agent LLM: Ollama with `gemma4:e4b` (`LLM_PROVIDER=local`) | `ollama serve` (the model is pulled once with `ollama pull gemma4:e4b`) |
| 5173 | web app | `pnpm --filter @meigi/web dev` |
| — | landing | `pnpm dev:landing` |

**Live World ID officer demo.** `scripts/world-live.sh --yes` restarts the verifier on World ID production with
Selfie Check and starts a matching web server on :5190. It prints the click path (fictional company
`T7999900000002`). `--staging` puts both back and `--stop` stops them. It only stops servers it started itself,
so replacing the hand-started verifier needs `--yes`.

**RPC resilience.** A hackathon venue shares one IP address across hundreds of hackers; publicnode has already
answered with 403s to this machine under that load. Set `SEPOLIA_RPC_FALLBACK_URL` (optional) and the verifier's
reads (registry state, transaction receipts) retry on it whenever the primary `SEPOLIA_RPC_URL` errors. Writes -
the attester's register/dispute/cancel/rotation transactions - don't get this automatically: the tx is signed
locally first, so its hash is known before any network call; if the send itself fails at the transport level, the
verifier checks whether either RPC already has that hash before reporting failure, rather than blindly re-sending
an already-broadcast signed transaction to the other one. Code: `services/verifier/src/registry/chain.ts`
(`readTransportFor`, `sendKnown`).

**Verifier anti-squatting limits.** A T-number and its exact legal name are public, so the verifier limits how
much one human or one client can claim. Contracts are unchanged. Fictional fixtures (office 9999) are exempt from
all of this, so demos repeat.
- **Per World ID officer:** at most 3 companies (`officer_limit`) and 8 officers per company (`too_many_officers`).
  At most one claim per T-number that is open, queued, held or disputed (`duplicate_open_registration`). All are
  409. An unsubmitted registration expires after `VERIFIER_OPEN_REGISTRATION_HOURS` (24). After that it no longer
  counts, and submitting it answers 410.
  - **Limit:** these are keyed on the enrolled World ID *session*. The wizard creates a new session at every
    enrollment, so a person who starts over is not tied to their earlier sessions.
  - **Fix:** tie the limits to the person with a World ID uniqueness proof (a fixed action) at enrollment.
- **No repeat disputes:** a payee that is already disputed on-chain gets no second dispute (409 `already_disputed`).
  A second dispute would only drop governance's queued resolution and restart the freeze.
- **Per client IP, per hour** (429 `rate_limited` with `Retry-After`; 0 turns a limit off):
  - `VERIFIER_RATE_REGISTRATIONS_PER_HOUR` (10) counts new registrations, including failed NTA matches;
  - `VERIFIER_RATE_DISPUTES_PER_HOUR` (3) counts disputes filed;
  - `VERIFIER_RATE_OBJECTIONS_PER_HOUR` (10) counts objections;
  - `VERIFIER_RATE_DOMAIN_PER_HOUR` (20) counts `POST /registrations/:id/domain`: a real outbound DNS/HTTPS fetch
    to the registration's own domain, on every call, even once it's already verified. Fixtures are exempt (no
    real fetch is ever made for them);
  - `VERIFIER_RATE_NTA_PER_HOUR` (120), `VERIFIER_RATE_PAYEES_PER_HOUR` (60) and `VERIFIER_RATE_RP_CONTEXT_PER_HOUR`
    (120) cover the public read-only lookups (`GET /nta/:tNumber`, `/payees/:tNumber`, `/world/rp-context`);
  - `VERIFIER_RATE_LEI_PER_HOUR` (30) covers `GET /lei/:lei`, which proxies GLEIF - a third party we don't want
    to hammer on a caller's behalf either;
  - `VERIFIER_RATE_OFFICERS_PER_HOUR` (20) counts `POST /registrations/:id/officers`, and
    `VERIFIER_RATE_INTENTS_PER_HOUR` (20) counts `POST /intents` and `/intents/:id/approve` together (one shared
    budget) - both call World's real verify API, and both defaults are sized generously for a live demo.
  Behind exactly one reverse proxy of ours (e.g. cloudflared or nginx), set `VERIFIER_TRUST_PROXY=1`: the IP is
  then the rightmost `X-Forwarded-For` entry, the one our proxy appended.
- **Public pending window:** `VERIFIER_PENDING_HOURS` defaults to 0, so the demo submits at once. Use 24-72 in
  production. When it is set:
  - a non-fixture registration that passes every check is queued, and submit answers 202 `pending_public_window`;
  - the queue is listed at `GET /registrations/pending` (no officer data or wallets);
  - anyone can flag a queued registration with `POST /registrations/:publicId/object` (`{ reason, contact? }`),
    and a flagged one is held for manual review;
  - the attester submits the rest once their window passes.
  Review held registrations with `pnpm --filter @meigi/verifier exec tsx scripts/review-pending.ts` (`list`,
  `release <publicId>`, `reject <publicId>`).

The AI proxy (Workers AI chat + Jev) is deployed at `https://meigi-ai-proxy.karanbishttt.workers.dev`
(`workers/ai-proxy`) and needs `AI_PROXY_TOKEN`. It keeps a hard daily budget, so the account's paid plan never bills:
- at most 200 calls and 6,000 neurons per UTC day, inside the free 10,000; after that it answers 429;
- `GET /v1/budget`, with the token, shows today's spend.

The AP agent doesn't need the proxy: triage (Kev) and the LLM (Ollama) run on this machine.

## Re-seeding

```sh
bash contracts/script/seed-demo.sh        # fixture vendors, vault funding, vendor approval; every step is skipped when already done
```

`seed-demo.sh` passes testnet keys to `cast` on the command line, where local `ps` can see them. Run it only on
a trusted single-user machine; the ENS scripts and forge scripts read keys from the environment instead.

## Governance rules (read before touching the registry as owner)

- **`dismissDispute` is not an undo.** It keeps whatever was live when the dispute was filed, including a
  redirect that had already landed. Use it only to clear a bogus claim. A dispute about a redirect that
  already landed needs `resolveDispute` (72h, payee frozen).
- **Revoking an attester is permanent.** It also voids legitimate changes still inside their 72h window;
  those businesses must re-request. Register the replacement verifier key (a new address) *before* revoking
  the only attester. v2 has exactly one: `0x3D5F314C30E77CC6f3677C5409FdC91e83510493`.
- If the business key is stolen *and* an officer is phished, only an attester or governance can cancel the
  thief's queued payout change. Watch `PayoutChangeRequested` and `ControllerRotationRequested`.
- **Company-issued ENS names** (CompanyNamespace `0x7ECaD5Fd6892270F09D91aB296786186C5bC660A`, `docs/ens.md`): to take
  one down, Meigi uses `setBlocked` or `setFrozen`, never a plain unregister, because the company can re-issue an
  unregistered name at once. Any controller rotation, even a legitimate one, darkens that company's issued names
  until the new key re-issues them.

## Demo checks (five minutes before judging)

The live demo runs on http://localhost:5190 (`scripts/world-live.sh`): registration, the AP console (`/agent`) and `/demo`, all served from the main tree. The agent and verifier must allow that origin (`APP_ORIGINS` in `.env` includes http://localhost:5190). Never demo from an old `vite preview` build.

1. `curl localhost:8787/payees/T2011001234567`: the fixture vendor is active.
2. `curl localhost:8788/health`: `signer` is `ok`, `triage` lists `systemone` (Kev on :8102). `screening` is true once
   `INTERCEPTA_API_KEY` is set. Kev and Ollama have no `/health` route of their own, so a 404 there doesn't mean
   they're down; this agent check covers both.
3. Warm up a few minutes before the slot: run one Analyze on any invoice (the first local-model call after idle is
   markedly slower), and run one withdrawal check on `/business` (about 5 s cold, 2 s warm).
4. `curl -X POST localhost:8790/scenario/research-agent`: about a minute, and it spends about ¥60 of test mJPYC.
   The compromised GPU mirror is refused before signing, because its `payTo` isn't Minato's registered payout. With
   an Intercepta key, the flagged undeclared scrape is refused as `screened`. The registered purchases settle.
   (The old `/demo/*` routes are gone: they answer 404.)
5. In the AP console, load the bank-change email:
   - The agent's LLM proposes paying `0xdCa5…6d5b`, and the kernel holds.
   - "Let the agent pay anyway" reverts `PayeeMismatch` in simulation, names 株式会社メイギ商事, and broadcasts
     nothing.
   - The prompt-injection invoice can't be forced at all (tampering). Use the bank-change email or the x402
     response for the on-chain moment.
6. The registry explorer shows `t2011001234567.payee.eth` → `0x9B4f…47e4`.
7. **World ID for Agents.** The Sepolia agent's approver was enrolled on 2026-09-26, in Karan's Brave browser, in
   the sandbox: the first approval ran with `WORLD_AGENTS_ENROLL=1` and is written to the git-ignored
   `data/agent/approvers.json`. Approve in that same browser and the agent reports `matched`.
   - To show the other paths: "Deny sign-in" pays nothing. A different browser profile is a different human
     (`wrong_human`).
   - Use a fresh invoice number each time. A paid number holds as already paid, and that hold isn't
     approvable.
8. Don't press Pay on the routine invoice before the demo: it auto-clears and pays for real, which uses up its
   invoice number.
9. A live run spends the numbers of invoices 01 and 07. Between two live runs (judging, then the finalist stage), run
   `pnpm --filter @meigi/agent demo:renumber` once (`--dry-run` to preview): it moves a spent number to the next one
   no document uses and the vault hasn't paid, and the console picks it up without a restart. The 30-day cap for
   the fixture vendor fits four full runs (checked on-chain on 2026-09-26).
10. **The agent holds no key: stop the signer and it can't pay.** Stop the signer alone; the agent stays up.
    - `scripts/ap-stack.sh --pause-signer` takes about a second. The signer process exits and its supervisor keeps it
      down, so nothing listens on :8796. `curl localhost:8788/health` then shows `"signer":"unreachable"`.
    - Press Pay on an invoice that auto-clears, or run
      `curl -s -X POST -H 'content-type: application/json' -d '{}' localhost:8788/invoices/<id>/pay`. The agent
      answers at once: 503 `signer_unavailable`, "The signer isn't answering, and the agent holds no key of its own:
      nothing was signed or sent." The console shows that sentence. The call fails at the simulation, before any
      `/pay`, so the key's nonce doesn't move and the audit log gets no `signer.*` entry.
    - `scripts/ap-stack.sh --resume-signer` takes a few seconds: the signer starts with the same checks as at boot,
      and Pay now pays. That payment spends the invoice's number like any live one (item 9).
    - Only a pair started by this version of the script can pause (it writes `.omc/state/ap-stack.signer`). On an
      older pair, `--pause-signer` refuses and stops nothing: restart the pair first. `--stop` also clears a pause.
    - Don't pause during a payment, and don't spend a World ID approval while paused: the Pay fails and the approval
      is used up. After a resume, make any approval at least a minute later: with `SIGNER_VERIFY_APPROVAL=1`, the
      signer refuses approvals made before, or within 60 s of, its start.
    - Not `kill -STOP`: a stopped signer still accepts connections, so Pay hangs for 30 s. If the stop lands
      mid-payment, the queued `/pay` goes through after `kill -CONT`, after the agent has reported a failure.
