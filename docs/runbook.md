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

This is deployment v2, after two security-review rounds. v1 (`deployments/11155111-v1.json`) is retired.
The resolver was redeployed on 2026-09-26 so that disputed payees publish only their status, not a claimant's
name. `payee.eth` points at it on both ENSv2 deployments; the previous resolver `0xe3Fa…25dA` is unused.
All are verified on Sourcify. Timelocks: 72h for payout changes, rotations and dispute resolutions; 1h for new vendors.

**Mizuhiki (Awaji testnet, chain 6497):** not deployed yet - a first attempt was blocked on the PoW faucet
(one session per IP, no reconnect) before the deployer address got any gas. See `docs/mizuhiki.md`.

Demo fixtures, fictional companies marked as such in their on-chain evidence:
- `T2011001234567` 株式会社メイギ商事: the AP-agent vendor. The vault approves it with caps of ¥500k per invoice and ¥1M per 30 days.
- `T8999900000001` 株式会社フジデータ: the x402 demo's dataset merchant (invoice-OCR training data). Registry
  office 9999 doesn't exist, so no real company can ever hold this number.
- `T6999900000003` 株式会社ミナトGPUクラウド: the x402 demo's GPU-compute merchant (inference and GPU-minutes).
  Same office-9999 fixture pattern; registered via `contracts/script/seed-demo.sh`.
- `T3999905000001` 合同会社ベイサイド・アドバイザリー: the fake-CEO example's payee. It is registered but deliberately
  **not** approved in the vault, so the agent holds it and a forced payment reverts `VendorNotApproved`
  (registered on 2026-09-26 in `0xdd058c9f…b5af`).
- `T2010401000001` is **retired**. It was registered in error: the number belongs to a real company
  (旭紙業株式会社). It is frozen by a dispute, so it pays nothing and resolves to nothing. Never reuse it.
- Fixture numbers and names were checked against the nationwide NTA data (5,787,472 corporations): none of these
  fixtures exists.

## ENS

`payee.eth` is registered on both Sepolia ENSv2 deployments, and both point at the v2 PayeeResolver:
- **ENSv2 Beta** (the official deployment; viem's default Sepolia Universal Resolver `0xeEeE…EeEe`). Any ENS
  client resolves `t2011001234567.payee.eth` with no configuration.
- **Hackathon deployment** (Universal Resolver proxy `0xd26f2040D083Af1cD2962ba303F4BEa0c4faf142`).

Check: `EXPECT_ADDR=0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4 contracts/script/ens/ens.sh check`
(set `ENS_DEPLOYMENT=beta` for the Beta). Scripts and details: `contracts/script/ens/README.md`.

## Services

| Port | Service | Start |
|---|---|---|
| 8787 | verifier (attester) | `pnpm --filter @meigi/verifier start` |
| 8788 | AP agent | `pnpm --filter @meigi/agent start` |
| 8790 | x402 demo (merchant + facilitator + guarded buyer) | `pnpm --filter @meigi/x402-demo start` |
| 8102 | System-1 triage: our fine-tuned payee-0.8b (`kev.serve`) | see `bench/README.md` |
| 11434 | Agent LLM: Ollama with `gemma4:e4b` (`LLM_PROVIDER=local`) | `ollama serve` (the model is pulled once with `ollama pull gemma4:e4b`) |
| 5173 | web app | `pnpm --filter @meigi/web dev` |
| — | landing | `pnpm dev:landing` |

**Live World ID officer demo.** `scripts/world-live.sh --yes` restarts the verifier on World ID production with
Selfie Check and starts a matching web server on :5190. It prints the click path (fictional company
`T7999900000002`). `--staging` puts both back and `--stop` stops them. It only stops servers it started itself,
so replacing the hand-started verifier needs `--yes`.

**Verifier anti-squatting limits.** A T-number and its exact legal name are public, so the verifier limits how
much one human or one client can claim. Contracts are unchanged; fictional fixtures (office 9999) are exempt from
the per-human limits and the window.
- **Per World ID officer** (the enrolled session): officer of at most 3 companies, and at most 1 open registration
  per T-number (`officer_limit`, `duplicate_open_registration`, both 409). An unsubmitted registration expires after
  `VERIFIER_OPEN_REGISTRATION_HOURS` (24); after that it no longer counts and can't be submitted (410).
- **Per client IP**, per hour (429 `rate_limited` with `Retry-After`; 0 turns a limit off):
  - `VERIFIER_RATE_REGISTRATIONS_PER_HOUR` (10) counts new registrations;
  - `VERIFIER_RATE_DISPUTES_PER_HOUR` (3) counts disputes filed;
  - `VERIFIER_RATE_OBJECTIONS_PER_HOUR` (10) counts objections.
  Behind a reverse proxy you run, set `VERIFIER_TRUST_PROXY=1` so the IP comes from `CF-Connecting-IP` or
  `X-Forwarded-For`.
- **Public pending window:** `VERIFIER_PENDING_HOURS` defaults to 0, so the demo submits at once. Use 24-72 in
  production. When it is set:
  - a non-fixture registration that passes every check is queued, and submit answers 202 `pending_public_window`;
  - the queue is listed at `GET /registrations/pending` (no officer data or wallets);
  - anyone can flag a queued registration with `POST /registrations/:publicId/object` (`{ reason, contact? }`),
    and a flagged one waits for manual review;
  - the attester submits the rest once their window passes.
  Objections are in the `objections` table of `VERIFIER_DB_PATH`.

The AI proxy (Workers AI chat + Jev) is deployed at `https://meigi-ai-proxy.karanbishttt.workers.dev`
(`workers/ai-proxy`) and needs `AI_PROXY_TOKEN`.

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

## Demo checks (five minutes before judging)

1. `curl localhost:8787/payees/T2011001234567`: the fixture vendor is active.
2. `curl localhost:8788/health`: `triage` lists `systemone` (Kev on :8102). `screening` is true once
   `INTERCEPTA_API_KEY` is set.
3. `curl localhost:8790/demo/compromised`: refused before signing (`payto_mismatch`). With an Intercepta key,
   `/demo/unverified-flagged` is refused as `screened`.
4. In the AP console, load the bank-change email:
   - The agent's LLM proposes paying `0xdCa5…6d5b`, and the kernel holds.
   - "Let the agent pay anyway" reverts `PayeeMismatch` in simulation, names 株式会社メイギ商事, and broadcasts
     nothing.
   - The prompt-injection invoice can't be forced at all (tampering). Use the bank-change email or the x402
     response for the on-chain moment.
5. The registry explorer shows `t2011001234567.payee.eth` → `0x9B4f…47e4`.
6. **World ID for Agents.** The Sepolia agent's approver was enrolled on 2026-09-26, in Karan's Brave browser, in
   the sandbox: the first approval ran with `WORLD_AGENTS_ENROLL=1` and is written to the git-ignored
   `data/agent/approvers.json`. Approve in that same browser and the agent reports `matched`.
   - To show the other paths: "Deny sign-in" pays nothing. A different browser profile is a different human
     (`wrong_human`).
   - Use a fresh invoice number each time. A paid number holds as already paid, and that hold isn't
     approvable.
7. Don't press Pay on the routine invoice before the demo: it auto-clears and pays for real, which uses up its
   invoice number.
